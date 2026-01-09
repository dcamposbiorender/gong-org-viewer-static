import { kv } from '@vercel/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';

interface MatchDecision {
  manualNode?: string;
  manualPath?: string;
  approvedAt?: string;
  rejectedAt?: string;
  matchedAt?: string;
}

interface CompanyMatchState {
  approved: { [itemId: string]: MatchDecision };
  rejected: { [itemId: string]: MatchDecision };
  manual: { [itemId: string]: MatchDecision };
}

interface MatchReviewState {
  [company: string]: CompanyMatchState;
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
      const { state, user } = req.body as {
        state: CompanyMatchState;
        user?: string;
      };

      if (!state) {
        return res.status(400).json({ error: 'state required' });
      }

      await kv.set(kvKey, state);
      return res.json({
        success: true,
        counts: {
          approved: Object.keys(state.approved || {}).length,
          rejected: Object.keys(state.rejected || {}).length,
          manual: Object.keys(state.manual || {}).length
        }
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('KV error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
}
