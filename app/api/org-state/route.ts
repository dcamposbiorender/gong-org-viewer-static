import { NextRequest, NextResponse } from "next/server";
import { kv, bumpSyncVersion } from "../_lib/kv";
import { validateAccount } from "../_lib/validation";
import type { StateType } from "@/lib/types";

const VALID_TYPES: StateType[] = [
  "corrections",
  "field-edits",
  "sizes",
  "merges",
  "graduated-map",
  "manual-map-overrides",
  "manual-map-modifications",
  "resolutions",
];

const NO_STORE = { "Cache-Control": "no-store" };

function parseParams(req: NextRequest) {
  const account = req.nextUrl.searchParams.get("account");
  const type = req.nextUrl.searchParams.get("type") as StateType | null;

  const validation = validateAccount(account);
  if (!validation.isValid) {
    return { error: NextResponse.json({ error: validation.error }, { status: 400 }) };
  }

  if (!type || !VALID_TYPES.includes(type)) {
    return {
      error: NextResponse.json(
        { error: `type parameter required. Must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      ),
    };
  }

  return { account: validation.account, type, kvKey: `${type}:${validation.account}` };
}

/** Map state type to the body field name used as the entity key. */
function getKeyField(type: StateType): string {
  switch (type) {
    case "corrections":
    case "field-edits":
      return "entityId";
    case "sizes":
    case "resolutions":
      return "key";
    case "merges":
      return "canonicalId";
    case "manual-map-overrides":
      return "nodeId";
    default:
      return "entityId";
  }
}

/** Map state type to the body field name containing the value object. */
function getValueField(type: StateType): string | null {
  switch (type) {
    case "corrections":
      return "override";
    case "field-edits":
      return "edit";
    case "sizes":
      return "override";
    case "merges":
      return "merge";
    case "manual-map-overrides":
      return "override";
    case "resolutions":
      return null;
    default:
      return null;
  }
}

export async function GET(req: NextRequest) {
  const parsed = parseParams(req);
  if ("error" in parsed) return parsed.error;

  try {
    const data = await kv.get(parsed.kvKey);
    return NextResponse.json(data || {}, { headers: NO_STORE });
  } catch (error) {
    console.error(`[org-state:${parsed.type}] KV error:`, error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const parsed = parseParams(req);
  if ("error" in parsed) return parsed.error;
  const { account, type, kvKey } = parsed;

  try {
    const body = await req.json();

    // graduated-map: full map replacement
    if (type === "graduated-map") {
      const { map } = body as { map: unknown };
      if (!map) return NextResponse.json({ error: "map required" }, { status: 400 });
      await kv.set(kvKey, map);
      await bumpSyncVersion(account);
      return NextResponse.json({ success: true });
    }

    // manual-map-modifications: full object replacement
    if (type === "manual-map-modifications") {
      const { modifications } = body as { modifications: unknown };
      if (!modifications) {
        return NextResponse.json({ error: "modifications required" }, { status: 400 });
      }
      await kv.set(kvKey, modifications);
      await bumpSyncVersion(account);
      return NextResponse.json({ success: true });
    }

    // All other types: key-value merge into existing object
    const keyField = getKeyField(type);
    const entityKey = body[keyField] as string;
    if (!entityKey) {
      return NextResponse.json({ error: `${keyField} required` }, { status: 400 });
    }

    const existing = (await kv.get<Record<string, unknown>>(kvKey)) || {};

    const valueField = getValueField(type);
    if (valueField) {
      existing[entityKey] = {
        ...(body[valueField] as Record<string, unknown>),
        user: (body.user as string) || "anonymous",
        savedAt: new Date().toISOString(),
      };
    } else {
      // For resolutions, the body itself (minus the key field) is the value
      const { [keyField]: _, ...rest } = body;
      existing[entityKey] = { ...rest, savedAt: new Date().toISOString() };
    }

    await kv.set(kvKey, existing);
    await bumpSyncVersion(account);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[org-state:${type}] KV error:`, error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const parsed = parseParams(req);
  if ("error" in parsed) return parsed.error;
  const { account, type, kvKey } = parsed;

  try {
    const body = await req.json();
    const keyField = getKeyField(type);
    const entityKey = body[keyField] as string;
    if (!entityKey) {
      return NextResponse.json({ error: `${keyField} required` }, { status: 400 });
    }

    const existing = (await kv.get<Record<string, unknown>>(kvKey)) || {};
    delete existing[entityKey];
    await kv.set(kvKey, existing);
    await bumpSyncVersion(account);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[org-state:${type}] KV error:`, error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
