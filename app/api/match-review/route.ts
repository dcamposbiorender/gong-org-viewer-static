import { NextRequest, NextResponse } from "next/server";
import { kv, bumpSyncVersion } from "../_lib/kv";
import { validateAccount } from "../_lib/validation";

interface MatchDecision {
  manualNodeId: string;
  manualNode: string;
  manualPath?: string;
  approvedAt?: string;
  rejectedAt?: string;
  matchedAt?: string;
  manuallySelectedAt?: string;
}

interface CompanyMatchState {
  approved: Record<string, MatchDecision>;
  rejected: Record<string, MatchDecision>;
  manual: Record<string, MatchDecision>;
}

type MatchCategory = "approved" | "rejected" | "manual";

const EMPTY_MATCH_STATE: CompanyMatchState = {
  approved: {},
  rejected: {},
  manual: {},
};

const NO_STORE = { "Cache-Control": "no-store" };

function getAccountFromRequest(req: NextRequest) {
  const validation = validateAccount(req.nextUrl.searchParams.get("account"));
  if (!validation.isValid) {
    return { error: NextResponse.json({ error: validation.error }, { status: 400 }) };
  }
  return { account: validation.account, kvKey: `match-review:${validation.account}` };
}

export async function GET(req: NextRequest) {
  const parsed = getAccountFromRequest(req);
  if ("error" in parsed) return parsed.error;

  try {
    const data =
      (await kv.get<CompanyMatchState>(parsed.kvKey)) || EMPTY_MATCH_STATE;
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (error) {
    console.error("[match-review] KV error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const parsed = getAccountFromRequest(req);
  if ("error" in parsed) return parsed.error;
  const { account, kvKey } = parsed;

  try {
    const { itemId, decision, category } = (await req.json()) as {
      itemId?: string;
      decision?: MatchDecision;
      category?: MatchCategory;
    };

    if (!itemId || !decision || !category) {
      return NextResponse.json(
        { error: "{itemId, decision, category} required" },
        { status: 400 }
      );
    }

    // Bug fix: ensure manualNodeId is stored for manual matches
    if (category === "manual" && !decision.manualNodeId) {
      return NextResponse.json(
        { error: "manualNodeId required for manual matches" },
        { status: 400 }
      );
    }

    const data =
      (await kv.get<CompanyMatchState>(kvKey)) || { ...EMPTY_MATCH_STATE };

    // Remove from all categories first
    delete data.approved[itemId];
    delete data.rejected[itemId];
    delete data.manual[itemId];

    // Add to target category
    data[category][itemId] = decision;

    await kv.set(kvKey, data);
    await bumpSyncVersion(account);
    return NextResponse.json({ success: true, category, itemId });
  } catch (error) {
    console.error("[match-review] KV error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const parsed = getAccountFromRequest(req);
  if ("error" in parsed) return parsed.error;
  const { account, kvKey } = parsed;

  try {
    const { itemId } = (await req.json()) as { itemId: string };

    if (!itemId) {
      return NextResponse.json({ error: "itemId required" }, { status: 400 });
    }

    const data =
      (await kv.get<CompanyMatchState>(kvKey)) || { ...EMPTY_MATCH_STATE };
    delete data.approved[itemId];
    delete data.rejected[itemId];
    delete data.manual[itemId];
    await kv.set(kvKey, data);
    await bumpSyncVersion(account);
    return NextResponse.json({ success: true, itemId });
  } catch (error) {
    console.error("[match-review] KV error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
