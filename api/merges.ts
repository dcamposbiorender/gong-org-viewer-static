import { kv, bumpSyncVersion } from './_lib/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateAccount } from './_lib/validation';
import { setCorsHeaders } from './_lib/cors';

interface EntityMerge {
  absorbed: string[];         // Entity IDs that were merged into canonical
  aliases: string[];          // Alternative names from merged entities
  mergedSnippets: string[];   // IDs of snippets consolidated
  mergedAt: string;
  user: string;
}

interface MergesMap {
  [canonicalEntityId: string]: EntityMerge;
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

  const kvKey = `merges:${account}`;

  try {
    if (req.method === 'GET') {
      const data = await kv.get<MergesMap>(kvKey) || {};
      return res.json(data);
    }

    if (req.method === 'POST') {
      const { canonicalId, merge, user } = req.body as {
        canonicalId: string;
        merge: Omit<EntityMerge, 'mergedAt' | 'user'>;
        user?: string;
      };

      if (!canonicalId || !merge) {
        return res.status(400).json({ error: 'canonicalId and merge required' });
      }

      const data = await kv.get<MergesMap>(kvKey) || {};

      data[canonicalId] = {
        ...merge,
        mergedAt: new Date().toISOString(),
        user: user || 'anonymous'
      };

      await kv.set(kvKey, data);
      await bumpSyncVersion(account);

      // Count total absorbed entities
      const totalAbsorbed = Object.values(data).reduce((sum, m) => sum + m.absorbed.length, 0);

      return res.json({
        success: true,
        mergeCount: Object.keys(data).length,
        totalAbsorbed
      });
    }

    if (req.method === 'DELETE') {
      const { canonicalId } = req.body as { canonicalId: string };

      if (!canonicalId) {
        return res.status(400).json({ error: 'canonicalId required' });
      }

      const data = await kv.get<MergesMap>(kvKey) || {};
      const unmerged = data[canonicalId];
      delete data[canonicalId];
      await kv.set(kvKey, data);
      await bumpSyncVersion(account);

      return res.json({
        success: true,
        remainingCount: Object.keys(data).length,
        unmergedEntities: unmerged?.absorbed || []
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('KV error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
}
