import { createClient } from "@vercel/kv";

export const kv = createClient({
  url: process.env.static_KV_REST_API_URL || process.env.KV_REST_API_URL || "",
  token:
    process.env.static_KV_REST_API_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    "",
});

export async function bumpSyncVersion(account: string): Promise<void> {
  await kv.set(`sync-version:${account}`, Date.now().toString());
}
