import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

async function getTx() {
  const client = createClient({ chain: studionet });
  const tx = await client.getTransaction({ hash: '0x6723c6729a1b640902bde62fcd75ffe6b5fa4e161af0ff91a9423e76fbae54c0' });
  console.log(JSON.stringify(tx.consensus_data.leader_receipt, null, 2));
}
getTx();
