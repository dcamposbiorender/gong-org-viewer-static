# GongOrgViewerStatic

## What This Is

Org chart viewer rebuilt as **Next.js 15 + React + Tailwind**. Extracts org structure from Gong call transcripts, displays for user review/correction.

**Two modes**: Org Map (manual map) and Match Review. No auto map — removed Feb 2026.

**Rebuild status**: Phase 1-2 complete. Phase 3-4 in progress.
**Branch**: `feat/rebuild-v2`
**Plan**: `docs/plans/2026-02-15-feat-nextjs-react-rebuild-plan.md`

---

## Architecture (Next.js Rebuild)

```
app/
├── layout.tsx                      # Header + global layout
├── page.tsx                        # Redirect / → /manual/astrazeneca
├── globals.css                     # Tailwind import
├── manual/[company]/page.tsx       # Manual Map (tree + table toggle)
├── match-review/[company]/page.tsx # Match Review
├── not-found.tsx                   # Invalid company
├── api/
│   ├── org-state/route.ts          # Consolidated KV CRUD (8 state types)
│   ├── match-review/route.ts       # Match decisions (manualNodeId bug fixed)
│   ├── sync-version/route.ts       # Polling endpoint
│   └── autosave/route.ts           # Session snapshots
│   └── _lib/
│       ├── kv.ts                   # @vercel/kv client (static_KV_* env vars)
│       └── validation.ts           # Account validation (discriminated union)

lib/
├── types.ts                        # All TypeScript interfaces + KV state types
├── tree-ops.ts                     # Pure tree traversal (no global state)
├── build-working-tree.ts           # Pure: applies overlays to produce display tree
├── utils.ts                        # Formatting, date range, normalization
├── use-kv-state.ts                 # Single hook: fetch, sync poll, mutations

components/
├── Header.tsx                      # Company select + mode tabs (usePathname)
                                    # (Phase 3 — remaining UI components)
```

### Legacy code (still in repo, excluded from build)

| Directory | Purpose |
|-----------|---------|
| `src/` | Old Vite TypeScript modules (reference only) |
| `_legacy_api/` | Old standalone serverless functions (reference only) |
| `public/js/` | Old viewer JS modules (reference only) |
| `public/css/` | Old 1,866-line CSS (reference only) |

---

## Pipeline (Memorize This)

```
batches_enriched/ → extract → extractions/ → consolidate → output/ → build_map → integrate → JSON
```

| Step | Script | Output |
|------|--------|--------|
| 1. Extract | `extract_*.py` | `extractions/{co}/entities_llm_v2.json` |
| 2. Consolidate | `consolidate_with_hierarchy.py` | `output/{co}/consolidated_with_hierarchy.json` |
| 3. Build Map | `build_true_auto_map.py` | `output/{co}_true_auto_map.json` |
| 4. Integrate | `integrate_viewer.py --json` | `public/data/{co}/manual.json`, `match-review.json` |

**New**: `--json` flag outputs per-company JSON to `public/data/{company}/`. Old `--update` flag still works for legacy JS format.

---

## Critical Field Mappings (Why Things Break)

**Rule**: Python = snake_case → Viewer JS = camelCase

| Field | Python Files | Viewer JS |
|-------|-------------|-----------|
| Call ID | `call_id` | `callId` |
| Quote | `raw_quote` | `quote` |
| Evidence | `gong_evidence` | `gongEvidence` |
| Gong URL | `gong_url` | `gongUrl` |
| Speaker | `speaker_id` | `customerName`/`internalName` |

---

## Data Structure (JSON files)

```typescript
// public/data/{company}/manual.json
{
  company: "Display Name",
  source: "Manual Map - Display Name",
  stats: { entities, matched, snippets },
  root: {
    id, name, type, leader,
    gongEvidence: { snippets, sizeMentions, matchedContacts, totalMentions },
    children: [/* recursive */]
  }
}

// public/data/{company}/match-review.json
{
  generated: "ISO timestamp",
  total_unmatched: N,
  items: [{ id, gong_entity, snippet, llm_suggested_match, ... }]
}
```

---

## Multi-User Sync

10-second polling for multi-user sync (1-3 users):

1. Every KV write bumps `sync-version:{account}` key (except autosave)
2. Client polls `/api/sync-version` every 10 seconds
3. On version change → reload all KV data, re-render current view
4. `Cache-Control: no-store` on all API responses

---

## APIs (Vercel KV)

| Endpoint | Purpose |
|----------|---------|
| `/api/org-state?type=X&account=Y` | Consolidated KV CRUD (8 state types) |
| `/api/match-review?account=Y` | Match decisions |
| `/api/sync-version?account=Y` | Multi-user sync version polling |
| `/api/autosave?account=Y` | Session state snapshots |

**org-state types:** corrections, field-edits, sizes, merges, graduated-map, manual-map-overrides, manual-map-modifications, resolutions

---

## Key Files

| Purpose | Location |
|---------|----------|
| Source transcripts | `batches_enriched/{co}/batch_*.json` |
| Raw extractions | `extractions/{co}/entities_llm_v2.json` |
| Auto map (pipeline intermediate) | `output/{co}_true_auto_map.json` |
| Manual maps (source) | `Manual Maps Jan 26 2026/{co}_rd_map.json` |
| Pipeline-generated data | `public/data/{co}/manual.json`, `match-review.json` (gitignored) |
| TypeScript types | `lib/types.ts` |
| Tree operations (pure) | `lib/tree-ops.ts` |
| Working tree builder (pure) | `lib/build-working-tree.ts` |
| Utility functions | `lib/utils.ts` |
| KV state hook | `lib/use-kv-state.ts` |
| KV client (server) | `app/api/_lib/kv.ts` |
| Account validation (server) | `app/api/_lib/validation.ts` |
| Header component | `components/Header.tsx` |
| Next.js config | `next.config.ts` |
| Tailwind/PostCSS | `postcss.config.mjs`, `app/globals.css` |
| Tests | `lib/*.test.ts` (52 tests) |
| E2E feature spec | `tests/e2e-feature-spec.md` |

### Build & Deploy

```bash
npm run build    # next build
npm run dev      # next dev (with HMR)
npm run test     # vitest run (52 tests)
vercel           # Deploy to Vercel (zero config)
```

---

## Run Pipeline

```bash
python3 scripts/extract_entities.py --company {co}
python3 scripts/consolidate_with_hierarchy.py --company {co}
python3 scripts/build_true_auto_map.py --company {co}
python3 scripts/integrate_viewer.py --json    # Per-company JSON for Next.js
vercel
```

---

## Valid Companies

`abbvie`, `astrazeneca`, `gsk`, `lilly`, `novartis`, `regeneron`, `roche`

---

## Before Making Changes

1. Read the rebuild plan: `docs/plans/2026-02-15-feat-nextjs-react-rebuild-plan.md`
2. Check which extraction format the company uses
3. Trace field names through each pipeline stage
4. Run `npm run test`
