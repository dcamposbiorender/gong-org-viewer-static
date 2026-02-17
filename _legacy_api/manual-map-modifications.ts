import { kv, bumpSyncVersion } from './_lib/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateAccount } from './_lib/validation';
import { setCorsHeaders } from './_lib/cors';

interface Modifications {
  added: Array<{ parentId: string; node: any; addedAt: string }>;
  deleted: Array<{ nodeId: string; deletedAt: string }>;
}

interface ModificationsMap {
  [companyKey: string]: Modifications;
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
  const kvKey = `manual-map-modifications:${account}`;

  try {
    if (req.method === 'GET') {
      const data = await kv.get<ModificationsMap>(kvKey) || {};
      return res.json(data);
    }

    if (req.method === 'POST') {
      const { modifications } = req.body as { modifications: ModificationsMap };

      if (!modifications) {
        return res.status(400).json({ error: 'modifications required' });
      }

      await kv.set(kvKey, modifications);
      await bumpSyncVersion(account);
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('KV error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
}
