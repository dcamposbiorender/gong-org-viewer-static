import { createClient } from '@vercel/kv';

// Use static_KV_* env vars (custom KV store for this project)
export const kv = createClient({
  url: process.env.static_KV_REST_API_URL || process.env.KV_REST_API_URL || '',
  token: process.env.static_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || '',
});
