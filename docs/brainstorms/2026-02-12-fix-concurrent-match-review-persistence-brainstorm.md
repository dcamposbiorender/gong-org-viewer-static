---
topic: Fix concurrent multi-user match review persistence
date: 2026-02-12
status: decided
chosen_approach: Redis HSET per-entity + 10s polling
---

# Fix Concurrent Multi-User Match Review Persistence

## What We're Building

Fix data loss when 2+ users edit match review data simultaneously in GongOrgViewerStatic. Changes made by one user are silently overwritten by the other user's save.

## Problem Analysis (from KV forensics)

**Hard evidence:** `autosave:astrazeneca.matchReviewState["abbvie"]` contains 3 AstraZeneca items, but `match-review:abbvie` is empty in KV. AZ data was saved under the wrong company key.

**Three root causes identified:**

1. **Wrong company key on save**: `saveMatchReviewStateToKV()` uses global `currentCompany` instead of the explicit `company` parameter passed to approve/reject functions. If user switches company dropdown between action and save, data goes to wrong KV key.

2. **Full overwrite on server**: `match-review.ts` line 61 does `kv.set(key, state)` — replaces entire blob. If User A saves {item1} then User B saves {item2}, item1 is gone. Note: 5 of 8 API routes (corrections, sizes, field-edits, merges, resolutions) already do read-merge-write. Only match-review, graduated-map, and autosave do full overwrite.

3. **No live sync**: `loadMatchReviewState()` runs once on page load. Company switch doesn't reload from KV. No polling. Users never see each other's changes without full page reload.

## Why Redis HSET

**Research confirmed Vercel KV (Upstash) supports HSET/HGET/HGETALL/HDEL.** This maps perfectly to the data model:

```
# Current: single JSON blob (full overwrite risk)
match-review:novartis = { approved: {item1: {...}, item2: {...}}, rejected: {...}, manual: {...} }

# New: Redis hash (atomic per-field writes)
match-review:novartis:approved  (HASH)
  item1 = '{"manualNode":"...","approvedAt":"..."}'
  item2 = '{"manualNode":"...","approvedAt":"..."}'
match-review:novartis:rejected  (HASH)
  item3 = '{"rejectedAt":"..."}'
match-review:novartis:manual    (HASH)
  item4 = '{"manualNode":"...","matchedAt":"..."}'
```

Two users approving different items write to different hash fields — zero conflict, no read-modify-write cycle needed.

**Patterns evaluated and rejected:**
- **Lua CAS (compare-and-swap)**: Overkill for 2-5 users. Adds version tracking complexity.
- **WATCH/MULTI**: Not available on Upstash HTTP client (requires TCP connection).
- **Read-merge-write only**: Still has a race window between read and write. HSET eliminates it.

## Key Decisions

1. **Use HSET for match-review, corrections, sizes, field-edits, merges** — all store maps keyed by entity ID
2. **Keep kv.set for graduated-map and autosave** — these are single structured documents, not entity maps. Add read-merge-write for these.
3. **Fix the company key bug**: `saveMatchReviewStateToKV()` must accept explicit `company` parameter
4. **Add 10s polling** when tab is active, stop when hidden. Re-fetch and merge KV state.
5. **Migration**: One-time script to convert existing JSON blobs to Redis hashes

## Open Questions

- Do we need to handle the case where two users edit the same entity simultaneously? (HSET still does last-writer-wins per field). Decision: acceptable for 2-5 users — just show a toast "Updated by another user" via polling.
- Should autosave continue writing to its own key, or is it redundant now that individual saves are reliable? Decision: keep autosave as a safety net but lower priority.

## Next Steps

Run `/workflows:plan` to create implementation plan with phases, tests, and acceptance criteria.
