import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const CONTRACT_ADDRESS = "0xB8751CddC3B83d070F648C85FE6A40439c4915A6";

async function test() {
  console.log("Initializing client...");
  const client = createClient({
    chain: studionet
  });

  try {
    console.log("Simulating get_all_warranties...");
    const res = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_all_warranties',
      args: []
    });
    console.log("Simulation Result:", res);
  } catch (error) {
    console.error("❌ Simulation Failed:", error.shortMessage || error.message);
  }
}

test();
