import { kv } from './_lib/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateAccount } from './_lib/validation';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const validation = validateAccount(req.query.account as string | undefined);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.error });
  }
  const account = validation.account!;

  try {
    const version = await kv.get<string>(`sync-version:${account}`) || '0';
    return res.json({ version });
  } catch (error) {
    console.error('KV error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
}
