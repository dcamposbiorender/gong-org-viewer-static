import { kv } from '@vercel/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateAccount } from './_lib/validation';

interface FieldEdit {
  name?: { original: string; edited: string };
  leaderName?: { original: string; edited: string };
  leaderTitle?: { original: string; edited: string };
  editedAt: string;
  user: string;
}

interface FieldEditsMap {
  [entityId: string]: FieldEdit;
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

  const kvKey = `field-edits:${account}`;

  try {
    if (req.method === 'GET') {
      const data = await kv.get<FieldEditsMap>(kvKey) || {};
      return res.json(data);
    }

    if (req.method === 'POST') {
      const { entityId, edit, user } = req.body as {
        entityId: string;
        edit: Omit<FieldEdit, 'editedAt' | 'user'>;
        user?: string;
      };

      if (!entityId || !edit) {
        return res.status(400).json({ error: 'entityId and edit required' });
      }

      const data = await kv.get<FieldEditsMap>(kvKey) || {};

      data[entityId] = {
        ...edit,
        editedAt: new Date().toISOString(),
        user: user || 'anonymous'
      };

      await kv.set(kvKey, data);
      return res.json({ success: true, editCount: Object.keys(data).length });
    }

    if (req.method === 'DELETE') {
      const { entityId } = req.body as { entityId: string };

      if (!entityId) {
        return res.status(400).json({ error: 'entityId required' });
      }

      const data = await kv.get<FieldEditsMap>(kvKey) || {};
      delete data[entityId];
      await kv.set(kvKey, data);
      return res.json({ success: true, remainingCount: Object.keys(data).length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('KV error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
}
