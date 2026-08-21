import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const privateKeyInput = process.argv[2];

if (!privateKeyInput) {
  console.error('[LOI] Vui long truyen Private Key cua vi ban!');
  console.error('Cach dung: node scripts/deploy_wallet.js 0x_PRIVATE_KEY_CUA_BAN');
  process.exit(1);
}

const privateKey = privateKeyInput.startsWith('0x') ? privateKeyInput : `0x${privateKeyInput}`;

async function main() {
  let account;
  try {
    account = privateKeyToAccount(privateKey);
  } catch (e) {
    console.error('[LOI] Private Key khong hop le. Vui long kiem tra lai!');
    process.exit(1);
  }

  console.log('=== DANG DEPLOY CONTRACT TU VI CUA BAN ===');
  console.log('Dia chi vi Deployer (Creator):', account.address);

  const client = createClient({
    chain: studionet,
    account
  });

  const contractPath = path.join(__dirname, '..', 'contracts', 'warranty_vault.py');
  const contractCode = fs.readFileSync(contractPath, 'utf8');

  console.log('Dang gui giao dịch deploy...');
  try {
    const txHash = await client.deployContract({
      code: contractCode,
      args: []
    });

    console.log('-> Transaction Hash:', txHash);
    console.log('-> Dang cho Blockchain xac nhan...');

    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      timeout: 180000
    });

    const contractAddress = receipt.to || receipt.contractAddress || receipt.logs?.[0]?.address;

    console.log('\n==================================================');
    console.log('🎉 DEPLOY THANH CONG BANG VI CUA BAN!');
    console.log('Creator (Vi cua ban):', account.address);
    console.log('Contract Address:', contractAddress);
    console.log(`GenLayer Explorer: https://explorer-studio.genlayer.com/address/${contractAddress}`);
    console.log('==================================================\n');
  } catch (err) {
    console.error('[LOI DEPLOY]:', err?.message || err);
  }
}

main();
