import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { privateKeyToAccount } from 'viem/accounts';

const CONTRACT_ADDRESS = '0x9422D7c81842FF70BB8DC769B36A567a43f9937b';
const RETAILER_KEY = '0x0909fe6b9b671281b871e56215874fc39897e155bbf8858207528c4cea883707';
const account = privateKeyToAccount(RETAILER_KEY);

const client = createClient({ 
  chain: studionet,
  account: account
});

async function runTest() {
  console.log("Account:", account.address);

  try {
    const policyUrl = "https://raw.githubusercontent.com/tuannguyenvan95/WarrantyVault/master/README.md";
    const productInfo = "Product: MacBook Pro M3 Max (2023)\nSerial: C02XQ0ABCDEF\nCategory: Electronics\nCustomer: 0x36CBA5d4d4D0A2DC6D57E81d8E82385A08C8aD36";
    const duration = "31536000";
    const expiryTimestamp = Math.floor(Date.now() / 1000) + parseInt(duration);
    
    console.log("Sending transaction...");
    const hash = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: 'create_warranty',
      args: [policyUrl, productInfo, expiryTimestamp.toString(), "10"]
    });
    
    console.log("Tx Hash:", hash);
    console.log("Waiting for receipt...");
    const receipt = await client.waitForTransactionReceipt({ hash });
    
    console.log("Receipt Status:", receipt.status);

    console.log("Checking contract state...");
    const state = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_all_warranties',
      args: []
    });
    console.log("NEW Contract Warranties:", state);

    const err = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_last_error',
      args: []
    });
    console.log("Last Error:", err);

  } catch (error) {
    console.error("Error:", error);
  }
}

runTest().catch(console.error);
