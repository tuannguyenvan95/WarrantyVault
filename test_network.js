import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const CONTRACT_ADDRESS = "0x13Bf1771827997d82fce0D97F46c400141c04205";

async function test() {
  console.log("Initializing client...");
  const client = createClient({
    chain: studionet
  });

  try {
    console.log("Reading warranties...");
    const res = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_all_grants',
      args: []
    });
    console.log("Warranties:", res);
  } catch (error) {
    console.error("❌ Simulation Failed:", error.shortMessage || error.message);
  }
}

test();
