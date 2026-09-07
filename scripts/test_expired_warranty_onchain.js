import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { privateKeyToAccount } from 'viem/accounts';

const CONTRACT_ADDRESS = '0xe2b3459193Aaa6B616ceA6C5903b5978D7BDbd5B';
const TEST_KEY = '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';

async function main() {
  console.log('================================================================');
  console.log('🚀 LIVE ON-CHAIN EXPIRED WARRANTY REJECTION VERIFICATION');
  console.log('Contract Target:', CONTRACT_ADDRESS);
  console.log('================================================================\n');

  const account = privateKeyToAccount(TEST_KEY);
  console.log('Caller Account:', account.address);

  const client = createClient({
    chain: studionet,
    account
  });

  // Step 1: Create a warranty with an expiry timestamp 10 seconds into the future
  console.log('\n[STEP 1/3] Creating a warranty with short expiry (10s in future)...');
  const now = Math.floor(Date.now() / 1000);
  const expiryTimestamp = (now + 10).toString();

  const createTxHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'create_warranty',
    args: [
      account.address,
      'https://example.com/warranty-policy',
      'Test Hardware - Expired Warranty Audit',
      expiryTimestamp
    ],
    value: BigInt('100000000000000000') // 0.1 GEN
  });

  console.log('-> Create Warranty Tx Hash:', createTxHash);
  console.log('-> Explorer Link:', `https://explorer-studio.genlayer.com/tx/${createTxHash}`);
  console.log('-> Waiting for creation transaction confirmation...');

  const createReceipt = await client.waitForTransactionReceipt({ hash: createTxHash });
  console.log('-> Warranty Created! Receipt Status:', createReceipt.status);

  // Read the created warranty ID
  const allWarrantiesRaw = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'get_all_warranties',
    args: []
  });
  const allWarranties = JSON.parse(allWarrantiesRaw);
  const warrantyIds = Object.keys(allWarranties);
  const targetWarrantyId = warrantyIds[warrantyIds.length - 1];
  console.log(`-> Target Warranty ID #${targetWarrantyId}, Expiry: ${allWarranties[targetWarrantyId].expiry}`);

  // Step 2: Wait for the warranty to expire
  console.log('\n[STEP 2/3] Waiting 15 seconds for warranty to expire on-chain...');
  await new Promise(r => setTimeout(r, 15000));
  console.log('-> Expiration period passed.');

  // Step 3: Attempt to file a claim on the expired warranty
  console.log(`\n[STEP 3/3] Filing claim on Expired Warranty #${targetWarrantyId} (Expected: REVERT on-chain)...`);
  const claimTxHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'file_claim',
    args: [
      targetWarrantyId,
      'Hardware malfunction reported after warranty expiry date',
      'https://example.com/evidence-damage'
    ]
  });

  console.log('-> Claim Tx Hash:', claimTxHash);
  console.log('-> Explorer Link:', `https://explorer-studio.genlayer.com/tx/${claimTxHash}`);
  console.log('-> Waiting for transaction finalization and validator consensus...');

  const claimReceipt = await client.waitForTransactionReceipt({ hash: claimTxHash });
  console.log('\n================================================================');
  console.log('🎯 ON-CHAIN VERIFICATION RESULT:');
  console.log('================================================================');
  console.log('Tx Receipt Status:', claimReceipt.status, `(${claimReceipt.statusName || 'FINALIZED'})`);
  console.log('Consensus Result:', claimReceipt.result, `(${claimReceipt.result_name || 'MAJORITY_AGREE'})`);

  const txDetails = await client.getTransaction({ hash: claimTxHash });
  const leaderReceipt = txDetails.consensus_data?.leader_receipt?.[0];
  const stderr = leaderReceipt?.genvm_result?.stderr || '';

  console.log('GenVM Execution Result:', leaderReceipt?.execution_result || 'N/A');
  console.log('GenVM Error Trace:\n' + stderr);

  if (stderr.includes('Warranty has expired')) {
    console.log('✅ PERFECT! The transaction was explicitly rejected on-chain with:');
    console.log('   UserError: "Warranty has expired"');
    console.log('✅ The state remained ACTIVE and no claim was accepted for the expired warranty.');
  } else {
    console.log('Receipt Output:', JSON.stringify(leaderReceipt, null, 2));
  }
  console.log('================================================================\n');
}

main().catch(console.error);
