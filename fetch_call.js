
const url = "https://raw.githubusercontent.com/tuannguyenvan95/WarrantyVault/master/README.md";
const info = "Product: MacBook Pro";
const exp = "1818134128";

const payload = {
  args: [url, info, exp],
  method: "create_warranty"
};
const calldata = Buffer.from(JSON.stringify(payload)).toString('hex');

async function check() {
  const response = await fetch("https://studio.genlayer.com/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "gen_call",
      params: [{
        to: "0x0C90381d810D0Ced954b8B66A8FD2CD9661b119E",
        data: `0x${calldata}`
      }]
    })
  });
  console.log(await response.text());
}
check();
