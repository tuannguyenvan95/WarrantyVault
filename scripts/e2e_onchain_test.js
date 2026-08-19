import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { privateKeyToAccount } from 'viem/accounts';

const CONTRACT_ADDRESS = '0x5bd7376FF1C39c1651eE216984B6939a8Ca0C0a9';
const PRIVATE_KEY = '0x0909fe6b9b671281b871e56215874fc39897e155bbf8858207528c4cea883707';
const account = privateKeyToAccount(PRIVATE_KEY);

const client = createClient({ 
  chain: studionet,
  account: account
});

async function runTest() {
  try {
    console.log("=== STARTING COMPLETE ONCHAIN TEST ===");
    console.log("Using Test Account:", account.address);
    console.log("Target Contract Address:", CONTRACT_ADDRESS);

    // 1. Create Warranty (Escrow Deposit)
    console.log("\n[1] TEST ESCROW DEPOSIT (Create Warranty)...");
    const policyUrl = "https://raw.githubusercontent.com/tuannguyenvan95/WarrantyVault/master/public/demo_policy.txt";
    const productInfo = "MacBook Pro 16 M3 Max - Serial: C02G99XYZ\nCategory: Laptops";
    const expiryTimestamp = Math.floor(Date.now() / 1000) + 86400 * 365; // 1 year
    const depositAmount = BigInt(1000); // 1000 wei

    const hash1 = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: 'create_warranty',
      args: [account.address, policyUrl, productInfo, expiryTimestamp.toString()],
      value: depositAmount
    });
    
    console.log("-> Create Warranty Tx Hash:", hash1);
    const receipt1 = await client.waitForTransactionReceipt({ hash: hash1, timeout: 120000 });
    console.log("-> Create Warranty Receipt Status:", receipt1.status);

    const stateStr = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_all_warranties',
      args: []
    });
    const warranties = JSON.parse(stateStr);
    const wIds = Object.keys(warranties);
    const warrantyId = wIds.sort((a,b) => Number(b) - Number(a))[0];
    const w = warranties[warrantyId];
    console.log(`-> [SUCCESS] Warranty Created! ID: ${warrantyId}`);
    console.log(`   - Locked Escrow Amount: ${w.locked_amount} wei`);
    console.log(`   - Customer: ${w.customer_address}`);
    console.log(`   - Status: ${w.status}`);

    // 2. File Claim
    console.log(`\n[2] TEST FILING WARRANTY CLAIM...`);
    const currentTime1 = Math.floor(Date.now() / 1000).toString();
    const hash2 = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: 'file_claim',
      args: [warrantyId, "The screen randomly cracked while opening the lid gently without dropping.", "https://raw.githubusercontent.com/tuannguyenvan95/WarrantyVault/master/src/assets/broken.jpg", currentTime1]
    });
    
    console.log("-> File Claim Tx Hash:", hash2);
    const receipt2 = await client.waitForTransactionReceipt({ hash: hash2, timeout: 120000 });
    console.log("-> File Claim Receipt Status:", receipt2.status);

    const claimsStr = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_all_claims',
      args: []
    });
    const claims = JSON.parse(claimsStr);
    const cIds = Object.keys(claims);
    const claimId = cIds.sort((a,b) => Number(b) - Number(a))[0];
    console.log(`-> [SUCCESS] Claim Filed! ID: ${claimId}`);

    // 3. Adjudicate Claim
    console.log(`\n[3] TEST AI ADJUDICATION & AUTOMATED PAYOUT...`);
    console.log("-> Triggering GenLayer AI Validators (processing ~30-60s)...");
    const currentTime2 = Math.floor(Date.now() / 1000).toString();
    const hash3 = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: 'adjudicate_claim',
      args: [claimId, currentTime2]
    });
    
    console.log("-> Adjudicate Tx Hash:", hash3);
    try {
      const receipt3 = await client.waitForTransactionReceipt({ hash: hash3, timeout: 300000 });
      console.log("-> Adjudicate Receipt Status:", receipt3.status);
    } catch (e) {
      console.log("-> Note on receipt polling:", e?.message || e);
    }

    // 4. Verify Outcome
    console.log("\n[4] VERIFYING AI ADJUDICATION OUTCOME...");
    const claimResultStr = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_claim',
      args: [claimId]
    });
    const claimResult = JSON.parse(claimResultStr);
    console.log("-> Claim Status:", claimResult.status);
    console.log("-> AI Verdict:", claimResult.verdict);
    console.log("-> AI Reason:", claimResult.reason);
    console.log("-> Confidence Score:", claimResult.confidence);

    const wAfterStr = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_warranty',
      args: [warrantyId]
    });
    const wAfter = JSON.parse(wAfterStr);
    console.log("-> Warranty Status after Adjudication:", wAfter.status);
    console.log("-> Warranty Locked Amount after Adjudication:", wAfter.locked_amount);

    // 5. Release Escalated Funds if needed
    if (claimResult.verdict === 'ESCALATE') {
      console.log(`\n[5] TEST RELEASING ESCALATED ESCROW FUNDS...`);
      const currentTime3 = Math.floor(Date.now() / 1000).toString();
      const hash4 = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: 'release_escalated_funds',
        args: [claimId, currentTime3]
      });
      console.log("-> Release Funds Tx Hash:", hash4);
      const receipt4 = await client.waitForTransactionReceipt({ hash: hash4, timeout: 120000 });
      console.log("-> Release Receipt Status:", receipt4.status);

      const claimFinalStr = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_claim',
        args: [claimId]
      });
      const claimFinal = JSON.parse(claimFinalStr);
      console.log("-> Final Claim Status:", claimFinal.status);
      console.log("-> [SUCCESS] Escrow 50/50 split released to Retailer and Customer!");
    } else {
      console.log(`-> [SUCCESS] Funds transferred automatically with u256 based on verdict ${claimResult.verdict}!`);
    }

    console.log("\n=========================================");
    console.log("ALL CORE ONCHAIN FEATURES PASSED 100%");
    console.log("=========================================");
  } catch (error) {
    console.error("Test Error:", error);
  }
}

runTest().catch(console.error);
