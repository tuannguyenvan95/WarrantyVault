import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const CONTRACT_ADDRESS = "0x6BDF9C8b5AB773a50e70704eA99444B2cCfC01b2";

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
