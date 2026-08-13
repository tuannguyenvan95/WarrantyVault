import { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileBase64, fileName, mimeType } = req.body;
    
    if (!fileBase64 || !fileName) {
      return res.status(400).json({ error: 'Missing file data' });
    }

    // Convert Base64 to Buffer
    const base64Data = fileBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Create Blob from Buffer
    const blob = new Blob([buffer], { type: mimeType || 'image/jpeg' });

    // Build FormData
    const formData = new FormData();
    formData.append('file', blob, fileName);

    // Call Pinata API
    const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PINATA_JWT}`
      },
      body: formData
    });

    if (!pinataRes.ok) {
      const errorText = await pinataRes.text();
      console.error('Pinata error:', errorText);
      return res.status(pinataRes.status).json({ error: 'Failed to upload to Pinata', details: errorText });
    }

    const data = await pinataRes.json();
    return res.status(200).json({ ipfsHash: data.IpfsHash });
  } catch (error: any) {
    console.error('Server error:', error);
    return res.status(500).json({ error: error.message });
  }
}
