import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const NEW_CONTRACT = "0x26e63CF890501B0f6a20B9b074700710D6077F0F";

const client = createClient({ chain: studionet });

async function test() {
  try {
    const policyUrl = "https://raw.githubusercontent.com/tuannguyenvan95/WarrantyVault/master/README.md";
    const productInfo = "Product: MacBook Pro M3 Max (2023)\nSerial: C02XQ0ABCDEF\nCategory: Electronics\nCustomer: 0x36CBA5d4d4D0A2DC6D57E81d8E82385A08C8aD36";
    const duration = "31536000";
    const expiryTimestamp = Math.floor(Date.now() / 1000) + parseInt(duration);

    const res = await client.readContract({
      address: NEW_CONTRACT,
      functionName: 'create_warranty',
      args: [policyUrl, productInfo, expiryTimestamp.toString()]
    });
    console.log("Create Warranty SIMULATION Result:", res);
  } catch(e) {
    console.error("Simulation error:", e);
  }
}
test();
