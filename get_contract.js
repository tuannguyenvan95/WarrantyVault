import https from 'https';

https.get('https://studio.genlayer.com/api/contracts/0x47c0144E763D95C97CdfC4BeCFE977b476C64085', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log(data));
});
