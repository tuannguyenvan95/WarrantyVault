import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const TX_HASH = "0xb271c9eefa07ba0166bedd3b3d9673537a84cd1449bd203bc6d84e8f0efccd4a";

async function run() {
  const client = createClient({ chain: studionet });
  try {
    const tx = await client.getTransaction({ hash: TX_HASH });
    console.log("=== Transaction Details ===");
    console.log(tx);
  } catch(e) {
    console.log("Error fetching tx:", e.message);
  }

  try {
    try {
    const receipt = await client.waitForTransactionReceipt({ hash: TX_HASH });
    console.log("=== Transaction Receipt ===");
    console.log(receipt);
  } catch (e) {
    console.log("Receipt failed:", e.message);
  }
  } catch(e) {
    console.log("Error fetching receipt:", e.message);
  }
}
run();
