import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Return the JWT so the client can upload directly to Pinata
  // bypassing Vercel's 4.5MB serverless payload limit
  return res.status(200).json({ jwt: process.env.PINATA_JWT });
}
