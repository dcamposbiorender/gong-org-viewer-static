import { kv, bumpSyncVersion } from './_lib/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateAccount } from './_lib/validation';

interface MatchDecision {
  manualNode?: string;
  manualPath?: string;
  approvedAt?: string;
  rejectedAt?: string;
  matchedAt?: string;
  manuallySelectedAt?: string;
}

interface CompanyMatchState {
  approved: { [itemId: string]: MatchDecision };
  rejected: { [itemId: string]: MatchDecision };
  manual: { [itemId: string]: MatchDecision };
}

type MatchCategory = 'approved' | 'rejected' | 'manual';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const validation = validateAccount(req.query.account as string | undefined);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.error });
  }
  const account = validation.account!;

  const kvKey = `match-review:${account}`;

  try {
    if (req.method === 'GET') {
      const data = await kv.get<CompanyMatchState>(kvKey) || {
        approved: {},
        rejected: {},
        manual: {}
      };
      return res.json(data);
    }

    if (req.method === 'POST') {
      const { itemId, decision, category, state } = req.body as {
        itemId?: string;
        decision?: MatchDecision;
        category?: MatchCategory;
        state?: CompanyMatchState;
        user?: string;
      };

      // Per-entity read-merge-write (new path)
      if (itemId && decision && category) {
        const data = await kv.get<CompanyMatchState>(kvKey) || {
          approved: {}, rejected: {}, manual: {}
        };

        // Remove from all categories first
        delete data.approved[itemId];
        delete data.rejected[itemId];
        delete data.manual[itemId];

        // Add to target category
        data[category][itemId] = decision;

        await kv.set(kvKey, data);
        await bumpSyncVersion(account);
        return res.json({ success: true, category, itemId });
      }

      // Full state overwrite (legacy path — kept for backward compat during deploy)
      if (state) {
        const existing = await kv.get<CompanyMatchState>(kvKey) || {
          approved: {}, rejected: {}, manual: {}
        };
        // Merge incoming state into existing (incoming wins)
        const merged: CompanyMatchState = {
          approved: { ...existing.approved, ...(state.approved || {}) },
          rejected: { ...existing.rejected, ...(state.rejected || {}) },
          manual: { ...existing.manual, ...(state.manual || {}) },
        };
        await kv.set(kvKey, merged);
        await bumpSyncVersion(account);
        return res.json({
          success: true,
          counts: {
            approved: Object.keys(merged.approved).length,
            rejected: Object.keys(merged.rejected).length,
            manual: Object.keys(merged.manual).length
          }
        });
      }

      return res.status(400).json({ error: 'Either {itemId, decision, category} or {state} required' });
    }

    if (req.method === 'DELETE') {
      const { itemId } = req.body as { itemId: string };

      if (!itemId) {
        return res.status(400).json({ error: 'itemId required' });
      }

      const data = await kv.get<CompanyMatchState>(kvKey) || {
        approved: {}, rejected: {}, manual: {}
      };
      delete data.approved[itemId];
      delete data.rejected[itemId];
      delete data.manual[itemId];
      await kv.set(kvKey, data);
      await bumpSyncVersion(account);
      return res.json({ success: true, itemId });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('KV error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
}
