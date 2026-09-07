"""
Unit and Integration Test Suite for WarrantyVault GenLayer Contract (v0.2.16 / v0.2.18)
Includes mock environment for local Python verification outside GenVM.
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
        
    gl_mock.gl = MockGL()
    gl_mock.UserError = Exception
    sys.modules["genlayer"] = gl_mock

# Add contracts directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "contracts")))

from warranty_vault import Warranty, Contract

class TestWarrantyVaultContract(unittest.TestCase):

    def setUp(self):
        self.contract = Contract()

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

    def test_contract_initialization(self):
        self.assertEqual(self.contract.next_warranty_id, 0)

    def test_parse_iso_timestamp(self):
        parsed = self.contract._parse_iso_timestamp("2026-08-30T13:30:57Z")
        self.assertEqual(parsed, 1788096657)

    def test_parse_iso_timestamp_with_milliseconds(self):
        parsed = self.contract._parse_iso_timestamp("2026-08-30T13:30:57.123456Z")
        self.assertEqual(parsed, 1788096657)

    def test_parse_iso_timestamp_invalid(self):
        parsed = self.contract._parse_iso_timestamp("invalid-date-string")
        self.assertEqual(parsed, 0)

    def test_claim_cannot_pass_when_timestamp_cannot_be_read(self):
        """Verify that failure to read runtime timestamp fails-closed and cannot allow an expired claim through."""
        import genlayer
        from warranty_vault import UserError, Warranty
        w_id = "expired_w_fail_closed"
        self.contract.warranties = {
            w_id: Warranty(
                creator="0x1111111111111111111111111111111111111111",
                customer_address="0x2222222222222222222222222222222222222222",
                locked_amount=100,
                policy_url="https://example.com/policy",
                product_info="Product",
                expiry=1000, # Expired in the past
                status="ACTIVE",
                claim_description="",
                evidence_urls="",
                verdict="",
                reason="",
                confidence=0,
                adjudicated_at=0
            )
        }
        # Simulate timestamp read failure (e.g. gl.message_raw is None or missing datetime)
        orig_msg_raw = getattr(genlayer.gl, "message_raw", None)
        try:
            genlayer.gl.message_raw = None
            with self.assertRaises(UserError) as ctx:
                self.contract.file_claim(w_id, "Screen defect", "https://evidence.url")
            self.assertIn("Cannot verify runtime timestamp", str(ctx.exception))
        finally:
            genlayer.gl.message_raw = orig_msg_raw

    def test_claim_rejected_when_warranty_expired(self):
        """Verify that an expired warranty is rejected with 'Warranty has expired'."""
        import genlayer
        from warranty_vault import UserError, Warranty
        w_id = "expired_w"
        self.contract.warranties = {
            w_id: Warranty(
                creator="0x1111111111111111111111111111111111111111",
                customer_address="0x2222222222222222222222222222222222222222",
                locked_amount=100,
                policy_url="https://example.com/policy",
                product_info="Product",
                expiry=1000, # Expired timestamp
                status="ACTIVE",
                claim_description="",
                evidence_urls="",
                verdict="",
                reason="",
                confidence=0,
                adjudicated_at=0
            )
        }
        import genlayer
        genlayer.gl.message_raw = {"datetime": "2026-09-07T12:00:00Z"}
        with self.assertRaises(UserError) as ctx:
            self.contract.file_claim(w_id, "Screen defect", "https://evidence.url")
        self.assertIn("Warranty has expired", str(ctx.exception))

    def test_claim_accepted_when_warranty_valid(self):
        """Verify that a non-expired warranty allows filing a claim."""
        import genlayer
        from warranty_vault import Warranty
        w_id = "valid_w"
        self.contract.warranties = {
            w_id: Warranty(
                creator="0x1111111111111111111111111111111111111111",
                customer_address="0x2222222222222222222222222222222222222222",
                locked_amount=100,
                policy_url="https://example.com/policy",
                product_info="Product",
                expiry=9999999999, # Far future
                status="ACTIVE",
                claim_description="",
                evidence_urls="",
                verdict="",
                reason="",
                confidence=0,
                adjudicated_at=0
            )
        }
        genlayer.gl.message_raw = {"datetime": "2026-09-07T12:00:00Z"}
        res = self.contract.file_claim(w_id, "Screen defect", "https://evidence.url")
        self.assertEqual(res, w_id)
        self.assertEqual(self.contract.warranties[w_id].status, "CLAIMED")

    def test_create_warranty_rejected_when_timestamp_cannot_be_read(self):
        """Verify that create_warranty fails-closed if runtime timestamp cannot be verified."""
        import genlayer
        from warranty_vault import UserError
        self.contract.warranties = {}
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
            self.assertIn("Cannot verify runtime timestamp", str(ctx.exception))
        finally:
            genlayer.gl.message_raw = orig_msg_raw

    def test_create_warranty_rejected_when_expiry_in_past(self):
        """Verify that create_warranty rejects an expiry timestamp set in the past."""
        import genlayer
        from warranty_vault import UserError
        self.contract.warranties = {}
        genlayer.gl.message_raw = {"datetime": "2026-09-07T12:00:00Z"}
        with self.assertRaises(UserError) as ctx:
            self.contract.create_warranty(
                "0x2222222222222222222222222222222222222222",
                "https://example.com/policy",
                "Product",
                "1000" # Past timestamp
            )
        self.assertIn("Expiry must be in the future", str(ctx.exception))

if __name__ == "__main__":
    unittest.main()
