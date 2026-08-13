import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

async function run() {
  console.log("Chain ID:", studionet.id);
  const client = createClient({ chain: studionet });
  console.log("RPC:", studionet.rpcUrls.default.http[0]);
}
run();
