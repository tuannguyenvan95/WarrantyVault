import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch('https://api.pinata.cloud/users/generateApiKey', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PINATA_JWT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        keyName: "WarrantyVault Frontend Upload",
        permissions: {
          endpoints: {
            pinning: {
              pinFileToIPFS: true
            }
          }
        },
        maxUses: 1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ error: `Pinata API Error: ${errorText}` });
    }

    const data = await response.json();
    return res.status(200).json({ jwt: data.JWT });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
