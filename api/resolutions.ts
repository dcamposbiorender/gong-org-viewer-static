import { kv, bumpSyncVersion } from './_lib/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateAccount } from './_lib/validation';
import { setCorsHeaders } from './_lib/cors';

interface Resolution {
  choice: 'gong' | 'public';
  resolvedAt: string;
  user?: string;
}

interface ResolutionsMap {
  [key: string]: Resolution;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Use a global key for resolutions (not per-account since conflicts span entities)
  const kvKey = 'resolutions:global';

  try {
    if (req.method === 'GET') {
      const data = await kv.get<ResolutionsMap>(kvKey) || {};
      return res.json(data);
    }

    if (req.method === 'POST') {
      const { key, resolution } = req.body as {
        key: string;
        resolution: Resolution;
      };

      if (!key || !resolution) {
        return res.status(400).json({ error: 'key and resolution required' });
      }

      const data = await kv.get<ResolutionsMap>(kvKey) || {};

      data[key] = {
        ...resolution,
        resolvedAt: new Date().toISOString(),
        user: resolution.user || 'anonymous'
      };

      await kv.set(kvKey, data);
      // Bump per-account sync version if account provided (so client polling detects change)
      const validation = validateAccount(req.query.account as string | undefined);
      if (validation.isValid) {
        await bumpSyncVersion(validation.account!);
      }
      return res.json({ success: true, savedCount: Object.keys(data).length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('KV error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
}
