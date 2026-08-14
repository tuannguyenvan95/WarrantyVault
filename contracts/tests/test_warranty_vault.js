/**
 * WarrantyVault Contract Test Script (JavaScript)
 * =================================================
 * 
 * This script tests the WarrantyVault contract functionality on studionet.
 * 
 * Prerequisites:
 * 1. Deploy the contract on GenLayer Studio
 * 2. Set CONTRACT_ADDRESS in .env file
 * 3. Have MetaMask connected to studionet
 * 4. Have GEN tokens for gas
 * 
 * Usage:
 *   node test_warranty_vault.js
 */

import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

// Configuration
const CONTRACT_ADDRESS = process.env.VITE_CONTRACT_ADDRESS || '';

// Test Policy URLs
const POLICIES = {
  electronics: "https://raw.githubusercontent.com/nicholasgasior/gist/master/warranty-policy-example.txt",
  general: "https://example.com/general-warranty-policy.txt"
};

// Test Evidence URLs
const EVIDENCE = {
  defect: "https://imgur.com/a/example1",
  conflicting: "https://imgur.com/a/example2"
};

class WarrantyVaultTester {
  constructor() {
    this.results = [];
    this.contractAddress = CONTRACT_ADDRESS;
    this.client = null;
    this.warrantyIds = [];
    this.claimIds = [];
  }

  async init() {
    console.log("🔧 Initializing test client...");
    
    if (!this.contractAddress) {
      console.error("❌ CONTRACT_ADDRESS not set. Please deploy the contract first.");
      process.exit(1);
    }

    // Initialize client with MetaMask
    if (typeof window !== 'undefined' && window.ethereum) {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      this.client = createClient({
        chain: studionet,
        provider: window.ethereum,
        account: await window.ethereum.request({ method: 'eth_accounts' }).then(accounts => accounts[0])
      });
      console.log("✅ Client initialized");
    } else {
      console.error("❌ MetaMask not found. Please install MetaMask.");
      process.exit(1);
    }
  }

  async runAllTests() {
    console.log("\n" + "=".repeat(60));
    console.log("WarrantyVault Contract Test Suite");
    console.log("=".repeat(60));

    await this.testCreateWarranty();
    await this.testFileClaim();
    await this.testAdjudicateClaim();
    await this.testViewFunctions();
    await this.testErrorHandling();

    this.printSummary();
  }

  // ==================== Test Methods ====================

  async testCreateWarranty() {
    console.log("\n📋 Test Group: Create Warranty");
    console.log("-".repeat(40));

    // Test 1: Create valid warranty
    await this.runTest("create_warranty_valid", "Create warranty with valid parameters", async () => {
      const warrantyId = await this.createWarranty(
        POLICIES.electronics,
        "MacBook Pro M3 Max - 16GB RAM",
        "31536000", // 1 year
        10.5
      );
      this.warrantyIds.push(warrantyId);
      return { warrantyId };
    });

    // Test 2: Create warranty with short duration
    await this.runTest("create_warranty_short", "Create warranty with 30-day duration", async () => {
      const warrantyId = await this.createWarranty(
        POLICIES.electronics,
        "iPhone 15 Case",
        "2592000", // 30 days
        5.0
      );
      this.warrantyIds.push(warrantyId);
      return { warrantyId };
    });

    // Test 3: Create warranty with zero amount (should fail)
    await this.runTest("create_warranty_zero_amount", "Create warranty with zero amount - expect failure", async () => {
      try {
        await this.createWarranty(POLICIES.electronics, "Test", "31536000", 0);
        throw new Error("Expected error not thrown");
      } catch (e) {
        if (e.message.includes("Deposit amount must be greater than 0")) {
          return { errorCaught: true };
        }
        throw e;
      }
    });
  }

  async testFileClaim() {
    console.log("\n📋 Test Group: File Claim");
    console.log("-".repeat(40));

    if (this.warrantyIds.length === 0) {
      console.log("  ⚠️  Skipping - no warranties created");
      return;
    }

    const warrantyId = this.warrantyIds[0];

    // Test 1: File valid claim
    await this.runTest("file_claim_valid", "File a valid claim with evidence", async () => {
      const claimId = await this.fileClaim(
        warrantyId,
        "Screen cracked after normal use. The laptop was in a padded bag during transport.",
        `${EVIDENCE.defect},${EVIDENCE.conflicting}`
      );
      this.claimIds.push(claimId);
      return { claimId };
    });

    // Test 2: File claim on same warranty (should fail)
    await this.runTest("file_claim_already_claimed", "File claim on already claimed warranty - expect failure", async () => {
      try {
        await this.fileClaim(warrantyId, "Second claim", EVIDENCE.defect);
        throw new Error("Expected error not thrown");
      } catch (e) {
        if (e.message.includes("Warranty is not active")) {
          return { errorCaught: true };
        }
        throw e;
      }
    });
  }

  async testAdjudicateClaim() {
    console.log("\n📋 Test Group: Adjudicate Claim (AI)");
    console.log("-".repeat(40));

    if (this.claimIds.length === 0) {
      console.log("  ⚠️  Skipping - no claims filed");
      return;
    }

    const claimId = this.claimIds[0];

    // Test 1: Adjudicate claim via AI
    await this.runTest("adjudicate_claim_ai", "Adjudicate claim using AI consensus", async () => {
      const verdict = await this.adjudicateClaim(claimId);
      return { verdict };
    });

    // Test 2: Get claim details after adjudication
    await this.runTest("get_claim_after_adjudicate", "Verify claim details after adjudication", async () => {
      const claim = await this.getClaim(claimId);
      if (claim.status !== "ADJUDICATED") {
        throw new Error(`Expected status ADJUDICATED, got ${claim.status}`);
      }
      return claim;
    });

    // Test 3: Try to adjudicate already adjudicated claim
    await this.runTest("adjudicate_already_done", "Adjudicate already adjudicated claim - expect failure", async () => {
      try {
        await this.adjudicateClaim(claimId);
        throw new Error("Expected error not thrown");
      } catch (e) {
        if (e.message.includes("Claim already adjudicated")) {
          return { errorCaught: true };
        }
        throw e;
      }
    });
  }

  async testViewFunctions() {
    console.log("\n📋 Test Group: View Functions");
    console.log("-".repeat(40));

    // Test 1: Get all warranties
    await this.runTest("get_all_warranties", "Retrieve all warranties", async () => {
      const warranties = await this.getAllWarranties();
      return { count: Object.keys(warranties).length };
    });

    // Test 2: Get all claims
    await this.runTest("get_all_claims", "Retrieve all claims", async () => {
      const claims = await this.getAllClaims();
      return { count: Object.keys(claims).length };
    });

    // Test 3: Get specific warranty
    if (this.warrantyIds.length > 0) {
      await this.runTest("get_warranty_by_id", "Retrieve warranty by ID", async () => {
        const warranty = await this.getWarranty(this.warrantyIds[0]);
        return warranty;
      });
    }
  }

  async testErrorHandling() {
    console.log("\n📋 Test Group: Error Handling");
    console.log("-".repeat(40));

    // Test 1: Get non-existent warranty
    await this.runTest("get_nonexistent_warranty", "Get non-existent warranty - expect error", async () => {
      try {
        await this.getWarranty("99999");
        throw new Error("Expected error not thrown");
      } catch (e) {
        if (e.message.includes("Warranty not found")) {
          return { errorCaught: true };
        }
        throw e;
      }
    });

    // Test 2: Get non-existent claim
    await this.runTest("get_nonexistent_claim", "Get non-existent claim - expect error", async () => {
      try {
        await this.getClaim("99999");
        throw new Error("Expected error not thrown");
      } catch (e) {
        if (e.message.includes("Claim not found")) {
          return { errorCaught: true };
        }
        throw e;
      }
    });
  }

  // ==================== Contract Interaction Methods ====================

  async createWarranty(policyUrl, productInfo, durationSeconds, amountEth) {
    const weiAmount = BigInt(Math.floor(amountEth * 1e18));
    const { hash } = await this.client.writeContract({
      address: this.contractAddress,
      functionName: 'create_warranty',
      args: [policyUrl, productInfo, durationSeconds],
      value: weiAmount
    });
    await this.client.waitForTransactionReceipt({ hash });
    
    // Get the warranty ID from the contract
    const warranties = await this.getAllWarranties();
    const ids = Object.keys(warranties);
    return ids[ids.length - 1]; // Return the latest warranty ID
  }

  async fileClaim(warrantyId, description, evidenceUrls) {
    const { hash } = await this.client.writeContract({
      address: this.contractAddress,
      functionName: 'file_claim',
      args: [warrantyId, description, evidenceUrls]
    });
    await this.client.waitForTransactionReceipt({ hash });
    
    // Get the claim ID from the contract
    const claims = await this.getAllClaims();
    const ids = Object.keys(claims);
    return ids[ids.length - 1]; // Return the latest claim ID
  }

  async adjudicateClaim(claimId) {
    const { hash } = await this.client.writeContract({
      address: this.contractAddress,
      functionName: 'adjudicate_claim',
      args: [claimId]
    });
    await this.client.waitForTransactionReceipt({ hash });
    
    const claim = await this.getClaim(claimId);
    return claim.verdict;
  }

  async releaseEscalatedFunds(claimId) {
    const { hash } = await this.client.writeContract({
      address: this.contractAddress,
      functionName: 'release_escalated_funds',
      args: [claimId]
    });
    await this.client.waitForTransactionReceipt({ hash });
    return "RELEASED";
  }

  async getWarranty(warrantyId) {
    const result = await this.client.readContract({
      address: this.contractAddress,
      functionName: 'get_warranty',
      args: [warrantyId]
    });
    return JSON.parse(result);
  }

  async getClaim(claimId) {
    const result = await this.client.readContract({
      address: this.contractAddress,
      functionName: 'get_claim',
      args: [claimId]
    });
    return JSON.parse(result);
  }

  async getAllWarranties() {
    const result = await this.client.readContract({
      address: this.contractAddress,
      functionName: 'get_all_warranties',
      args: []
    });
    return JSON.parse(result);
  }

  async getAllClaims() {
    const result = await this.client.readContract({
      address: this.contractAddress,
      functionName: 'get_all_claims',
      args: []
    });
    return JSON.parse(result);
  }

  // ==================== Test Runner Methods ====================

  async runTest(name, description, testFn) {
    console.log(`  ▶ ${description}`);
    try {
      const result = await testFn();
      this.results.push({ name, passed: true, message: "Passed", details: result });
      console.log(`    ✅ Passed`);
    } catch (e) {
      this.results.push({ name, passed: false, message: e.message });
      console.log(`    ❌ Failed - ${e.message}`);
    }
  }

  printSummary() {
    console.log("\n" + "=".repeat(60));
    console.log("TEST SUMMARY");
    console.log("=".repeat(60));

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;

    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Success Rate: ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%`);

    if (failed > 0) {
      console.log("\nFailed Tests:");
      this.results
        .filter(r => !r.passed)
        .forEach(r => console.log(`  - ${r.name}: ${r.message}`));
    }

    console.log("=".repeat(60));
  }
}

// Run tests if executed directly
if (typeof window !== 'undefined') {
  // Browser environment
  window.runTests = async () => {
    const tester = new WarrantyVaultTester();
    await tester.init();
    await tester.runAllTests();
  };
  console.log("Run tests with: window.runTests()");
} else {
  console.log("This script must be run in a browser environment with MetaMask.");
  console.log("1. Include this script in your HTML");
  console.log("2. Call window.runTests() from the browser console");
}

export default WarrantyVaultTester;
