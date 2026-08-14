"""
genlayer_client.py
==================
A minimal, dependency-free GenLayer JSON-RPC client for interacting with
deployed GenLayer intelligent contracts (e.g. `contracts/warranty_vault.py`)
from Python.

It faithfully mirrors the protocol implemented by the official
`genlayer-js` SDK (https://www.npmjs.com/package/genlayer-js):

  * Reads  -> ``gen_call`` with ``{"type": "read", ...}``
  * Writes -> calldata is wrapped in an ``addTransaction(...)`` call to the
              chain's consensus main contract, sent via ``eth_sendTransaction``
  * Calldata is encoded with GenLayer's custom ULEB128 + type-tag serialization
    and RLP-wrapped (exactly like ``genlayer-js``'s ``calldata`` / ``transactions``)
  * Transaction status is polled until it reaches a decided state

Only the Python standard library is used (``urllib``, ``json``, ``hashlib``).
Keccak-256 (required for the EVM function selector) is implemented inline so
no third-party package is needed.

Usage
-----
    from genlayer_client import GenLayerClient

    client = GenLayerClient(
        rpc_url="https://studio.genlayer.com/api",
        from_address="0x0000000000000000000000000000000000000000",
    )
    client.read_contract(address, "get_all_warranties", [])
    client.write_contract(address, "create_warranty", [policy, product, duration], value=10**18)
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import urllib.request
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Keccak-256 (pure Python, FIPS 202 padding variant used by Ethereum/GenLayer)
# ---------------------------------------------------------------------------

_KECCAK_ROUND_CONSTANTS = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]

_KECCAK_ROTATION_OFFSETS = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
]

_MASK64 = (1 << 64) - 1


def _rol64(x: int, n: int) -> int:
    return ((x << n) | (x >> (64 - n))) & _MASK64


def _keccak_f1600(state: list) -> None:
    """Apply the Keccak-f[1600] permutation to a 25-lane state in place."""
    for rc in _KECCAK_ROUND_CONSTANTS:
        # Theta
        c = [state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20] for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rol64(c[(x + 1) % 5], 1) for x in range(5)]
        for x in range(5):
            for y in range(5):
                state[x + 5 * y] ^= d[x]
        # Rho + Pi
        b = [0] * 25
        for x in range(5):
            for y in range(5):
                b[y + 5 * ((2 * x + 3 * y) % 5)] = _rol64(state[x + 5 * y], _KECCAK_ROTATION_OFFSETS[x][y])
        # Chi
        for x in range(5):
            for y in range(5):
                state[x + 5 * y] = b[x + 5 * y] ^ ((~b[(x + 1) % 5 + 5 * y]) & b[(x + 2) % 5 + 5 * y])
        # Iota
        state[0] ^= rc


def keccak256(data: bytes) -> bytes:
    """Return the Keccak-256 digest of ``data`` (Ethereum-style, not NIST SHA3)."""
    rate = 136  # bytes per block for a 256-bit output (1600 - 2*256 bits)
    state = [0] * 25

    # Absorb full blocks
    full, rem = divmod(len(data), rate)
    for i in range(full):
        block = data[i * rate:(i + 1) * rate]
        for j in range(0, rate, 8):
            state[j // 8] ^= int.from_bytes(block[j:j + 8], "little")
        _keccak_f1600(state)

    # Absorb final block with Keccak padding: 0x01 ... 0x80
    padded = bytearray(data[full * rate:])
    padded.append(0x01)
    padded.extend(b"\x00" * (rate - rem - 1))
    padded[-1] |= 0x80
    for j in range(0, rate, 8):
        state[j // 8] ^= int.from_bytes(padded[j:j + 8], "little")
    _keccak_f1600(state)

    # Squeeze 32 bytes
    out = bytearray()
    for j in range(0, 32, 8):
        out += state[j // 8].to_bytes(8, "little")
    return bytes(out[:32])


# ---------------------------------------------------------------------------
# secp256k1 ECDSA (pure Python; deterministic RFC 6979 k) for signing
# legacy EVM transactions so headless writes work on public testnets
# ---------------------------------------------------------------------------

_P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
_G = (
    0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
    0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8,
)


def _mod_inv(a: int, m: int) -> int:
    """Modular inverse via the extended Euclidean algorithm."""
    a %= m
    t, new_t = 0, 1
    r, new_r = m, a
    while new_r:
        q = r // new_r
        t, new_t = new_t, t - q * new_t
        r, new_r = new_r, r - q * new_r
    return t % m


def _point_add(p1, p2):
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    x1, y1 = p1
    x2, y2 = p2
    if x1 == x2 and (y1 + y2) % _P == 0:
        return None
    if p1 == p2:
        lam = (3 * x1 * x1) * _mod_inv(2 * y1, _P) % _P
    else:
        lam = (y2 - y1) * _mod_inv((x2 - x1) % _P, _P) % _P
    x3 = (lam * lam - x1 - x2) % _P
    y3 = (lam * (x1 - x3) - y1) % _P
    return (x3, y3)


def _point_mul(k: int, point=_G):
    result = None
    addend = point
    while k:
        if k & 1:
            result = _point_add(result, addend)
        addend = _point_add(addend, addend)
        k >>= 1
    return result


def _rfc6979_k(priv: int, msg_hash: bytes) -> int:
    """Deterministic nonce per RFC 6979 (HMAC-SHA256), like noble/viem."""
    qlen = _N.bit_length()
    blen = len(msg_hash) * 8
    v = b"\x01" * 32
    k = b"\x00" * 32
    x_bytes = priv.to_bytes(32, "big")

    def bits2int(b: bytes) -> int:
        i = int.from_bytes(b, "big")
        if blen > qlen:
            i >>= blen - qlen
        return i

    def h(key: bytes, data: bytes) -> bytes:
        return hmac.new(key, data, hashlib.sha256).digest()

    k = h(k, v + b"\x00" + x_bytes + msg_hash)
    v = h(k, v)
    k = h(k, v + b"\x01" + x_bytes + msg_hash)
    v = h(k, v)
    while True:
        v = h(k, v)
        candidate = bits2int(v)
        if 1 <= candidate < _N:
            return candidate
        k = h(k, v + b"\x00")
        v = h(k, v)


def sign_message_hash(msg_hash: bytes, priv: int) -> tuple:
    """ECDSA-sign a 32-byte message hash.

    Returns ``(r, s, recid)`` with low-s normalization (EIP-2). The recovery
    id is taken directly from the nonce point, matching viem/@noble.
    """
    z = int.from_bytes(msg_hash, "big")
    while True:
        k = _rfc6979_k(priv, msg_hash)
        nonce_point = _point_mul(k)
        x = nonce_point[0]
        r = x % _N
        if r == 0:
            continue
        s = _mod_inv(k, _N) * (z + r * priv) % _N
        if s == 0:
            continue
        # EIP-2: use the low-s form
        if s > _N // 2:
            s = _N - s
        # Recovery id convention (libsecp256k1 / noble / viem):
        # bit0 = y parity of the nonce point, bit1 = whether x >= n.
        recid = (1 if (nonce_point[1] & 1) else 0) | (2 if x >= _N else 0)
        return r, s, recid


def private_key_to_address(priv: bytes) -> str:
    """Derive the 0x-prefixed address from a 32-byte private key."""
    pub = _point_mul(int.from_bytes(priv, "big"))
    pub_bytes = b"\x04" + pub[0].to_bytes(32, "big") + pub[1].to_bytes(32, "big")
    return "0x" + keccak256(pub_bytes[1:])[-20:].hex()


def sign_legacy_transaction(
    nonce: int,
    gas_price: int,
    gas: int,
    to: str,
    value: int,
    data: bytes,
    private_key: bytes,
    chain_id: int,
) -> str:
    """Build and sign an EIP-155 legacy transaction. Returns the 0x hex RLP."""
    fields = [nonce, gas_price, gas, bytes.fromhex(to[2:]), value, data]
    # EIP-155 signing hash: include chainId, 0, 0 in the signed payload
    signing_payload = fields + [chain_id, 0, 0]
    msg_hash = keccak256(rlp_encode(signing_payload))
    r, s, recid = sign_message_hash(msg_hash, int.from_bytes(private_key, "big"))
    v = chain_id * 2 + 35 + recid
    signed = fields + [v, r, s]
    return "0x" + rlp_encode(signed).hex()


# ---------------------------------------------------------------------------
# GenLayer calldata codec  (ported 1:1 from genlayer-js src/abi/calldata)
# ---------------------------------------------------------------------------

BITS_IN_TYPE = 3
TYPE_SPECIAL = 0
TYPE_PINT = 1
TYPE_NINT = 2
TYPE_BYTES = 3
TYPE_STR = 4
TYPE_ARR = 5
TYPE_MAP = 6

SPECIAL_NULL = 0 << BITS_IN_TYPE | TYPE_SPECIAL
SPECIAL_FALSE = 1 << BITS_IN_TYPE | TYPE_SPECIAL
SPECIAL_TRUE = 2 << BITS_IN_TYPE | TYPE_SPECIAL
SPECIAL_ADDR = 3 << BITS_IN_TYPE | TYPE_SPECIAL


def _write_num(out: list, data: int) -> None:
    """Unsigned LEB128 varint (genlayer-js ``writeNum``)."""
    if data == 0:
        out.append(0)
        return
    while data > 0:
        cur = data & 0x7F
        data >>= 7
        if data > 0:
            cur |= 0x80
        out.append(cur)


def _encode_num_with_type(out: list, data: int, type_: int) -> None:
    _write_num(out, (data << BITS_IN_TYPE) | type_)


def _encode_num(out: list, data: int) -> None:
    if data >= 0:
        _encode_num_with_type(out, data, TYPE_PINT)
    else:
        _encode_num_with_type(out, -data - 1, TYPE_NINT)


def _compare_key(a: list, b: list) -> int:
    """Compare two lists of Unicode code points (genlayer-js ``compareString``)."""
    for x, y in zip(a, b):
        if x != y:
            return -1 if x < y else 1
    return -1 if len(a) < len(b) else (1 if len(a) > len(b) else 0)


def _encode_map(out: list, entries: list) -> None:
    """``entries`` is a list of (key, value) pairs; keys sorted by code points."""
    new_entries = [
        ([ord(ch) for ch in key], key.encode("utf-8"), value)
        for key, value in entries
    ]
    new_entries.sort(key=lambda e: e[0])
    for i in range(1, len(new_entries)):
        if _compare_key(new_entries[i - 1][0], new_entries[i][0]) == 0:
            raise ValueError(f"duplicate key {new_entries[i][1]!r}")
    _encode_num_with_type(out, len(new_entries), TYPE_MAP)
    for _, key_bytes, value in new_entries:
        _write_num(out, len(key_bytes))
        out.extend(key_bytes)
        _encode_impl(out, value)


def _encode_impl(out: list, data: Any) -> None:
    if data is None:
        out.append(SPECIAL_NULL)
        return
    if data is True:
        out.append(SPECIAL_TRUE)
        return
    if data is False:
        out.append(SPECIAL_FALSE)
        return
    if isinstance(data, int):
        _encode_num(out, data)
        return
    if isinstance(data, str):
        raw = data.encode("utf-8")
        _encode_num_with_type(out, len(raw), TYPE_STR)
        out.extend(raw)
        return
    if isinstance(data, (bytes, bytearray)):
        _encode_num_with_type(out, len(data), TYPE_BYTES)
        out.extend(data)
        return
    if isinstance(data, (list, tuple)):
        _encode_num_with_type(out, len(data), TYPE_ARR)
        for item in data:
            _encode_impl(out, item)
        return
    if isinstance(data, dict):
        _encode_map(out, list(data.items()))
        return
    raise TypeError(f"unsupported calldata type: {type(data).__name__}")


def make_calldata_object(method: Optional[str] = None, args: Optional[list] = None,
                         kwargs: Optional[dict] = None) -> dict:
    """Build the calldata object exactly like genlayer-js ``makeCalldataObject``."""
    ret: dict = {}
    if method:
        ret["method"] = method
    if args:
        ret["args"] = list(args)
    if kwargs:
        ret["kwargs"] = dict(kwargs)
    return ret


def encode_calldata(method: Optional[str] = None, args: Optional[list] = None,
                    kwargs: Optional[dict] = None) -> bytes:
    """Encode a contract call into GenLayer calldata bytes."""
    out: list = []
    _encode_impl(out, make_calldata_object(method, args, kwargs))
    return bytes(out)


def _read_uleb128(data: bytes, index: list) -> int:
    res = 0
    accum = 0
    while True:
        byte = data[index[0]]
        index[0] += 1
        rest = byte & 0x7F
        res += rest << accum
        accum += 7
        if byte < 0x80:
            return res


def decode_calldata(data: bytes) -> Any:
    """Decode a GenLayer calldata value back into Python objects."""
    index = [0]

    def impl() -> Any:
        cur = _read_uleb128(data, index)
        if cur == SPECIAL_NULL:
            return None
        if cur == SPECIAL_TRUE:
            return True
        if cur == SPECIAL_FALSE:
            return False
        if cur == SPECIAL_ADDR:
            addr = data[index[0]:index[0] + 20]
            index[0] += 20
            return "0x" + addr.hex()
        type_ = cur & ((1 << BITS_IN_TYPE) - 1)
        rest = cur >> BITS_IN_TYPE
        if type_ == TYPE_BYTES:
            raw = data[index[0]:index[0] + rest]
            index[0] += rest
            return raw
        if type_ == TYPE_PINT:
            return rest
        if type_ == TYPE_NINT:
            return -1 - rest
        if type_ == TYPE_STR:
            raw = data[index[0]:index[0] + rest]
            index[0] += rest
            return raw.decode("utf-8")
        if type_ == TYPE_ARR:
            result = []
            for _ in range(rest):
                result.append(impl())
            return result
        if type_ == TYPE_MAP:
            result = {}
            for _ in range(rest):
                str_len = _read_uleb128(data, index)
                key = data[index[0]:index[0] + str_len].decode("utf-8")
                index[0] += str_len
                result[key] = impl()
            return result
        raise ValueError(f"can't decode type {type_} rest {rest} at pos {index[0]}")

    res = impl()
    if index[0] != len(data):
        raise ValueError("some data left after decoding")
    return res


# ---------------------------------------------------------------------------
# Minimal RLP encoder (subset used by genlayer-js ``transactions.serialize``
# plus legacy EVM transaction encoding)
# ---------------------------------------------------------------------------


def rlp_encode_bytes(data: bytes) -> bytes:
    if len(data) == 1 and data[0] < 0x80:
        return data
    if len(data) < 0x38:  # 56
        return bytes([0x80 + len(data)]) + data
    len_bytes = len(data).to_bytes((len(data).bit_length() + 7) // 8, "big")
    return bytes([0x80 + 0x37 + len(len_bytes)]) + len_bytes + data


def _rlp_encode_int(item: int) -> bytes:
    if item == 0:
        return b"\x80"
    return rlp_encode_bytes(item.to_bytes((item.bit_length() + 7) // 8, "big"))


def rlp_encode(item: Any) -> bytes:
    """RLP-encode lists / byte strings / integers (viem ``toRlp`` subset)."""
    if isinstance(item, (list, tuple)):
        payload = b"".join(rlp_encode(i) for i in item)
        if len(payload) < 0x38:
            return bytes([0xC0 + len(payload)]) + payload
        len_bytes = len(payload).to_bytes((len(payload).bit_length() + 7) // 8, "big")
        return bytes([0xC0 + 0x37 + len(len_bytes)]) + len_bytes + payload
    if isinstance(item, bool):
        raise TypeError("RLP does not support booleans")
    if isinstance(item, int):
        return _rlp_encode_int(item)
    if isinstance(item, (bytes, bytearray)):
        return rlp_encode_bytes(bytes(item))
    raise TypeError(f"unsupported RLP item: {type(item).__name__}")


def serialize_calldata(calldata: bytes, leader_only: bool = False) -> bytes:
    """RLP-wrap calldata with the leaderOnly flag (genlayer-js ``transactions.serialize``)."""
    return rlp_encode([calldata, b"\x01" if leader_only else b"\x00"])


# ---------------------------------------------------------------------------
# Minimal Solidity ABI encoder for ``addTransaction`` (viem encodeFunctionData)
# ---------------------------------------------------------------------------

_ADDRESS_ABI = "address"
_UINT256_ABI = "uint256"
_BYTES_ABI = "bytes"


def _abi_encode(selector: bytes, types: list, args: list) -> bytes:
    """ABI-encode a call with static head + dynamic tail (supports trailing ``bytes``)."""
    head = bytearray()
    tail = bytearray()
    for t, a in zip(types, args):
        if t == _ADDRESS_ABI:
            if isinstance(a, str) and a.startswith("0x"):
                a = a[2:]
            head += int(a, 16).to_bytes(32, "big")
        elif t == _UINT256_ABI:
            head += int(a).to_bytes(32, "big")
        elif t == _BYTES_ABI:
            head += (32 * len(types) + len(tail)).to_bytes(32, "big")
            tail += len(a).to_bytes(32, "big")
            tail += a + b"\x00" * ((32 - len(a) % 32) % 32)
        else:
            raise ValueError(f"unsupported ABI type {t}")
    return selector + bytes(head) + bytes(tail)


def encode_add_transaction(sender: str, recipient: str, num_validators: int,
                           max_rotations: int, tx_data: bytes,
                           valid_until: Optional[int] = None) -> bytes:
    """ABI-encode ``addTransaction`` for the consensus main contract.

    Mirrors ``genlayer-js`` ``ADD_TRANSACTION_ABI_V5`` / ``ADD_TRANSACTION_ABI_V6``.
    """
    if valid_until is None:
        sig = b"addTransaction(address,address,uint256,uint256,bytes)"
        selector = keccak256(sig)[:4]
        return _abi_encode(selector, [_ADDRESS_ABI, _ADDRESS_ABI, _UINT256_ABI, _UINT256_ABI, _BYTES_ABI],
                           [sender, recipient, num_validators, max_rotations, tx_data])
    sig = b"addTransaction(address,address,uint256,uint256,bytes,uint256)"
    selector = keccak256(sig)[:4]
    return _abi_encode(selector, [_ADDRESS_ABI, _ADDRESS_ABI, _UINT256_ABI, _UINT256_ABI, _BYTES_ABI, _UINT256_ABI],
                       [sender, recipient, num_validators, max_rotations, tx_data, valid_until])


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

# studionet defaults (from genlayer-js chains/studionet.ts)
STUDIONET_RPC_URL = "https://studio.genlayer.com/api"
STUDIONET_CHAIN_ID = 61999
STUDIONET_CONSENSUS_CONTRACT = "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575"
STUDIONET_NUM_VALIDATORS = 5
STUDIONET_MAX_ROTATIONS = 3

# public testnet (genlayer-js chains/testnetAsimov.ts)
ASIMOV_RPC_URL = "https://rpc-asimov.genlayer.com"
ASIMOV_CHAIN_ID = 4221
ASIMOV_CONSENSUS_CONTRACT = "0x4A4449E617F8D10FDeD0b461CadEf83939E821A5"

# Named chain presets: GENLAYER_CHAIN=studionet|asimov
CHAIN_PRESETS = {
    "studionet": {
        "rpc_url": STUDIONET_RPC_URL,
        "chain_id": STUDIONET_CHAIN_ID,
        "consensus_contract": STUDIONET_CONSENSUS_CONTRACT,
    },
    "asimov": {
        "rpc_url": ASIMOV_RPC_URL,
        "chain_id": ASIMOV_CHAIN_ID,
        "consensus_contract": ASIMOV_CONSENSUS_CONTRACT,
    },
}

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

# Statuses considered terminal-and-successful when waiting for a transaction.
_DECIDED_STATUSES = {"ACCEPTED", "EXECUTED", "FINALIZED"}
# Statuses that indicate the transaction execution failed / was rejected.
_FAILED_STATUSES = {"REJECTED", "FAILED", "INVALID", "CANCELLED", "PENDING_FAILED"}


class GenLayerClient:
    """Minimal GenLayer JSON-RPC client (genlayer-js compatible protocol)."""

    def __init__(
        self,
        rpc_url: str = STUDIONET_RPC_URL,
        from_address: Optional[str] = None,
        num_validators: int = STUDIONET_NUM_VALIDATORS,
        max_rotations: int = STUDIONET_MAX_ROTATIONS,
        consensus_contract: str = STUDIONET_CONSENSUS_CONTRACT,
        timeout: float = 60.0,
        private_key: Optional[str] = None,
        chain_id: int = STUDIONET_CHAIN_ID,
    ) -> None:
        self.rpc_url = rpc_url
        self.chain_id = chain_id
        self.num_validators = num_validators
        self.max_rotations = max_rotations
        self.consensus_contract = consensus_contract
        self.timeout = timeout
        self.private_key: Optional[bytes] = None
        if private_key:
            key = private_key[2:] if private_key.startswith("0x") else private_key
            self.private_key = bytes.fromhex(key)
            self.from_address = from_address or private_key_to_address(self.private_key)
        else:
            self.from_address = from_address or ZERO_ADDRESS

    # -- JSON-RPC -----------------------------------------------------------

    def _request(self, method: str, params: list) -> Any:
        body = json.dumps({"jsonrpc": "2.0", "id": int(time.time() * 1000), "method": method, "params": params}).encode("utf-8")
        # Studio's Cloudflare protection rejects scripts that send a default
        # urllib User-Agent (HTTP 403, error 1010). Sending a standard browser
        # User-Agent mirrors what a browser (and thus genlayer-js) sends.
        req = urllib.request.Request(
            self.rpc_url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Accept": "*/*",
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
                ),
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raise GenLayerError(f"{method} HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}") from e
        except urllib.error.URLError as e:
            raise GenLayerError(f"{method} network error: {e.reason}") from e
        if "error" in payload and payload["error"] is not None:
            err = payload["error"]
            raise GenLayerError(f"{method} failed: {err.get('message', err)}")
        return payload.get("result")

    # -- Reads --------------------------------------------------------------

    def read_contract(self, address: str, function_name: str, args: Optional[list] = None) -> Any:
        """Call a view function via ``gen_call`` and return the decoded value."""
        calldata = encode_calldata(function_name, args)
        serialized = serialize_calldata(calldata, leader_only=False)
        request_params = {
            "type": "read",
            "to": address,
            "from": self.from_address,
            "data": "0x" + serialized.hex(),
            "transaction_hash_variant": "latest-nonfinal",
        }
        result = self._request("gen_call", [request_params])
        data_hex = _extract_gen_call_result(result)
        if data_hex in ("0x", ""):
            return ""  # empty result
        return decode_calldata(bytes.fromhex(data_hex[2:]))

    # -- Writes -------------------------------------------------------------

    def write_contract(self, address: str, function_name: str, args: Optional[list] = None,
                       value: int = 0) -> dict:
        """Submit a state-changing call through the consensus contract.

        Returns the transaction info dict once the transaction reaches a
        decided state. Raises ``GenLayerError`` (with the contract revert
        message when available) if execution fails.
        """
        calldata = encode_calldata(function_name, args)
        serialized = serialize_calldata(calldata, leader_only=False)
        encoded_v5 = encode_add_transaction(
            self.from_address, address, self.num_validators, self.max_rotations, serialized
        )
        valid_until = int(time.time()) + 3600
        encoded_v6 = encode_add_transaction(
            self.from_address, address, self.num_validators, self.max_rotations, serialized, valid_until
        )

        tx_hash = None
        last_error: Optional[Exception] = None
        for encoded in (encoded_v5, encoded_v6):
            try:
                tx_hash = self._send_transaction(encoded, value)
                break
            except GenLayerError as e:
                last_error = e
                if not _is_abi_mismatch(str(e)):
                    raise
        if tx_hash is None:
            raise GenLayerError(f"addTransaction failed with both ABI variants: {last_error}")

        return self.wait_for_transaction(tx_hash)

    def _send_transaction(self, encoded_data: bytes, value: int = 0) -> str:
        nonce = self.get_current_nonce(self.from_address, block="pending")
        try:
            estimated_gas = self._request("eth_estimateGas", [{
                "from": self.from_address,
                "to": self.consensus_contract,
                "data": "0x" + encoded_data.hex(),
                "value": "0x" + f"{value:x}",
            }])
        except GenLayerError:
            estimated_gas = 200000
        gas_price = None
        try:
            gas_price = self._request("eth_gasPrice", [])
        except GenLayerError:
            pass

        if self.private_key is not None:
            return self._send_raw_transaction(nonce, estimated_gas, gas_price, encoded_data, value)

        # Studio / wallet-delegated path (used by genlayer-js with an injected
        # provider; studio.genlayer.com does not accept this from headless scripts).
        tx_request = {
            "from": self.from_address,
            "to": self.consensus_contract,
            "data": "0x" + encoded_data.hex(),
            "value": "0x" + f"{value:x}",
            "gas": _to_hex_quantity(estimated_gas),
            "nonce": _to_hex_quantity(nonce),
            "type": "0x0",
            "chainId": "0x" + f"{self.chain_id:x}",
        }
        if gas_price:
            tx_request["gasPrice"] = gas_price if isinstance(gas_price, str) and gas_price.startswith("0x") else _to_hex_quantity(gas_price)
        try:
            return self._request("eth_sendTransaction", [tx_request])
        except GenLayerError as e:
            if "method not found" in str(e).lower():
                raise GenLayerError(
                    "eth_sendTransaction is not available on this RPC from a headless script. "
                    "Studionet only accepts writes through a browser/MetaMask Studio session "
                    "(use the JS suite). For headless writes, deploy to Asimov and set "
                    "GENLAYER_CHAIN=asimov plus PRIVATE_KEY=0x... (funded account)."
                ) from e
            raise

    def _send_raw_transaction(self, nonce: int, estimated_gas: Any, gas_price: Any,
                              encoded_data: bytes, value: int) -> str:
        """Sign a legacy EIP-155 transaction locally and broadcast it."""
        if gas_price is None:
            gas_price = 1_000_000_000  # 1 gwei fallback
        signed = sign_legacy_transaction(
            nonce=nonce,
            gas_price=int(gas_price, 16) if isinstance(gas_price, str) else int(gas_price),
            gas=int(estimated_gas),
            to=self.consensus_contract,
            value=value,
            data=encoded_data,
            private_key=self.private_key,  # type: ignore[arg-type]
            chain_id=self.chain_id,
        )
        return self._request("eth_sendRawTransaction", [signed])

    def get_current_nonce(self, address: str, block: str = "pending") -> int:
        result = self._request("eth_getTransactionCount", [address, block])
        return int(result, 16) if isinstance(result, str) else int(result)

    # -- Transaction status -------------------------------------------------

    def wait_for_transaction(self, tx_hash: str, status: str = "ACCEPTED",
                             interval: float = 3.0, retries: int = 40) -> dict:
        """Poll until the transaction reaches a decided state.

        Returns the transaction info dict. Raises ``GenLayerError`` when the
        transaction execution fails (including contract revert messages).
        """
        last_status: Optional[dict] = None
        for _ in range(retries):
            tx = self._get_transaction(tx_hash)
            last_status = tx
            state = _tx_status_name(tx)
            if state in _DECIDED_STATUSES or state == status:
                _raise_if_failed(tx, tx_hash)
                return tx
            if state in _FAILED_STATUSES:
                _raise_if_failed(tx, tx_hash)
            time.sleep(interval)
        raise GenLayerError(
            f'Timed out waiting for transaction {tx_hash} to reach status "{status}" '
            f"(last status: {_tx_status_name(last_status) if last_status else 'unknown'})."
        )

    def _get_transaction(self, tx_hash: str) -> dict:
        """Fetch transaction info, trying the candidate GenLayer status methods."""
        last_error = None
        for method in ("gen_getTransactionStatus", "sim_getTransactionStatus", "gen_getTransaction"):
            try:
                result = self._request(method, [tx_hash])
                if result is None:
                    continue
                return result if isinstance(result, dict) else {"status": result}
            except GenLayerError as e:
                last_error = e
                continue
        raise GenLayerError(
            f"No transaction status RPC available on {self.rpc_url}; cannot wait for {tx_hash}. "
            f"Last error: {last_error}"
        )


def _extract_gen_call_result(result: Any) -> str:
    """Mirror genlayer-js ``extractGenCallResult``."""
    if isinstance(result, str):
        return "0x" + result if not result.startswith("0x") else result
    if isinstance(result, dict) and "data" in result:
        obj = result
        status = obj.get("status")
        if isinstance(status, dict) and status.get("code") not in (None, 0):
            raise GenLayerError(f"gen_call failed: {status.get('message')}")
        data = obj["data"]
        return "0x" + data if not str(data).startswith("0x") else str(data)
    raise GenLayerError(f"Unexpected gen_call response: {json.dumps(result)}")


def _tx_status_name(tx: dict) -> str:
    for key in ("statusName", "status", "txStatus", "state"):
        value = tx.get(key)
        if isinstance(value, str) and value:
            return value.upper()
        if isinstance(value, int):
            # Decided statuses are 3 (ACCEPTED) and 4 (EXECUTED) in
            # genlayer-js status enums; anything >= 3 counts as decided.
            if value >= 3:
                return "EXECUTED"
            return {0: "PENDING", 1: "PENDING", 2: "PENDING"}.get(value, "PENDING")
    return "PENDING"


def _raise_if_failed(tx: dict, tx_hash: str) -> None:
    status = _tx_status_name(tx)
    execution_result = tx.get("txExecutionResult") if isinstance(tx, dict) else None
    if status in _FAILED_STATUSES or (execution_result is not None and int(execution_result) != 0):
        message = None
        for key in ("status_message", "message", "reason", "error"):
            value = tx.get(key) if isinstance(tx, dict) else None
            if value:
                message = str(value)
                break
        raise GenLayerError(
            f"Transaction {tx_hash} failed ({status}): {message or 'execution failed'}"
        )


def _is_abi_mismatch(message: str) -> bool:
    lowered = message.lower()
    return (
        "invalid pointer" in lowered
        or "could not decode" in lowered
        or "invalid arrayify" in lowered
        or "length mismatch" in lowered
    )


def _to_hex_quantity(value: Any) -> str:
    if isinstance(value, str) and value.startswith("0x"):
        return value
    return "0x" + f"{int(value):x}"


class GenLayerError(Exception):
    """Raised for GenLayer RPC / contract execution errors."""
