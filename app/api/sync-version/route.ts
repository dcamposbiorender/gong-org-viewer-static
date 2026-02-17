import { NextRequest, NextResponse } from "next/server";
import { kv } from "../_lib/kv";
import { validateAccount } from "../_lib/validation";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const validation = validateAccount(req.nextUrl.searchParams.get("account"));
  if (!validation.isValid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const version =
      (await kv.get<string>(`sync-version:${validation.account}`)) || "0";
    return NextResponse.json({ version }, { headers: NO_STORE });
  } catch (error) {
    console.error("[sync-version] KV error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
