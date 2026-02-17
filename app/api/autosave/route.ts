import { NextRequest, NextResponse } from "next/server";
import { kv } from "../_lib/kv";
import { validateAccount } from "../_lib/validation";

interface AutosaveState {
  overrides: object;
  sizeOverrides: object;
  matchReviewState: object;
  conflictResolutions: object;
  fieldEdits: object;
  entityMerges: object;
  manualMapOverrides: object;
  mode: string;
  savedAt: string;
  user?: string;
}

export async function GET(req: NextRequest) {
  const validation = validateAccount(req.nextUrl.searchParams.get("account"));
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const data = await kv.get<AutosaveState>(
      `autosave:${validation.account}`
    );
    if (!data) {
      return NextResponse.json(
        { error: "No autosave found" },
        { status: 404 }
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("[autosave] KV error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const validation = validateAccount(req.nextUrl.searchParams.get("account"));
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const { state, user } = (await req.json()) as {
      state: Omit<AutosaveState, "savedAt" | "user">;
      user?: string;
    };

    if (!state) {
      return NextResponse.json({ error: "state required" }, { status: 400 });
    }

    const autosave: AutosaveState = {
      ...state,
      savedAt: new Date().toISOString(),
      user: user || "anonymous",
    };

    await kv.set(`autosave:${validation.account}`, autosave);
    return NextResponse.json({ success: true, savedAt: autosave.savedAt });
  } catch (error) {
    console.error("[autosave] KV error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
