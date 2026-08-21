"""
Unit and Integration Test Suite for WarrantyVault GenLayer Contract (v0.2.18)
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
        
    class MockGL:
        class Contract:
            pass
        public = MockPublic()
        class VM:
            @staticmethod
            def run_nondet(leader_fn, validator_fn):
                return leader_fn()
        vm = VM()
        
    gl_mock.gl = MockGL()
    sys.modules["genlayer"] = gl_mock

# Add contracts directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "contracts")))

from warranty_vault import Warranty, Claim, Contract

class TestWarrantyVaultContract(unittest.TestCase):

    def setUp(self):
        self.contract = Contract()

    def test_parse_json_from_llm_clean(self):
        sample = '{"verdict": "COVERED", "confidence": 95, "reason": "Valid claim"}'
        parsed = self.contract._parse_llm_json(sample)
        self.assertEqual(parsed["verdict"], "COVERED")
        self.assertEqual(parsed["confidence"], 95)

    def test_parse_json_from_llm_markdown(self):
        sample = '```json\n{"verdict": "REJECTED", "confidence": 90, "reason": "Physical abuse"}\n```'
        parsed = self.contract._parse_llm_json(sample)
        self.assertEqual(parsed["verdict"], "REJECTED")
        self.assertEqual(parsed["confidence"], 90)

    def test_contract_initialization(self):
        self.assertEqual(self.contract.next_warranty_id, 1)
        self.assertEqual(self.contract.next_claim_id, 1)

if __name__ == "__main__":
    unittest.main()
