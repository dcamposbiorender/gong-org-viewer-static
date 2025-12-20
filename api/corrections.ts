import { kv } from '@vercel/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';

interface Override {
  originalParent: string;
  newParent: string;
  newParentName: string;
  movedAt: string;
  user?: string;
  savedAt?: string;
}

interface OverridesMap {
  [entityId: string]: Override;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { account } = req.query;

  if (!account || typeof account !== 'string') {
    return res.status(400).json({ error: 'account parameter required' });
  }

  const key = `corrections:${account}`;

  try {
    if (req.method === 'GET') {
      const data = await kv.get<OverridesMap>(key) || {};
      return res.json(data);
    }

    if (req.method === 'POST') {
      const { entityId, override, user } = req.body as {
        entityId: string;
        override: Override;
        user?: string;
      };

      if (!entityId || !override) {
        return res.status(400).json({ error: 'entityId and override required' });
      }

      const data = await kv.get<OverridesMap>(key) || {};

      data[entityId] = {
        ...override,
        user: user || 'anonymous',
        savedAt: new Date().toISOString()
      };

      await kv.set(key, data);
      return res.json({ success: true, savedCount: Object.keys(data).length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('KV error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
}
