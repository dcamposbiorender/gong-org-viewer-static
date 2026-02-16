import { kv, bumpSyncVersion } from './_lib/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateAccount } from './_lib/validation';
import { setCorsHeaders } from './_lib/cors';

interface ManualMapEntry {
  company: string;
  source: string;
  stats: {
    totalNodes: number;
    supportedNodes: number;
    conflictingNodes: number;
  };
  root: object;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const validation = validateAccount(req.query.account as string | undefined);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.error });
  }
  const account = validation.account!;

  const kvKey = `graduated-map:${account}`;

  try {
    if (req.method === 'GET') {
      const data = await kv.get<ManualMapEntry>(kvKey);
      if (!data) {
        return res.status(404).json({ error: 'No graduated map found' });
      }
      return res.json(data);
    }

    if (req.method === 'POST') {
      const { map } = req.body as { map: ManualMapEntry };

      if (!map) {
        return res.status(400).json({ error: 'map required' });
      }

      await kv.set(kvKey, map);
      await bumpSyncVersion(account);

      return res.json({
        success: true,
        totalNodes: map.stats?.totalNodes || 0,
        savedAt: new Date().toISOString()
      });
    }

    if (req.method === 'DELETE') {
      await kv.del(kvKey);
      await bumpSyncVersion(account);
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('KV error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
}
