import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRIVATE_KEY = '0x0909fe6b9b671281b871e56215874fc39897e155bbf8858207528c4cea883707';
const account = privateKeyToAccount(PRIVATE_KEY);

async function main() {
  console.log('=== DEPLOYING CONTRACT TO GENLAYER STUDIONET ===');
  console.log('Deployer Account:', account.address);

  const client = createClient({
    chain: studionet,
    account
  });

  const contractPath = path.join(__dirname, '..', 'contracts', 'warranty_vault.py');
  const contractCode = fs.readFileSync(contractPath, 'utf8');

  console.log('Deploying contract code from:', contractPath);
  console.log('Length of code:', contractCode.length, 'bytes');

  try {
    const txHash = await client.deployContract({
      code: contractCode,
      args: []
    });

    console.log('-> Deploy Transaction Hash:', txHash);
    console.log('-> Waiting for transaction receipt...');

    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      timeout: 180000
    });

    console.log('-> Deploy Receipt Status:', receipt.status);
    console.log('-> Contract Address:', receipt.contractAddress);
    console.log('\n[SUCCESS] Contract deployed successfully!');
    console.log('Address:', receipt.contractAddress);
    console.log(`Explorer: https://explorer-studio.genlayer.com/address/${receipt.contractAddress}`);
  } catch (err) {
    console.error('[ERROR] Deploy failed:', err?.message || err);
  }
}

main();
