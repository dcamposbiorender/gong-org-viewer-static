# GongOrgViewerStatic

## What This Is

Static org chart viewer. Extracts org structure from Gong call transcripts, displays for user review/correction.

**Two modes**: Org Map (manual map) and Match Review. No auto map — removed Feb 2026.

**Full architecture**: `docs/architecture.md`

---

## Pipeline (Memorize This)

```
batches_enriched/ → extract → extractions/ → consolidate → output/ → build_map → integrate → index.html
```

| Step | Script | Output |
|------|--------|--------|
| 1. Extract | `extract_*.py` | `extractions/{co}/entities_llm_v2.json` |
| 2. Consolidate | `consolidate_with_hierarchy.py` | `output/{co}/consolidated_with_hierarchy.json` |
| 3. Build Map | `build_true_auto_map.py` | `output/{co}_true_auto_map.json` |
| 4. Integrate | `integrate_viewer.py` | `public/js/data.js`, `manual-data.js`, `match-review-data.js` |

**Note:** `build_true_auto_map.py` still runs — its output is used to enrich MANUAL_DATA with Gong evidence and to generate MATCH_REVIEW_DATA. But the auto map is NOT injected into the viewer (`DATA = {}` stub).

`integrate_viewer.py --update` writes standalone JS files to `public/js/`. It no longer modifies `index.html`.

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

**Extraction formats differ by company:**
- GSK/AZ/Novartis: `value`, `type`, `speaker_id`
- AbbVie/others: `entity_name`, `entity_type`, NO `speaker_id`

---

## Viewer Data Structure

```javascript
// DATA is an empty stub (auto map removed)
DATA = {}

MANUAL_DATA[company] = {
  company: "Display Name",
  source: "Manual Map - Display Name",
  stats: { entities, matched, snippets },
  root: {
    id, name, type, leader,
    gongEvidence: { snippets, sizeMentions, matchedContacts, totalMentions },
    children: [/* recursive */]
  }
}

MATCH_REVIEW_DATA = {
  generated: "ISO timestamp",
  companies: {
    [company]: {
      total_unmatched: N,
      items: [{ id, gong_entity, snippet, llm_suggested_match, ... }]
    }
  }
}
```

---

## Multi-User Sync

The viewer uses 10-second polling for multi-user sync (1-3 users):

1. Every KV write bumps `sync-version:{account}` key (except autosave)
2. Client polls `/api/sync-version` every 10 seconds
3. On version change → reload all KV data, re-render current view
4. `Cache-Control: no-store` on all API responses

---

## APIs (Vercel KV)

| Endpoint | Purpose |
|----------|---------|
| `/api/corrections` | Hierarchy overrides |
| `/api/field-edits` | Name/title edits |
| `/api/match-review` | Match decisions |
| `/api/merges` | Entity consolidation |
| `/api/graduated-map` | Manual map persistence (KV overlay) |
| `/api/sizes` | Team size overrides |
| `/api/resolutions` | Gong vs public data conflicts |
| `/api/autosave` | Session state snapshots |
| `/api/sync-version` | Multi-user sync version polling |
| `/api/manual-map-overrides` | Manual map drag-drop reparenting |
| `/api/manual-map-modifications` | Manual map add/delete entities |

All endpoints: CORS enabled, `Cache-Control: no-store`, account validation via `?account=` param.

---

## Key Files

| Purpose | Location |
|---------|----------|
| Source transcripts | `batches_enriched/{co}/batch_*.json` |
| Raw extractions | `extractions/{co}/entities_llm_v2.json` |
| Auto map (pipeline intermediate) | `output/{co}_true_auto_map.json` |
| Manual maps (source) | `Manual Maps Jan 26 2026/{co}_rd_map.json` |
| Viewer HTML shell | `index.html` (project root — Vite entry point) |
| Vite config | `vite.config.ts` |
| TypeScript config | `tsconfig.json` (strict mode) |
| TypeScript types | `src/types.ts` (all interfaces) |
| Module entry point | `src/init.ts` (Vite shim — Phase 1b will migrate JS here) |
| Viewer CSS | `public/css/styles.css` |
| Viewer JS modules | `public/js/*.js` (13 files, ~4,590 lines) |
| Pipeline-generated data | `public/js/data.js`, `manual-data.js`, `match-review-data.js` (gitignored) |
| Build output | `dist/` (gitignored — Vite build output) |
| KV config | `api/_lib/kv.ts` |
| Account validation | `api/_lib/validation.ts` |
| E2E feature spec | `tests/e2e-feature-spec.md` |

### Build & Deploy

```bash
npm run build    # tsc --noEmit && vite build → dist/
npm run dev      # Vite dev server with HMR
npm run test     # Vitest (JS unit tests)
npm install --include=dev  # Required (env has omit=dev)
vercel           # Deploy dist/ + api/ to Vercel
```

### Viewer JS Module Load Order (Phase 1a — legacy globals)

```
state.js → utils.js → tree-ops.js → kv-api.js → rendering.js →
evidence.js → match-review.js → manage-entities.js → entity-merge.js →
manual-map-view.js → conflict-resolution.js → autosave-sync.js → init.js
```

All functions are still global (no ES modules yet). Load order enforced by `<script>` tag order in `index.html`. Data files load before app modules. Phase 1b will migrate to ES module imports in `src/`.

---

## Run Pipeline

```bash
python3 scripts/extract_entities.py --company {co}
python3 scripts/consolidate_with_hierarchy.py --company {co}
python3 scripts/build_true_auto_map.py --company {co}
python3 scripts/integrate_viewer.py --update
vercel
```

---

## Viewer Display Rules

- **Leader**: Shows `node.leader.name` or "?, ?" placeholder
- **Size**: First `sizeMentions[].value` or `node.size`. Shows "no source" if size but no mentions
- **Snippets**: Filtered by date range, shows quote + customerName + gongUrl link

---

## Before Making Changes

1. Read `docs/architecture.md` for full data flow
2. Check which extraction format the company uses
3. Trace field names through each pipeline stage
4. Run `python3 -m pytest tests/ -v`
