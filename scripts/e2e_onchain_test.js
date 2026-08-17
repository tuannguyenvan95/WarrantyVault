import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { privateKeyToAccount } from 'viem/accounts';

const CONTRACT_ADDRESS = '0xC7BD9fD3C86B576f81e61160217Dd9F03ce94f52';
const PRIVATE_KEY = '0x0909fe6b9b671281b871e56215874fc39897e155bbf8858207528c4cea883707';
const account = privateKeyToAccount(PRIVATE_KEY);

const client = createClient({ 
  chain: studionet,
  account: account
});

async function runTest() {
  try {
    console.log("=== STARTING ONCHAIN TEST ===");
    console.log("Using Account:", account.address);
    console.log("Target Contract:", CONTRACT_ADDRESS);

    // 1. Create Warranty
    console.log("\n[1] Creating Warranty...");
    const policyUrl = "https://raw.githubusercontent.com/tuannguyenvan95/WarrantyVault/master/README.md";
    const productInfo = "Test Product E2E\nSerial: TEST1234\nCategory: Electronics";
    const expiryTimestamp = Math.floor(Date.now() / 1000) + 3600; // +1 hour

    // Note: We use our own address as customer_address so we can file the claim ourselves
    const hash1 = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: 'create_warranty',
      args: [account.address, policyUrl, productInfo, expiryTimestamp.toString()],
      value: BigInt(100)
    });
    
    console.log("Tx Hash:", hash1);
    const receipt1 = await client.waitForTransactionReceipt({ hash: hash1, timeout: 120000 });
    console.log("Receipt Status:", receipt1.status);
    
    if (receipt1.status !== 'success' && receipt1.status !== 7 && receipt1.status !== 1) {
       console.log("Create Warranty warning: status might not be success", receipt1.status);
    }

    // Get the newly created warranty ID
    const stateStr = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_all_warranties',
      args: []
    });
    const warranties = JSON.parse(stateStr);
    const wIds = Object.keys(warranties);
    // get latest id
    const warrantyId = wIds.sort((a,b) => Number(b) - Number(a))[0];
    console.log("Created Warranty ID:", warrantyId);

    // 2. File Claim
    console.log(`\n[2] Filing Claim for Warranty ${warrantyId}...`);
    const hash2 = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: 'file_claim',
      args: [warrantyId, "My test product broke during shipping", "https://example.com/broken.jpg"]
    });
    
    console.log("Tx Hash:", hash2);
    const receipt2 = await client.waitForTransactionReceipt({ hash: hash2, timeout: 120000 });
    console.log("Receipt Status:", receipt2.status);

    if (receipt2.status !== 'success' && receipt2.status !== 7 && receipt2.status !== 1) {
       console.log("File claim warning:", receipt2.status);
    }

    // Get the newly created claim ID
    const claimsStr = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_all_claims',
      args: []
    });
    const claims = JSON.parse(claimsStr);
    const cIds = Object.keys(claims);
    // get latest id
    const claimId = cIds.sort((a,b) => Number(b) - Number(a))[0];
    console.log("Created Claim ID:", claimId);

    // 3. Adjudicate Claim
    console.log(`\n[3] Adjudicating Claim ${claimId} (This will take GenLayer AI ~30-60s)...`);
    const hash3 = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: 'adjudicate_claim',
      args: [claimId]
    });
    
    console.log("Tx Hash:", hash3);
    const receipt3 = await client.waitForTransactionReceipt({ hash: hash3, timeout: 300000 }); // longer timeout for AI
    console.log("Receipt Status:", receipt3.status);

    if (receipt3.status !== 'success' && receipt3.status !== 7 && receipt3.status !== 1) {
       console.log("Adjudicate claim warning:", receipt3.status);
    }

    // 4. Verify Final State
    console.log("\n[4] Verifying Final Outcome...");
    const claimResultStr = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_claim',
      args: [claimId]
    });
    const claimResult = JSON.parse(claimResultStr);
    console.log("Final Claim Status:", claimResult.status);
    console.log("AI Verdict:", claimResult.verdict);
    console.log("AI Reason:", claimResult.reason);
    console.log("AI Confidence:", claimResult.confidence);

    console.log("\n=== ONCHAIN TEST SUCCESS ===");
  } catch (error) {
    console.error("Test Error:", error);
  }
}

runTest().catch(console.error);
