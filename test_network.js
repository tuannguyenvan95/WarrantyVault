import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const CONTRACT_ADDRESS = "0x5057Ad3C8fB7A41e99F9D960A1E242caFcd907Ff";

async function test() {
  console.log("Initializing client...");
  const client = createClient({
    chain: studionet
  });

  try {
    console.log("Fetching total warranties...");
    const totalWarrantiesStr = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_total_warranties',
      args: []
    });
    console.log("Total warranties:", totalWarrantiesStr);
    console.log("✅ Network connection successful!");
  } catch (error) {
    console.error("❌ Error testing GenLayer network:", error);
  }
}

test();
