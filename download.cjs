const fs = require('fs');
async function run() {
  const res = await fetch("https://images.unsplash.com/photo-1592837936173-10025fa8964e?q=80&w=600", {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const buffer = await res.arrayBuffer();
  fs.writeFileSync('src/assets/broken.jpg', Buffer.from(buffer));
  console.log("Downloaded broken.jpg, size:", buffer.byteLength);
}
run();
