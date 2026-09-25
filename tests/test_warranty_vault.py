"""
Unit and Integration Test Suite for WarrantyVault GenLayer Contract (v2 - Milestone 2)
Tests:
- AI Verdict & Confidence Extraction
- Fail-Closed Trusted ISO-8601 Runtime Timestamps
- On-Chain Expiry Validation (Fail-Closed)
- Staked Consumer Appeal Tribunal Flow
- Merchant Trust Score & Tier Reputation Engine
- 7-Day Challenge Window & Uncontested Escrow Settlement
- Pull-Payment Safety Vault
"""

import unittest
import json
import os
import sys
from types import ModuleType

# Mock genlayer module if not installed in local python environment
if "genlayer" not in sys.modules:
    gl_mock = ModuleType("genlayer")
    gl_mock.allow_storage = lambda cls: cls
    gl_mock.Address = lambda val: val
    gl_mock.bigint = int
    gl_mock.u256 = int
    gl_mock.TreeMap = dict
    gl_mock.UserError = Exception
    
    class MockPublic:
        @staticmethod
        def view(fn):
            return fn
            
        class Write:
            def __call__(self, fn):
                return fn
            @staticmethod
            def payable(fn):
                return fn
        write = Write()
        
    class MockMessage:
        sender_address = "0x2222222222222222222222222222222222222222"
        value = 1000000000000000000

    class MockTargetContract:
        @staticmethod
        def emit_transfer(value):
            return True

    class MockGL:
        class Contract:
            pass
        public = MockPublic()
        message = MockMessage()
        message_raw = {"datetime": "2026-09-07T12:00:00Z"}
        class VM:
            @staticmethod
            def run_nondet(leader_fn, validator_fn):
                return leader_fn()
        vm = VM()

        @staticmethod
        def get_contract_at(addr):
            return MockTargetContract()
        
    gl_mock.gl = MockGL()
    gl_mock.UserError = Exception
    sys.modules["genlayer"] = gl_mock

# Add contracts directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "contracts")))

from warranty_vault import Warranty, MerchantReputation, Contract, UserError

class TestWarrantyVaultContract(unittest.TestCase):

    def setUp(self):
        import genlayer
        self.contract = Contract()
        self.contract.warranties = {}
        self.contract.merchants = {}
        self.contract.pending_withdrawals = {}
        self.contract.next_warranty_id = 0
        genlayer.gl.message.sender_address = "0x2222222222222222222222222222222222222222"
        genlayer.gl.message.value = 1000000000000000000
        genlayer.gl.message_raw = {"datetime": "2026-09-07T12:00:00Z"}

    # 1. AI Parsing and Consensus Tests
    def test_parse_json_from_llm_clean(self):
        sample = '{"verdict": "COVERED", "confidence": 95, "reason": "Valid claim"}'
        parsed = self.contract._parse_llm_json(sample)
        self.assertEqual(parsed["verdict"], "COVERED")
        self.assertEqual(parsed["confidence"], 95)

    def test_effective_verdict_high_confidence(self):
        sample = {"verdict": "COVERED", "confidence": 80}
        self.assertEqual(self.contract._effective_verdict(sample), "COVERED")

    def test_effective_verdict_low_confidence_escalates(self):
        sample = {"verdict": "COVERED", "confidence": 40}
        self.assertEqual(self.contract._effective_verdict(sample), "ESCALATE")

    # 2. ISO-8601 Timestamp Parser Tests
    def test_parse_iso_timestamp(self):
        parsed = self.contract._parse_iso_timestamp("2026-08-30T13:30:57Z")
        self.assertEqual(parsed, 1788096657)

    def test_parse_iso_timestamp_with_milliseconds(self):
        parsed = self.contract._parse_iso_timestamp("2026-08-30T13:30:57.123456Z")
        self.assertEqual(parsed, 1788096657)

    def test_parse_iso_timestamp_invalid(self):
        with self.assertRaises(UserError):
            self.contract._parse_iso_timestamp("invalid-date-string")

    # 3. Fail-Closed Timestamp & Expiry Checks
    def test_claim_cannot_pass_when_timestamp_cannot_be_read(self):
        import genlayer
        w_id = "expired_w_fail_closed"
        self.contract.warranties = {
            w_id: Warranty(
                creator="0x1111111111111111111111111111111111111111",
                customer_address="0x2222222222222222222222222222222222222222",
                locked_amount=100,
                policy_url="https://example.com/policy",
                product_info="Product",
                expiry=1000,
                status="ACTIVE",
                claim_description="",
                evidence_urls="",
                verdict="",
                reason="",
                confidence=0,
                adjudicated_at=0,
                appeal_deposit=0,
                appeal_reason="",
                appeal_verdict=""
            )
        }
        orig_msg_raw = getattr(genlayer.gl, "message_raw", None)
        try:
            genlayer.gl.message_raw = None
            with self.assertRaises(UserError) as ctx:
                self.contract.file_claim(w_id, "Screen defect", "https://evidence.url")
            self.assertIn("Trusted execution timestamp", str(ctx.exception))
        finally:
            genlayer.gl.message_raw = orig_msg_raw

    def test_claim_rejected_when_warranty_expired(self):
        import genlayer
        w_id = "expired_w"
        self.contract.warranties = {
            w_id: Warranty(
                creator="0x1111111111111111111111111111111111111111",
                customer_address="0x2222222222222222222222222222222222222222",
                locked_amount=100,
                policy_url="https://example.com/policy",
                product_info="Product",
                expiry=1000,
                status="ACTIVE",
                claim_description="",
                evidence_urls="",
                verdict="",
                reason="",
                confidence=0,
                adjudicated_at=0,
                appeal_deposit=0,
                appeal_reason="",
                appeal_verdict=""
            )
        }
        genlayer.gl.message_raw = {"datetime": "2026-09-07T12:00:00Z"}
        with self.assertRaises(UserError) as ctx:
            self.contract.file_claim(w_id, "Screen defect", "https://evidence.url")
        self.assertIn("Warranty has expired", str(ctx.exception))

    def test_claim_accepted_when_warranty_valid(self):
        w_id = "valid_w"
        self.contract.warranties = {
            w_id: Warranty(
                creator="0x1111111111111111111111111111111111111111",
                customer_address="0x2222222222222222222222222222222222222222",
                locked_amount=100,
                policy_url="https://example.com/policy",
                product_info="Product",
                expiry=9999999999,
                status="ACTIVE",
                claim_description="",
                evidence_urls="",
                verdict="",
                reason="",
                confidence=0,
                adjudicated_at=0,
                appeal_deposit=0,
                appeal_reason="",
                appeal_verdict=""
            )
        }
        res = self.contract.file_claim(w_id, "Screen defect", "https://evidence.url")
        self.assertEqual(res, w_id)
        self.assertEqual(self.contract.warranties[w_id].status, "CLAIMED")

    def test_create_warranty_rejected_when_timestamp_cannot_be_read(self):
        import genlayer
        orig_msg_raw = getattr(genlayer.gl, "message_raw", None)
        try:
            genlayer.gl.message_raw = None
            with self.assertRaises(UserError) as ctx:
                self.contract.create_warranty(
                    "0x2222222222222222222222222222222222222222",
                    "https://example.com/policy",
                    "Product",
                    "9999999999"
                )
            self.assertIn("Trusted execution timestamp", str(ctx.exception))
        finally:
            genlayer.gl.message_raw = orig_msg_raw

    def test_create_warranty_rejected_when_expiry_in_past(self):
        with self.assertRaises(UserError) as ctx:
            self.contract.create_warranty(
                "0x2222222222222222222222222222222222222222",
                "https://example.com/policy",
                "Product",
                "1000"
            )
        self.assertIn("Expiry must be in the future", str(ctx.exception))

    # 4. Milestone v2: Staked Consumer Appeal Tribunal Flow
    def test_appeal_claim_success(self):
        import genlayer
        w_id = "rejected_w"
        # Adjudicated at 2026-09-07T12:00:00Z (~1788782400)
        self.contract.warranties = {
            w_id: Warranty(
                creator="0x1111111111111111111111111111111111111111",
                customer_address="0x2222222222222222222222222222222222222222",
                locked_amount=100,
                policy_url="https://example.com/policy",
                product_info="Product",
                expiry=9999999999,
                status="REJECTED",
                claim_description="Defect claim",
                evidence_urls="https://example.com/evidence",
                verdict="REJECTED",
                reason="Initial rejection by AI",
                confidence=70,
                adjudicated_at=1788782400,
                appeal_deposit=0,
                appeal_reason="",
                appeal_verdict=""
            )
        }
        # Customer calls appeal_claim with 0.1 GEN appeal deposit
        genlayer.gl.message.sender_address = "0x2222222222222222222222222222222222222222"
        genlayer.gl.message.value = 100000000000000000
        genlayer.gl.message_raw = {"datetime": "2026-09-08T12:00:00Z"} # 1 day later (within 7d window)

        res = self.contract.appeal_claim(w_id, "The damage was clearly within warranty coverage guidelines")
        self.assertEqual(res, w_id)
        w = self.contract.warranties[w_id]
        self.assertEqual(w.status, "APPEALED")
        self.assertEqual(w.appeal_deposit, 100000000000000000)
        self.assertIn("clearly within warranty", w.appeal_reason)

    def test_appeal_claim_fails_if_unauthorized(self):
        import genlayer
        w_id = "rejected_w_unauth"
        self.contract.warranties = {
            w_id: Warranty(
                creator="0x1111111111111111111111111111111111111111",
                customer_address="0x2222222222222222222222222222222222222222",
                locked_amount=100,
                policy_url="https://example.com/policy",
                product_info="Product",
                expiry=9999999999,
                status="REJECTED",
                claim_description="Defect",
                evidence_urls="",
                verdict="REJECTED",
                reason="Rejection",
                confidence=70,
                adjudicated_at=1788782400,
                appeal_deposit=0,
                appeal_reason="",
                appeal_verdict=""
            )
        }
        # Stranger attempts to appeal
        genlayer.gl.message.sender_address = "0x9999999999999999999999999999999999999999"
        with self.assertRaises(UserError) as ctx:
            self.contract.appeal_claim(w_id, "Frivolous appeal")
        self.assertIn("Only the customer can appeal", str(ctx.exception))

    def test_appeal_claim_fails_after_7_day_window(self):
        import genlayer
        w_id = "rejected_w_expired_window"
        # Adjudicated at 1788782400
        self.contract.warranties = {
            w_id: Warranty(
                creator="0x1111111111111111111111111111111111111111",
                customer_address="0x2222222222222222222222222222222222222222",
                locked_amount=100,
                policy_url="https://example.com/policy",
                product_info="Product",
                expiry=9999999999,
                status="REJECTED",
                claim_description="Defect",
                evidence_urls="",
                verdict="REJECTED",
                reason="Rejection",
                confidence=70,
                adjudicated_at=1788782400,
                appeal_deposit=0,
                appeal_reason="",
                appeal_verdict=""
            )
        }
        # 10 days later (> 7 days)
        genlayer.gl.message.sender_address = "0x2222222222222222222222222222222222222222"
        genlayer.gl.message_raw = {"datetime": "2026-09-18T12:00:00Z"}
        with self.assertRaises(UserError) as ctx:
            self.contract.appeal_claim(w_id, "Late appeal")
        self.assertIn("Appeal window of 7 days has expired", str(ctx.exception))

    # 5. Milestone v2: Uncontested Escrow Settlement
    def test_claim_uncontested_deposit_after_7_days(self):
        import genlayer
        w_id = "uncontested_w"
        self.contract.warranties = {
            w_id: Warranty(
                creator="0x1111111111111111111111111111111111111111",
                customer_address="0x2222222222222222222222222222222222222222",
                locked_amount=100,
                policy_url="https://example.com/policy",
                product_info="Product",
                expiry=9999999999,
                status="REJECTED",
                claim_description="Defect",
                evidence_urls="",
                verdict="REJECTED",
                reason="Rejection",
                confidence=70,
                adjudicated_at=1788782400,
                appeal_deposit=0,
                appeal_reason="",
                appeal_verdict=""
            )
        }
        # Creator calls after 8 days
        genlayer.gl.message.sender_address = "0x1111111111111111111111111111111111111111"
        genlayer.gl.message_raw = {"datetime": "2026-09-16T12:00:00Z"}
        self.contract.claim_uncontested_deposit(w_id)
        self.assertEqual(self.contract.warranties[w_id].status, "CLOSED")
        self.assertEqual(self.contract.warranties[w_id].locked_amount, 0)

    # 6. Milestone v2: Merchant Trust Score & Tier Reputation Engine
    def test_merchant_reputation_tracking_and_tiers(self):
        merchant = "0x1111111111111111111111111111111111111111"
        # Initial creation
        self.contract._update_merchant_reputation(merchant, "CREATE")
        rep_json = self.contract.get_merchant_reputation(merchant)
        rep = json.loads(rep_json)
        self.assertEqual(rep["total_warranties"], "1")
        self.assertEqual(rep["trust_score"], 100)
        self.assertEqual(rep["tier"], "SILVER")

        # Create 4 more to reach 5 total warranties -> qualifies for PLATINUM
        for _ in range(4):
            self.contract._update_merchant_reputation(merchant, "CREATE")
        
        rep = json.loads(self.contract.get_merchant_reputation(merchant))
        self.assertEqual(rep["total_warranties"], "5")
        self.assertEqual(rep["tier"], "PLATINUM")

        # Overturned appeal penalizes reputation score
        self.contract._update_merchant_reputation(merchant, "CLAIM")
        self.contract._update_merchant_reputation(merchant, "OVERTURN")
        rep = json.loads(self.contract.get_merchant_reputation(merchant))
        self.assertEqual(rep["appeals_overturned"], "1")
        self.assertEqual(rep["trust_score"], 75)
        self.assertEqual(rep["tier"], "GOLD")

    # 7. Milestone v2: Pull-Payment Safety Vault
    def test_withdraw_balance_reverts_when_empty(self):
        import genlayer
        genlayer.gl.message.sender_address = "0x2222222222222222222222222222222222222222"
        with self.assertRaises(UserError) as ctx:
            self.contract.withdraw_balance()
        self.assertIn("No pending withdrawals", str(ctx.exception))

if __name__ == "__main__":
    unittest.main()
