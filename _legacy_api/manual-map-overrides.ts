import { kv, bumpSyncVersion } from './_lib/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateAccount } from './_lib/validation';
import { setCorsHeaders } from './_lib/cors';

interface ManualMapOverride {
  originalParent: string;
  newParent: string;
  newParentName: string;
  movedAt: string;
}

interface OverridesMap {
  [nodeId: string]: ManualMapOverride;
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
  const kvKey = `manual-map-overrides:${account}`;

  try {
    if (req.method === 'GET') {
      const data = await kv.get<OverridesMap>(kvKey) || {};
      return res.json(data);
    }

    if (req.method === 'POST') {
      const { nodeId, override } = req.body as {
        nodeId: string;
        override: ManualMapOverride;
      };

      if (!nodeId || !override) {
        return res.status(400).json({ error: 'nodeId and override required' });
      }

      const data = await kv.get<OverridesMap>(kvKey) || {};
      data[nodeId] = override;
      await kv.set(kvKey, data);
      await bumpSyncVersion(account);
      return res.json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { nodeId } = req.body as { nodeId: string };

      if (!nodeId) {
        return res.status(400).json({ error: 'nodeId required' });
      }

      const data = await kv.get<OverridesMap>(kvKey) || {};
      delete data[nodeId];
      await kv.set(kvKey, data);
      await bumpSyncVersion(account);
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('KV error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
}
