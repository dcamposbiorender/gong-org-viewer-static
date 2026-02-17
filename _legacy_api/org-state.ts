/**
 * Consolidated org state endpoint — replaces 7 separate routes.
 *
 * Usage: /api/org-state?account=abbvie&type=corrections
 *
 * Supported types: corrections, field-edits, sizes, merges,
 *   graduated-map, manual-map-overrides, manual-map-modifications, resolutions
 *
 * Methods: GET (read), POST (upsert), DELETE (remove)
 */
import { kv, bumpSyncVersion } from './_lib/kv';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateAccount } from './_lib/validation';
import { setCorsHeaders } from './_lib/cors';

const VALID_TYPES = [
  'corrections', 'field-edits', 'sizes', 'merges',
  'graduated-map', 'manual-map-overrides', 'manual-map-modifications', 'resolutions',
] as const;

type StateType = (typeof VALID_TYPES)[number];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const validation = validateAccount(req.query.account as string | undefined);
  if (!validation.isValid) return res.status(400).json({ error: validation.error });
  const account = validation.account;

  const type = req.query.type as string | undefined;
  if (!type || !VALID_TYPES.includes(type as StateType)) {
    return res.status(400).json({ error: `type parameter required. Must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const kvKey = `${type}:${account}`;

  try {
    // --- GET: Read state ---
    if (req.method === 'GET') {
      const data = await kv.get(kvKey);
      return res.json(data || {});
    }

    // --- POST: Upsert state ---
    if (req.method === 'POST') {
      // graduated-map has special handling (full map replacement)
      if (type === 'graduated-map') {
        const { map } = req.body as { map: unknown };
        if (!map) return res.status(400).json({ error: 'map required' });
        await kv.set(kvKey, map);
        await bumpSyncVersion(account);
        return res.json({ success: true });
      }

      // manual-map-modifications: store full modifications object
      if (type === 'manual-map-modifications') {
        const { modifications } = req.body as { modifications: unknown };
        if (!modifications) return res.status(400).json({ error: 'modifications required' });
        await kv.set(kvKey, modifications);
        await bumpSyncVersion(account);
        return res.json({ success: true });
      }

      // All other types: key-value merge into existing object
      const body = req.body as Record<string, unknown>;

      // Determine the entity key and value from the body
      // Each type uses different field names for the key
      const keyField = getKeyField(type);
      const entityKey = body[keyField] as string;
      if (!entityKey) return res.status(400).json({ error: `${keyField} required` });

      const existing = (await kv.get<Record<string, unknown>>(kvKey)) || {};

      // Get the value to store
      const valueField = getValueField(type);
      if (valueField) {
        existing[entityKey] = {
          ...(body[valueField] as Record<string, unknown>),
          user: (body.user as string) || 'anonymous',
          savedAt: new Date().toISOString(),
        };
      } else {
        // For resolutions, the body itself (minus the key field) is the value
        const { [keyField]: _, ...rest } = body;
        existing[entityKey] = { ...rest, savedAt: new Date().toISOString() };
      }

      await kv.set(kvKey, existing);
      await bumpSyncVersion(account);
      return res.json({ success: true });
    }

    // --- DELETE: Remove entry ---
    if (req.method === 'DELETE') {
      const body = req.body as Record<string, unknown>;
      const keyField = getKeyField(type);
      const entityKey = body[keyField] as string;
      if (!entityKey) return res.status(400).json({ error: `${keyField} required` });

      const existing = (await kv.get<Record<string, unknown>>(kvKey)) || {};
      delete existing[entityKey];
      await kv.set(kvKey, existing);
      await bumpSyncVersion(account);
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(`[org-state:${type}] KV error:`, error);
    return res.status(500).json({ error: 'Database error' });
  }
}

/** Map state type to the body field name used as the entity key. */
function getKeyField(type: string): string {
  switch (type) {
    case 'corrections': return 'entityId';
    case 'field-edits': return 'entityId';
    case 'sizes': return 'key';
    case 'merges': return 'canonicalId';
    case 'manual-map-overrides': return 'nodeId';
    case 'resolutions': return 'key';
    default: return 'entityId';
  }
}

/** Map state type to the body field name containing the value object. */
function getValueField(type: string): string | null {
  switch (type) {
    case 'corrections': return 'override';
    case 'field-edits': return 'edit';
    case 'sizes': return 'override';
    case 'merges': return 'merge';
    case 'manual-map-overrides': return 'override';
    case 'resolutions': return null; // Body itself is the value
    default: return null;
  }
}
