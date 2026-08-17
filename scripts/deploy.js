import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';

const RETAILER_KEY = '0x0909fe6b9b671281b871e56215874fc39897e155bbf8858207528c4cea883707';
const account = privateKeyToAccount(RETAILER_KEY);

async function deploy() {
  const client = createClient({ chain: studionet });
  console.log("Account:", account.address);
  
  const contractCode = fs.readFileSync('../contracts/warranty_vault.py', 'utf8');

  try {
    const hash = await client.deployContract({
      account,
      code: contractCode,
      args: []
    });
    console.log("Deploy Tx Hash:", hash);
    const receipt = await client.waitForTransactionReceipt({ hash });
    console.log("Deployed to:", receipt.contractAddress);
  } catch (error) {
    console.error(error);
  }
}

deploy();
