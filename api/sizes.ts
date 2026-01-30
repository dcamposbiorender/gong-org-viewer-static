import { kv } from '@vercel/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateAccount } from './_lib/validation';

interface SizeOverride {
  selectedSizeIndex: number | null;
  customValue: string | null;
  savedAt?: string;
  user?: string;
}

interface SizeOverridesMap {
  [key: string]: SizeOverride;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const validation = validateAccount(req.query.account as string | undefined);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.error });
  }
  const account = validation.account!;

  const kvKey = `sizes:${account}`;

  try {
    if (req.method === 'GET') {
      const data = await kv.get<SizeOverridesMap>(kvKey) || {};
      return res.json(data);
    }

    if (req.method === 'POST') {
      const { key, override, user } = req.body as {
        key: string;
        override: SizeOverride;
        user?: string;
      };

      if (!key || !override) {
        return res.status(400).json({ error: 'key and override required' });
      }

      const data = await kv.get<SizeOverridesMap>(kvKey) || {};

      data[key] = {
        ...override,
        savedAt: new Date().toISOString(),
        user: user || 'anonymous'
      };

      await kv.set(kvKey, data);
      return res.json({ success: true, savedCount: Object.keys(data).length });
    }

    if (req.method === 'DELETE') {
      const { key } = req.body as { key: string };

      if (!key) {
        return res.status(400).json({ error: 'key required' });
      }

      const data = await kv.get<SizeOverridesMap>(kvKey) || {};
      delete data[key];
      await kv.set(kvKey, data);
      return res.json({ success: true, remainingCount: Object.keys(data).length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('KV error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
}
