import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

async function getReceipt() {
  const client = createClient({ chain: studionet });
  const hash = '0xd64834002af99659f5fb7a1e2f4a2cfcfefbcca4044d18a6781e2efde0798da6';
  const receipt = await client.waitForTransactionReceipt({ hash, status: 'FINALIZED', timeout: 5000 });
  console.log(receipt);
}
getReceipt();
