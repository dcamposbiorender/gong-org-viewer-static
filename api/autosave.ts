import { kv } from '@vercel/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';

interface AutosaveState {
  overrides: object;
  sizeOverrides: object;
  matchReviewState: object;
  conflictResolutions: object;
  fieldEdits: object;
  entityMerges: object;
  mode: string;
  savedAt: string;
  user?: string;
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

  const kvKey = `autosave:${account}`;

  try {
    if (req.method === 'GET') {
      const data = await kv.get<AutosaveState>(kvKey);
      if (!data) {
        return res.status(404).json({ error: 'No autosave found' });
      }
      return res.json(data);
    }

    if (req.method === 'POST') {
      const { state, user } = req.body as {
        state: Omit<AutosaveState, 'savedAt' | 'user'>;
        user?: string;
      };

      if (!state) {
        return res.status(400).json({ error: 'state required' });
      }

      const autosave: AutosaveState = {
        ...state,
        savedAt: new Date().toISOString(),
        user: user || 'anonymous'
      };

      await kv.set(kvKey, autosave);
      return res.json({ success: true, savedAt: autosave.savedAt });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('KV error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
}
