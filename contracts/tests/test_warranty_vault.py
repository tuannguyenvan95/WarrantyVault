"""
WarrantyVault Contract Test Scenarios
=====================================

Test scenarios for the WarrantyVault smart contract running on GenLayer studionet.

Usage:
1. Deploy the contract from contracts/warranty_vault.py on GenLayer Studio
2. Set CONTRACT_ADDRESS (env var, VITE_CONTRACT_ADDRESS, or contracts/.env)
3. Run: python tests/test_warranty_vault.py

Reads work headless on studionet. For headless writes, deploy to the Asimov
testnet and set GENLAYER_CHAIN=asimov plus PRIVATE_KEY (funded account).

Test Coverage:
- Create Warranty (various scenarios)
- File Claim
- Adjudicate Claim (AI verdicts)
- Release Escalated Funds (timeout mechanism)
- View Functions
- Error Handling
"""

import json
import os
import sys
from dataclasses import dataclass
from typing import Any

from genlayer_client import GenLayerClient, CHAIN_PRESETS

# Test Configuration
CONTRACT_ADDRESS = ""  # Fallback; normally read from CONTRACT_ADDRESS env / .env
TEST_NETWORK = "studionet"

# Sample Policy URLs for testing
SAMPLE_POLICIES = {
    "electronics": "https://raw.githubusercontent.com/WarrantyVault/test-policies/main/electronics_policy.txt",
    "furniture": "https://raw.githubusercontent.com/WarrantyVault/test-policies/main/furniture_policy.txt",
    "general": "https://raw.githubusercontent.com/WarrantyVault/test-policies/main/general_policy.txt",
}

# Sample Evidence URLs for testing
SAMPLE_EVIDENCE = {
    "clear_defect": "https://imgur.com/a/example1",
    "partial_damage": "https://imgur.com/a/example2",
    "user_cause": "https://imgur.com/a/example3",
    "conflicting": "https://imgur.com/a/example4",
}


@dataclass
class TestResult:
    name: str
    passed: bool
    message: str
    details: dict = None


class WarrantyVaultTestSuite:
    """Comprehensive test suite for WarrantyVault contract."""
    
    def __init__(self, contract_address: str, client: Any):
        self.contract_address = contract_address
        self.client = client
        self.results: list[TestResult] = []
        
    def run_all_tests(self) -> list[TestResult]:
        """Run all test scenarios."""
        print("=" * 60)
        print("WarrantyVault Contract Test Suite")
        print("=" * 60)
        
        # Test Groups
        self.test_create_warranty()
        self.test_file_claim()
        self.test_adjudicate_claim()
        self.test_release_escalated_funds()
        self.test_view_functions()
        self.test_error_handling()
        
        # Print Summary
        self.print_summary()
        return self.results
    
    def test_create_warranty(self):
        """Test create_warranty function with various scenarios."""
        print("\n📋 Test Group: Create Warranty")
        print("-" * 40)
        
        # Test 1: Create valid warranty
        self._run_test(
            "create_warranty_valid",
            "Create warranty with valid parameters",
            lambda: self._create_warranty(
                policy_url=SAMPLE_POLICIES["electronics"],
                product_info="MacBook Pro M3 Max - 16GB RAM",
                duration_seconds="31536000",  # 1 year
                amount_eth=10.5
            )
        )
        
        # Test 2: Create warranty with short duration
        self._run_test(
            "create_warranty_short_duration",
            "Create warranty with 30-day duration",
            lambda: self._create_warranty(
                policy_url=SAMPLE_POLICIES["electronics"],
                product_info="iPhone 15 Case",
                duration_seconds="2592000",  # 30 days
                amount_eth=5.0
            )
        )
        
        # Test 3: Create warranty with long duration
        self._run_test(
            "create_warranty_long_duration",
            "Create warranty with 5-year duration",
            lambda: self._create_warranty(
                policy_url=SAMPLE_POLICIES["furniture"],
                product_info="Premium Leather Sofa",
                duration_seconds="157680000",  # 5 years
                amount_eth=50.0
            )
        )
        
        # Test 4: Create warranty with zero amount (should fail)
        self._run_test(
            "create_warranty_zero_amount",
            "Create warranty with zero amount - expect failure",
            lambda: self._create_warranty_expect_error(
                policy_url=SAMPLE_POLICIES["electronics"],
                product_info="Test Product",
                duration_seconds="31536000",
                amount_eth=0.0,
                expected_error="Deposit amount must be greater than 0"
            )
        )
        
        # Test 5: Create warranty with empty policy URL
        self._run_test(
            "create_warranty_empty_policy",
            "Create warranty with empty policy URL",
            lambda: self._create_warranty(
                policy_url="",
                product_info="Product without policy",
                duration_seconds="31536000",
                amount_eth=1.0
            )
        )
    
    def test_file_claim(self):
        """Test file_claim function with various scenarios."""
        print("\n📋 Test Group: File Claim")
        print("-" * 40)
        
        # First, we need an active warranty
        warranty_id = self._create_warranty(
            policy_url=SAMPLE_POLICIES["electronics"],
            product_info="MacBook Pro M3 Max - 16GB RAM",
            duration_seconds="31536000",
            amount_eth=10.5
        )
        
        if warranty_id:
            # Test 1: File valid claim
            self._run_test(
                "file_claim_valid",
                "File a valid claim with evidence",
                lambda: self._file_claim(
                    warranty_id=warranty_id,
                    description="Screen cracked after normal use. The laptop was in a padded bag during transport.",
                    evidence_urls=f"{SAMPLE_EVIDENCE['clear_defect']},{SAMPLE_EVIDENCE['conflicting']}"
                )
            )
            
            # Test 2: File claim on same warranty (should fail - status becomes CLAIMED)
            self._run_test(
                "file_claim_already_claimed",
                "File claim on already claimed warranty - expect failure",
                lambda: self._file_claim_expect_error(
                    warranty_id=warranty_id,
                    description="Second claim attempt",
                    evidence_urls=SAMPLE_EVIDENCE["clear_defect"],
                    expected_error="Warranty is not active"
                )
            )
        
        # Test 3: File claim on non-existent warranty
        self._run_test(
            "file_claim_nonexistent",
            "File claim on non-existent warranty - expect failure",
            lambda: self._file_claim_expect_error(
                warranty_id="99999",
                description="Claim on non-existent warranty",
                evidence_urls=SAMPLE_EVIDENCE["clear_defect"],
                expected_error="Warranty not found"
            )
        )
    
    def test_adjudicate_claim(self):
        """Test adjudicate_claim function with AI verdicts."""
        print("\n📋 Test Group: Adjudicate Claim (AI)")
        print("-" * 40)
        
        # Create warranty and file a claim
        warranty_id = self._create_warranty(
            policy_url=SAMPLE_POLICIES["electronics"],
            product_info="MacBook Pro M3 Max - 16GB RAM",
            duration_seconds="31536000",
            amount_eth=10.5
        )
        
        if warranty_id:
            claim_id = self._file_claim(
                warranty_id=warranty_id,
                description="Screen cracked after normal use. The laptop was in a padded bag during transport.",
                evidence_urls=SAMPLE_EVIDENCE["clear_defect"]
            )
            
            if claim_id:
                # Test 1: Adjudicate claim via AI
                self._run_test(
                    "adjudicate_claim_ai",
                    "Adjudicate claim using AI consensus",
                    lambda: self._adjudicate_claim(claim_id)
                )
                
                # Test 2: Get claim details after adjudication
                self._run_test(
                    "get_claim_after_adjudicate",
                    "Verify claim details after adjudication",
                    lambda: self._verify_claim_adjudicated(claim_id)
                )
                
                # Test 3: Try to adjudicate already adjudicated claim
                self._run_test(
                    "adjudicate_already_done",
                    "Adjudicate already adjudicated claim - expect failure",
                    lambda: self._adjudicate_claim_expect_error(
                        claim_id=claim_id,
                        expected_error="Claim already adjudicated"
                    )
                )
    
    def test_release_escalated_funds(self):
        """Test release_escalated_funds function (timeout mechanism)."""
        print("\n📋 Test Group: Release Escalated Funds")
        print("-" * 40)
        
        # Create warranty and file a claim that will be escalated
        warranty_id = self._create_warranty(
            policy_url=SAMPLE_POLICIES["electronics"],
            product_info="iPhone 15 Pro - 256GB",
            duration_seconds="31536000",
            amount_eth=15.0
        )
        
        if warranty_id:
            claim_id = self._file_claim(
                warranty_id=warranty_id,
                description="Defective camera module - blurry photos in low light",
                evidence_urls=f"{SAMPLE_EVIDENCE['conflicting']}"  # Conflicting evidence
            )
            
            if claim_id:
                # Test 1: Try to release before adjudication (should fail)
                self._run_test(
                    "release_before_adjudicate",
                    "Release funds before adjudication - expect failure",
                    lambda: self._release_escalated_expect_error(
                        claim_id=claim_id,
                        expected_error="Claim must be adjudicated first"
                    )
                )
                
                # Adjudicate the claim (will likely be ESCALATE due to conflicting evidence)
                adjudication_result = self._adjudicate_claim(claim_id)
                
                if adjudication_result:
                    claim_data = self._get_claim(claim_id)
                    
                    if claim_data and claim_data.get("verdict") == "ESCALATE":
                        # Test 2: Try to release before timeout (should fail)
                        self._run_test(
                            "release_before_timeout",
                            "Release funds before 7-day timeout - expect failure",
                            lambda: self._release_escalated_expect_error(
                                claim_id=claim_id,
                                expected_error="Timeout not reached"
                            )
                        )
                        
                        # Note: In actual testing, you would need to wait 7 days or
                        # use time manipulation on testnet. For now, we document the scenario.
                        print("  ℹ️  Note: The 7-day timeout test requires waiting or time manipulation.")
                        print("     In production, this test would be run after the timeout period.")
                    else:
                        print(f"  ℹ️  Claim verdict was {claim_data.get('verdict') if claim_data else 'unknown'}, not ESCALATE.")
                        print("     ESCALATE release test skipped - verdict was different.")
    
    def test_view_functions(self):
        """Test view functions for data retrieval."""
        print("\n📋 Test Group: View Functions")
        print("-" * 40)
        
        # Test 1: Get all warranties
        self._run_test(
            "get_all_warranties",
            "Retrieve all warranties",
            lambda: self._get_all_warranties()
        )
        
        # Test 2: Get all claims
        self._run_test(
            "get_all_claims",
            "Retrieve all claims",
            lambda: self._get_all_claims()
        )
        
        # Test 3: Get specific warranty
        warranty_id = self._create_warranty(
            policy_url=SAMPLE_POLICIES["general"],
            product_info="Test Product for View",
            duration_seconds="2592000",
            amount_eth=1.0
        )
        
        if warranty_id:
            self._run_test(
                "get_warranty_by_id",
                "Retrieve warranty by ID",
                lambda: self._get_warranty(warranty_id)
            )
    
    def test_error_handling(self):
        """Test error handling scenarios."""
        print("\n📋 Test Group: Error Handling")
        print("-" * 40)
        
        # Test 1: Get non-existent warranty
        self._run_test(
            "get_nonexistent_warranty",
            "Get non-existent warranty - expect error",
            lambda: self._get_warranty_expect_error("99999", "Warranty not found")
        )
        
        # Test 2: Get non-existent claim
        self._run_test(
            "get_nonexistent_claim",
            "Get non-existent claim - expect error",
            lambda: self._get_claim_expect_error("99999", "Claim not found")
        )
        
        # Test 3: File claim on expired warranty
        self._run_test(
            "file_claim_expired_warranty",
            "File claim on expired warranty - expect error",
            lambda: self._test_expired_warranty_claim()
        )
    
    # ==================== Helper Methods ====================
    
    def _run_test(self, name: str, description: str, test_fn):
        """Run a single test and record result."""
        print(f"  ▶ {description}")
        try:
            result = test_fn()
            if result is not None:
                self.results.append(TestResult(name=name, passed=True, message="Passed", details=result))
                print(f"    ✅ Passed")
            else:
                self.results.append(TestResult(name=name, passed=False, message="No result returned"))
                print(f"    ❌ Failed - No result")
        except Exception as e:
            self.results.append(TestResult(name=name, passed=False, message=str(e)))
            print(f"    ❌ Failed - {e}")
    
    def _create_warranty(self, policy_url: str, product_info: str, duration_seconds: str, amount_eth: float) -> str | None:
        """Create a warranty, wait for consensus, and return the new warranty ID."""
        wei_amount = int(amount_eth * 1e18)
        self.client.write_contract(
            address=self.contract_address,
            function_name="create_warranty",
            args=[policy_url, product_info, duration_seconds],
            value=wei_amount
        )
        warranties = self._get_all_warranties()
        if not warranties:
            return None
        return max(warranties.keys(), key=lambda k: int(k))  # latest warranty ID
    
    def _create_warranty_expect_error(self, policy_url: str, product_info: str, duration_seconds: str, amount_eth: float, expected_error: str):
        """Create a warranty expecting an error."""
        try:
            wei_amount = int(amount_eth * 1e18)
            self.client.write_contract(
                address=self.contract_address,
                function_name="create_warranty",
                args=[policy_url, product_info, duration_seconds],
                value=wei_amount
            )
            raise Exception(f"Expected error: {expected_error}")
        except Exception as e:
            if expected_error.lower() in str(e).lower():
                return {"error_caught": True}
            raise
    
    def _file_claim(self, warranty_id: str, description: str, evidence_urls: str) -> str | None:
        """File a claim, wait for consensus, and return the new claim ID."""
        self.client.write_contract(
            address=self.contract_address,
            function_name="file_claim",
            args=[warranty_id, description, evidence_urls]
        )
        claims = self._get_all_claims()
        if not claims:
            return None
        return max(claims.keys(), key=lambda k: int(k))  # latest claim ID
    
    def _file_claim_expect_error(self, warranty_id: str, description: str, evidence_urls: str, expected_error: str):
        """File a claim expecting an error."""
        try:
            self.client.write_contract(
                address=self.contract_address,
                function_name="file_claim",
                args=[warranty_id, description, evidence_urls]
            )
            raise Exception(f"Expected error: {expected_error}")
        except Exception as e:
            if expected_error.lower() in str(e).lower():
                return {"error_caught": True}
            raise
    
    def _adjudicate_claim(self, claim_id: str) -> dict | None:
        """Adjudicate a claim via AI and return its verdict."""
        self.client.write_contract(
            address=self.contract_address,
            function_name="adjudicate_claim",
            args=[claim_id]
        )
        claim = self._get_claim(claim_id)
        return {"verdict": claim.get("verdict")} if claim else None
    
    def _adjudicate_claim_expect_error(self, claim_id: str, expected_error: str):
        """Adjudicate a claim expecting an error."""
        try:
            self.client.write_contract(
                address=self.contract_address,
                function_name="adjudicate_claim",
                args=[claim_id]
            )
            raise Exception(f"Expected error: {expected_error}")
        except Exception as e:
            if expected_error.lower() in str(e).lower():
                return {"error_caught": True}
            raise
    
    def _verify_claim_adjudicated(self, claim_id: str) -> dict:
        """Verify claim is properly adjudicated."""
        claim = self._get_claim(claim_id)
        if claim and claim.get("status") == "ADJUDICATED":
            return claim
        raise Exception(f"Claim not adjudicated properly: {claim}")
    
    def _release_escalated_expect_error(self, claim_id: str, expected_error: str):
        """Release escalated funds expecting an error."""
        try:
            self.client.write_contract(
                address=self.contract_address,
                function_name="release_escalated_funds",
                args=[claim_id]
            )
            raise Exception(f"Expected error: {expected_error}")
        except Exception as e:
            if expected_error.lower() in str(e).lower():
                return {"error_caught": True}
            raise
    
    def _get_all_warranties(self) -> dict:
        """Get all warranties."""
        result = self.client.read_contract(
            address=self.contract_address,
            function_name="get_all_warranties",
            args=[]
        )
        if not result:
            return {}
        return json.loads(result)
    
    def _get_all_claims(self) -> dict:
        """Get all claims."""
        result = self.client.read_contract(
            address=self.contract_address,
            function_name="get_all_claims",
            args=[]
        )
        if not result:
            return {}
        return json.loads(result)
    
    def _get_warranty(self, warranty_id: str) -> dict:
        """Get warranty by ID."""
        result = self.client.read_contract(
            address=self.contract_address,
            function_name="get_warranty",
            args=[warranty_id]
        )
        return json.loads(result)
    
    def _get_warranty_expect_error(self, warranty_id: str, expected_error: str):
        """Get warranty expecting an error."""
        try:
            self.client.read_contract(
                address=self.contract_address,
                function_name="get_warranty",
                args=[warranty_id]
            )
            raise Exception(f"Expected error: {expected_error}")
        except Exception as e:
            if expected_error.lower() in str(e).lower():
                return {"error_caught": True}
            raise
    
    def _get_claim(self, claim_id: str) -> dict:
        """Get claim by ID."""
        result = self.client.read_contract(
            address=self.contract_address,
            function_name="get_claim",
            args=[claim_id]
        )
        return json.loads(result)
    
    def _get_claim_expect_error(self, claim_id: str, expected_error: str):
        """Get claim expecting an error."""
        try:
            self.client.read_contract(
                address=self.contract_address,
                function_name="get_claim",
                args=[claim_id]
            )
            raise Exception(f"Expected error: {expected_error}")
        except Exception as e:
            if expected_error.lower() in str(e).lower():
                return {"error_caught": True}
            raise
    
    def _test_expired_warranty_claim(self):
        """Test filing claim on expired warranty."""
        # Create a warranty with very short duration
        warranty_id = self._create_warranty(
            policy_url=SAMPLE_POLICIES["general"],
            product_info="Short-lived warranty",
            duration_seconds="1",  # 1 second
            amount_eth=1.0
        )
        if warranty_id:
            # Wait for expiry (in real testing, you'd wait or use time manipulation)
            import time
            time.sleep(2)
            
            return self._file_claim_expect_error(
                warranty_id=warranty_id,
                description="Claim on expired warranty",
                evidence_urls=SAMPLE_EVIDENCE["clear_defect"],
                expected_error="Warranty has expired"
            )
    
    def print_summary(self):
        """Print test summary."""
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for r in self.results if r.passed)
        failed = sum(1 for r in self.results if not r.passed)
        total = len(self.results)
        
        print(f"Total Tests: {total}")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"Success Rate: {(passed/total*100) if total > 0 else 0:.1f}%")
        
        if failed > 0:
            print("\nFailed Tests:")
            for r in self.results:
                if not r.passed:
                    print(f"  - {r.name}: {r.message}")
        
        print("=" * 60)


def _load_env_file(path: str) -> None:
    """Load KEY=VALUE lines from a .env file into os.environ (non-destructive)."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    except OSError:
        pass


def main() -> int:
    """Main entry point: init the GenLayer client and run all test scenarios."""
    # Windows consoles default to cp1252 and cannot print emoji; use UTF-8.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print("WarrantyVault Contract Test Suite")
    print("=================================")
    print()

    # Load .env from the contracts/ directory if present
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    _load_env_file(env_path)

    contract_address = (
        os.environ.get("CONTRACT_ADDRESS")
        or os.environ.get("VITE_CONTRACT_ADDRESS")
        or CONTRACT_ADDRESS
    )
    if not contract_address:
        print("⚠️  CONTRACT_ADDRESS is not set.")
        print("   1. Deploy the contract on GenLayer Studio (contracts/warranty_vault.py)")
        print("   2. Set the address via:")
        print("        export CONTRACT_ADDRESS=0x...")
        print("      or create contracts/.env with:")
        print("        CONTRACT_ADDRESS=0x...")
        print("      or set VITE_CONTRACT_ADDRESS=0x...")
        return 1

    chain_name = os.environ.get("GENLAYER_CHAIN", "studionet").lower()
    preset = CHAIN_PRESETS.get(chain_name, CHAIN_PRESETS["studionet"])
    rpc_url = os.environ.get("RPC_URL", preset["rpc_url"])
    chain_id = int(os.environ.get("CHAIN_ID", preset["chain_id"]))
    consensus_contract = os.environ.get("CONSENSUS_CONTRACT", preset["consensus_contract"])
    private_key = os.environ.get("PRIVATE_KEY") or None
    from_address = os.environ.get("FROM_ADDRESS") or None

    print(f"⛓️  Chain: {chain_name} (id {chain_id})")
    print(f"📡 Contract address: {contract_address}")
    print(f"🔌 RPC URL: {rpc_url}")
    print(f"🎯 Consensus contract: {consensus_contract}")
    if private_key:
        print("🔑 Signing locally with PRIVATE_KEY")
    print(f"👤 From address: {from_address or '(derived from PRIVATE_KEY or zero)'}")
    print()

    client = GenLayerClient(
        rpc_url=rpc_url,
        from_address=from_address,
        consensus_contract=consensus_contract,
        chain_id=chain_id,
        private_key=private_key,
    )
    suite = WarrantyVaultTestSuite(contract_address=contract_address, client=client)
    results = suite.run_all_tests()

    failed = sum(1 for r in results if not r.passed)
    return 1 if failed > 0 else 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
