# WarrantyVault Contract Tests

Comprehensive test suite for the WarrantyVault smart contract on GenLayer studionet.

## Overview

This test suite covers all contract functionality including:

- **Create Warranty** - Creating warranties with various parameters
- **File Claim** - Filing claims with evidence
- **Adjudicate Claim** - AI-powered claim adjudication
- **Release Escalated Funds** - 7-day timeout mechanism for ESCALATE verdicts
- **View Functions** - Data retrieval and verification
- **Error Handling** - Edge cases and validation

## Prerequisites

1. **Python 3.10+**
   - The suite uses modern syntax (e.g. `str | None` annotations, built-in
     generics). Check with: `python --version`

2. **pytest (optional)**
   - Not required — both `run_tests.sh` and the standalone runner use
     `python tests/test_warranty_vault.py`, which needs **no third-party
     packages at all** (`genlayer_client.py` is pure Python standard library).
   - Install pytest only if you want to run the suite through it yourself:
     ```bash
     pip install pytest
     ```

3. **Deploy the Contract**
   - Go to [GenLayer Studio](https://studio.genlayer.com)
   - Deploy `contracts/warranty_vault.py` on studionet
   - Copy the contract address

4. **Set CONTRACT_ADDRESS**
   The test runner looks up the contract address in this order:
   1. `CONTRACT_ADDRESS` environment variable
   2. `VITE_CONTRACT_ADDRESS` environment variable
   3. `CONTRACT_ADDRESS` in a `contracts/.env` file (auto-loaded)
   4. the `CONTRACT_ADDRESS` constant in `tests/test_warranty_vault.py`

   Any of the following works:
   ```bash
   # Option A: export in your shell
   export CONTRACT_ADDRESS=0xyour_contract_address

   # Option B: contracts/.env file (auto-loaded by the test runner)
   echo "CONTRACT_ADDRESS=0xyour_contract_address" > contracts/.env

   # Option C: VITE_CONTRACT_ADDRESS (also used by the frontend)
   export VITE_CONTRACT_ADDRESS=0xyour_contract_address
   ```

5. **Fund Your Wallet**
   - Get GEN tokens from the Accounts panel in Studio
   - Ensure you have enough for gas fees

## Test Scenarios

### 1. Create Warranty Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| `create_warranty_valid` | Create warranty with valid parameters | Returns warranty ID |
| `create_warranty_short_duration` | Create warranty with 30-day duration | Returns warranty ID |
| `create_warranty_long_duration` | Create warranty with 5-year duration | Returns warranty ID |
| `create_warranty_zero_amount` | Create warranty with 0 GEN deposit | Error: "Deposit amount must be greater than 0" |
| `create_warranty_empty_policy` | Create warranty with empty policy URL | Returns warranty ID (no policy) |

### 2. File Claim Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| `file_claim_valid` | File claim with evidence URLs | Returns claim ID |
| `file_claim_already_claimed` | File claim on CLAIMED warranty | Error: "Warranty is not active" |
| `file_claim_nonexistent` | File claim on non-existent warranty | Error: "Warranty not found" |
| `file_claim_expired_warranty` | File claim on expired warranty | Error: "Warranty has expired" |

### 3. Adjudicate Claim Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| `adjudicate_claim_ai` | Adjudicate claim via AI consensus | Returns verdict (COVERED/PARTIAL/REJECTED/ESCALATE) |
| `get_claim_after_adjudicate` | Verify claim details post-adjudication | Status = ADJUDICATED, verdict populated |
| `adjudicate_already_done` | Adjudicate already adjudicated claim | Error: "Claim already adjudicated" |

### 4. Release Escalated Funds Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| `release_before_adjudicate` | Release before adjudication | Error: "Claim must be adjudicated first" |
| `release_before_timeout` | Release before 7-day timeout | Error: "Timeout not reached" |
| `release_after_timeout` | Release after 7-day timeout | Funds split 50/50 |
| `release_non_escalate` | Release non-ESCALATE claim | Error: "Only ESCALATE claims can be released" |

### 5. View Function Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| `get_all_warranties` | Retrieve all warranties | Returns object with warranty data |
| `get_all_claims` | Retrieve all claims | Returns object with claim data |
| `get_warranty_by_id` | Retrieve specific warranty | Returns warranty details |
| `get_claim_by_id` | Retrieve specific claim | Returns claim details |

### 6. Error Handling Tests

| Test ID | Description | Expected Result |
|---------|-------------|-----------------|
| `get_nonexistent_warranty` | Get non-existent warranty | Error: "Warranty not found" |
| `get_nonexistent_claim` | Get non-existent claim | Error: "Claim not found" |

## Running the Tests

### Option 1: Python Tests (Recommended)

The Python suite (`test_warranty_vault.py`) now ships with a self-contained
JSON-RPC client (`genlayer_client.py`) that talks to a deployed GenLayer
contract directly — no browser or MetaMask needed. It uses only the Python
standard library and mirrors the official `genlayer-js` protocol
(`gen_call` for reads, `addTransaction` + `eth_sendTransaction`/
`eth_sendRawTransaction` for writes).

```bash
cd contracts
# Point it at your deployed contract:
export CONTRACT_ADDRESS=0x...
python tests/test_warranty_vault.py
```

Exit code is `0` when all scenarios pass and `1` otherwise (so it can be used
in CI).

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONTRACT_ADDRESS` | — (required) | Address of the deployed WarrantyVault contract. Falls back to `VITE_CONTRACT_ADDRESS`, then a `contracts/.env` file. |
| `GENLAYER_CHAIN` | `studionet` | Chain preset: `studionet` (id 61999) or `asimov` (id 4221). Sets RPC URL, chain id, and consensus contract. |
| `RPC_URL` | preset default | Override the JSON-RPC endpoint. |
| `CHAIN_ID` | preset default | Override the chain id used when signing transactions. |
| `CONSENSUS_CONTRACT` | preset default | Override the GenLayer consensus main contract address. |
| `PRIVATE_KEY` | — | Hex private key for signing transactions locally. When set, `FROM_ADDRESS` is derived from the key automatically. |
| `FROM_ADDRESS` | zero address | Account used as the transaction sender / `from` for reads. |

Example — headless writes against the Asimov testnet (no browser):

```bash
cd contracts
GENLAYER_CHAIN=asimov PRIVATE_KEY=0x... CONTRACT_ADDRESS=0x... \
  python tests/test_warranty_vault.py
```

> **Note on studionet writes:** reads work headless on studionet, but
> `eth_sendTransaction` on `studio.genlayer.com` is only accepted from a
> browser with a logged-in Studio session (it is handled by MetaMask in the
> JS suite). For fully headless writes, deploy to the Asimov testnet and fund
> the `PRIVATE_KEY` account with GEN tokens.

### Option 2: JavaScript Tests (Browser)

1. Open GenLayer Studio or your local dev environment
2. Open browser console
3. Run:
   ```javascript
   import WarrantyVaultTester from './tests/test_warranty_vault.js';
   const tester = new WarrantyVaultTester();
   await tester.init();
   await tester.runAllTests();
   ```

### Option 3: Manual Testing via Frontend

1. Run the frontend: `cd warrantyvault && npm run dev`
2. Connect MetaMask to studionet
3. Manually test each function through the UI

## Test Data

### Sample Policy URLs

```
electronics: https://raw.githubusercontent.com/nicholasgasior/gist/master/warranty-policy-example.txt
general: https://example.com/general-warranty-policy.txt
```

### Sample Evidence URLs

```
defect: https://imgur.com/a/example1
conflicting: https://imgur.com/a/example2
```

## Verdict Scenarios

### Expected AI Verdicts

| Evidence Type | Expected Verdict | Reason |
|---------------|------------------|--------|
| Clear defect, valid policy | COVERED | Claim clearly within policy |
| Partial damage, user-caused | PARTIAL | Some coverage applies |
| Out of warranty scope | REJECTED | Not covered by policy |
| Conflicting/unclear evidence | ESCALATE | Insufficient confidence |

## ESCALATE Release Mechanism

When a claim receives an ESCALATE verdict:

1. Funds remain locked in the contract
2. After 7 days (604,800 seconds), either party can call `release_escalated_funds`
3. Funds are split 50/50 between claimer and warranty creator
4. Claim status changes to RELEASED

### Time Calculation

```
ESCALATE_TIMEOUT = 604800 seconds = 7 days

time_elapsed = current_timestamp - adjudicated_at
if time_elapsed >= ESCALATE_TIMEOUT:
    # Funds can be released
```

## Troubleshooting

### Common Issues

1. **`run_tests.sh` says "No working Python interpreter found"**
   - The script tries `python3` then `python`, verifying each one actually runs.
   - Install Python 3.10+ or ensure `python`/`python3` is on your PATH.
   - No pytest installation is required: the script runs the standalone suite
     (`python tests/test_warranty_vault.py`) and shows its full output.

2. **"Deposit amount must be greater than 0"**
   - Ensure you're sending GEN tokens with the transaction

3. **"Warranty is not active"**
   - Warranty may already have a claim filed (status = CLAIMED)

4. **"Warranty has expired"**
   - Check the warranty duration and current timestamp

5. **"Claim already adjudicated"**
   - Claims can only be adjudicated once

6. **"Timeout not reached"**
   - ESCALATE releases require 7 days to pass after adjudication

### Debug Mode

To enable debug logging:

```javascript
// In your test script
console.log("Warranty data:", await tester.getWarranty(warrantyId));
console.log("Claim data:", await tester.getClaim(claimId));
```

## Contributing

When adding new tests:

1. Follow the existing naming convention: `test_<function>_<scenario>`
2. Include both success and failure scenarios
3. Add test data to README.md
4. Update this documentation

## License

MIT
