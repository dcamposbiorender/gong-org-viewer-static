---
title: "Remove Auto Map, Fix Cache, Simplify to Manual Map + Match Review"
type: refactor
date: 2026-02-13
priority: P0
reviewed_by: DHH, Code Simplicity, Architecture Strategist
---

# Remove Auto Map, Fix Cache, Simplify to Manual Map + Match Review

## Overview

Three interconnected problems surfaced after last night's merge of "NBIR Emeryville" into "Biomedical Research (NBIR or BR)" for Novartis:

1. **A bug causes manual map changes to appear in auto map** (variable reference error)
2. **No multi-user cache invalidation** — other users don't see changes without force-reload
3. **The auto map / manual map / graduate system is confusing and error-prone**

This plan proposes: fix the immediate bug, remove auto map entirely, and add lightweight polling for multi-user sync. All in one sitting, one deploy.

---

## Part 1: Root Cause Analysis — What Went Wrong Last Night

### Bug #1: Variable Reference Error in `saveManualMapModifications()`

**File:** `public/index.html:103623-103649`

```javascript
async function saveManualMapModifications(company) {
  company = company || currentCompany;
  // ...
  graduatedMaps[company] = MANUAL_DATA[company];        // ✅ Uses parameter
  // ...
  const response = await fetch(kvApiUrl('graduated-map', company), {  // ✅ URL uses parameter
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ map: MANUAL_DATA[currentCompany] })  // ❌ BUG: Uses global
  });
}
```

**The problem:** The KV endpoint URL correctly uses the `company` parameter, but the POST body uses `MANUAL_DATA[currentCompany]` (the global variable) instead of `MANUAL_DATA[company]`. This was introduced in commit `15a7e7b` when the function was changed from parameterless to accepting a `company` argument — the body payload was never updated.

**Impact:** If the user is viewing one company but saving modifications for another (e.g., during initialization or cross-company operations), the wrong company's manual map data gets written to the correct company's KV key.

### Bug #2: Graduation Creates Confusion About Data Source

When a user "graduates" the auto map, the `graduateToManualMap()` function (line 104235) takes `DATA[company]` (auto map), converts it, and stores it as `MANUAL_DATA[company]`. This means:

- **Manual map changes end up looking like they're in the auto map** because the graduated manual map was built FROM the auto map
- There's no clear visual indicator of whether data was user-curated or auto-graduated
- The `source` field says `"Graduated from Auto on 2026-02-12"` but users don't see this

### Bug #3: No Cross-Browser/Cross-User Cache Invalidation

The system loads all KV data **once** at page initialization (line 107369-107385):

```javascript
await Promise.all([
  loadOverrides(), loadSizeOverrides(), loadMatchReviewState(),
  loadFieldEdits(), loadEntityMerges(), loadGraduatedMaps(),
  loadManualMapOverrides(), loadResolutions()
]);
```

After that, **there is zero mechanism to detect changes made by another user**. No polling, no SSE, no version checking. The only way to see another user's changes is force-reload (`Ctrl+Shift+R`).

Additionally, `localStorage` acts as a first-load cache (line 104293-104298 in `loadGraduatedMaps()`), so even a normal reload may serve stale data from localStorage before KV overrides it.

### Why the User Saw the Merge in Auto Map, Not Manual Map

The likely sequence:

1. Last night, someone merged NBIR Emeryville into BR on the manual map
2. `saveManualMapModifications('novartis')` was called
3. Due to Bug #1, the KV write used `MANUAL_DATA[currentCompany]` — if `currentCompany` happened to match, the data was correct but the graduated map structure was built from auto data (Bug #2)
4. This morning, the other user's browser had stale localStorage from yesterday (Bug #3)
5. On force-reload, KV data was fetched — the merged structure appeared, but since the graduated map source was "from Auto", the rendering logic may have displayed it under the auto map view
6. In a fresh browser (no localStorage), KV loaded directly and showed the merged structure

---

## Part 2: Cache Strategy for Small App (1-3 Users)

### Research Findings

| Approach | Verdict | Why |
|----------|---------|-----|
| **Polling with version key** | **Recommended** | Simple, cheap ($0.016/day for 3 users at 10s intervals), works with Vercel serverless |
| SSE (Server-Sent Events) | Not viable | Vercel serverless functions timeout at 10-60s |
| WebSockets | Overkill | Requires Rivet or separate WS server |
| Upstash Pub/Sub | Overkill | Needs SSE transport layer, same timeout problem |
| SWR library | Not applicable | React-only; this is vanilla JS |

### Recommended Solution: Lightweight Version Polling

**How it works:**
1. Every KV write (except autosave) bumps a `sync-version:{account}` key with `Date.now()`
2. Client polls `/api/sync-version?account=novartis` every 10 seconds
3. If version changed since last check → reload all KV data and re-render
4. Skip re-render if an edit modal or drag-drop is in progress

**Cost:** 3 users x 6 polls/min = 18 req/min = ~26K req/day. At Vercel Pro pricing ($0.60/1M edge requests), this costs $0.016/day.

### Cache Hardening

Only one mechanism needed: `Cache-Control: no-store` on all API handler responses. No `_t=` cache-busters, no `vercel.json` header overrides — trust the response headers.

---

## Part 3: Plan to Remove Auto Map

### What Gets Removed

The "auto map" is the `DATA` object — auto-extracted org charts from Gong transcripts. Currently the system has three modes: Auto, Manual Map, Match Review. We remove Auto entirely.

**Components to remove:**

| Component | Location | Action |
|-----------|----------|--------|
| `DATA` global object | `index.html:2310` (~39K lines of embedded JSON) | Replace with `const DATA = {}` safety stub |
| `setMode('auto')` / Auto button | `index.html:105481` | Remove auto option |
| `renderCompany()` for auto mode | Multiple locations | Remove auto rendering path |
| `autoModeBtn` HTML element | `index.html:1883` | Remove button |
| `currentMode = 'auto'` default | `index.html:103023` | Default to `'manual'` |
| `graduateToManualMap()` function | `index.html:104235-104289` | Remove (no graduation needed) |
| `graduateBtn` HTML/JS | Multiple locations | Remove button |
| `duplicatesBtn` + `findDuplicateLeaders()` | `setMode()`, line 103842 | Remove (auto-only) |
| `updateDuplicatesBadge()` | line 104337 | Remove (crashes without DATA) |
| `setTimeout(updateDuplicatesBadge, 100)` | line 107384 | **Must remove** — crashes on init |
| `buildWorkingTree()` | Used for auto rendering | Remove (manual uses `buildManualMapWorkingTree`) |
| `convertToManualMapNode()` | Used only by graduate | Remove |
| `overrides` system + `loadOverrides()`/`saveOverrides()` | Auto-map corrections | Remove |
| `renderTree()` auto-mode renderer | line 104640-104860 | Remove |
| `countChangesInRange()` | line 104616 | Remove (uses DATA exclusively) |
| `showChanges(type)` | line 105327-105389 | Remove (auto-mode change summary) |
| `collectAllSnippets()` auto path | line 105188-105220 | Remove |
| `showGraduateModal()` / `performGraduation()` | line 104031+ | Remove |
| `resetAllBtn` handler | line 107445-107460 | Remove (resets auto overrides) |
| `generate_auto_map.py` | `scripts/` | Archive |
| `compare_maps.py` | `scripts/` | Archive |
| `generate_match_batches_from_auto_map.py` | `scripts/` | Archive |
| `classify_numbers.py` `apply_to_auto_maps()` | `scripts/` | Archive function |
| Auto map output files | `output/*_true_auto_map.json`, `output/*_enriched_auto_map.json` | Archive |

**File size impact:** Removing `DATA` (~39K lines) from `index.html` reduces file size from 7.9MB to ~4MB.

### Critical: `DATA[` Reference Audit (27+ locations)

All references to `DATA[` must be handled. Categories:

**Remove entirely (auto-mode-only code being deleted):**
- `renderCompany()`, `buildWorkingTree()`, `renderTree()`, `showGraduateModal()`, `performGraduation()`, `countChangesInRange()`, `showChanges()`, `startEdit()`, `saveEdit()`, `getOriginalParentName()`, `findDuplicateLeaders()`, `executeMerge(groupIdx)`, `resetAllBtn`

**Redirect to MANUAL_DATA (shared code that must survive):**
- `buildMergeEntityInfo()` line 106110 — match review merge helper, change `findNodeById(DATA[currentCompany]?.root, ...)` to `findManualNodeById(MANUAL_DATA[currentCompany]?.root, ...)`
- `showMergePreview()` line 106326 — same pattern
- `renderManualMapView()` line 107229 — change `DATA[companyKey]?.company` to `MANUAL_DATA[companyKey]?.company`
- `getNodeSnippets(node)` line 104864 — remove DATA fallback for absorbed entities
- Table sort/filter handlers lines 107557-107569 — redirect to MANUAL_DATA
- `showVerificationConflicts()` line 107490 — redirect to MANUAL_DATA
- Timeline slider `updateSliders()` line 107545 — change `renderCompany()` to `renderManualMapView()`

**Safety net:** Replace `const DATA = { ... }` with `const DATA = {}` stub to prevent ReferenceErrors from any missed locations.

### What Stays

| Component | Why |
|-----------|-----|
| `MANUAL_DATA` | The source of truth — user-curated org charts |
| `MATCH_REVIEW_DATA` | Match review system stays |
| Manual Map view | Primary view mode (renamed "Org Map") |
| Match Review view | Secondary view mode |
| All KV endpoints | Corrections, field-edits, merges, sizes, match-review, graduated-map |
| `renderManualMapView()` | Now the only render path |
| `manualMapOverrides` | Drag-drop persistence for manual map |
| `saveManualMapModifications()` | KV sync (after bug fix) |
| Pipeline extraction + consolidation scripts | Still extract from Gong |
| **`build_true_auto_map.py`** | **KEEP in pipeline** — output feeds MANUAL_DATA enrichment and MATCH_REVIEW_DATA generation |

### Critical: Keep `build_true_auto_map.py` in Pipeline

**The auto map JSON files are still needed by the pipeline** even though we stop injecting DATA into HTML:

1. `convert_manual_map_to_viewer(company, manual_map, enriched_map)` uses the auto map to merge Gong evidence (snippets, sizes, leaders) into MANUAL_DATA nodes
2. `generate_match_review_from_auto_map(company, enriched_map, manual_map)` finds entities in auto map NOT in manual map to populate MATCH_REVIEW_DATA

Removing `build_true_auto_map.py` would result in MANUAL_DATA having zero Gong evidence and MATCH_REVIEW_DATA being empty. **Only stop injecting its output as the `DATA` JS variable into index.html.**

### Simplified Mode System

**Before:** `auto` | `manual` | `matchReview` (3 modes, default: auto)
**After:** `manual` | `matchReview` (2 modes, default: manual)

```javascript
// Before
let currentMode = 'auto'; // 'auto', 'manual', or 'matchReview'

// After
let currentMode = 'manual'; // 'manual' or 'matchReview'
```

The mode toggle bar becomes two buttons instead of three:
```html
<button id="manualModeBtn" class="active">Org Map</button>
<button id="matchReviewBtn">Match Review</button>
```

**Handle stale localStorage:** Existing users may have `orgChartMode: 'auto'` in localStorage. The init code must treat `'auto'` as `'manual'`:
```javascript
const savedMode = localStorage.getItem('orgChartMode');
if (savedMode === 'matchReview') {
  currentMode = 'matchReview';
} else {
  currentMode = 'manual'; // catches 'auto', 'manual', null, anything else
}
```

### Pipeline After Removal

```
extract → consolidate → build_true_auto_map → integrate_viewer (inject MANUAL_DATA + MATCH_REVIEW_DATA only, skip DATA)
```

---

## Part 4: Implementation Plan

### Phase 1: Do the Work (3-4 hrs)

Everything in one sitting.

**1A. Fix variable reference bug** (`public/index.html:103637`)
```javascript
// Before (BUG):
body: JSON.stringify({ map: MANUAL_DATA[currentCompany] })

// After (FIX):
body: JSON.stringify({ map: MANUAL_DATA[company] })
```

**1B. Add `Cache-Control: no-store` to all API endpoints**
Files: `api/corrections.ts`, `api/field-edits.ts`, `api/sizes.ts`, `api/merges.ts`, `api/match-review.ts`, `api/resolutions.ts`, `api/graduated-map.ts`, `api/autosave.ts`

Add after CORS headers in each handler:
```typescript
res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
```

**1C. Extract `bumpSyncVersion()` helper into `api/_lib/kv.ts`**
```typescript
export async function bumpSyncVersion(account: string) {
  await kv.set(`sync-version:${account}`, Date.now().toString());
}
```

**1D. Create `/api/sync-version.ts`**
- GET: Returns `{ version: "<timestamp>" }` from `sync-version:{account}` key
- Include `Cache-Control: no-store`

**1E. Add `bumpSyncVersion(account)` to every POST/DELETE handler**
- All API files **except `autosave.ts`** (autosave fires every 5 min on a timer; bumping sync-version would cause unnecessary reload cycles for other users)

**1F. Add client-side polling** (`public/index.html`)
- Poll `/api/sync-version` every 10 seconds
- On version change: reload all KV data, re-render current view
- Guard: skip re-render if edit modal or drag-drop is in progress (`isEditing` flag)

**1G. Remove `DATA` global and all auto-mode code**
- Replace `const DATA = { ... }` with `const DATA = {}` safety stub
- Remove auto mode from `setMode()`, remove `autoModeBtn`
- Remove `graduateToManualMap()`, `showGraduateModal()`, graduate modal HTML
- Remove `buildWorkingTree()`, `convertToManualMapNode()`, `renderTree()` auto renderer
- Remove `overrides` system, `loadOverrides()`, `saveOverrides()`
- Remove `findDuplicateLeaders()`, `updateDuplicatesBadge()`, `duplicatesBtn`
- Remove `setTimeout(updateDuplicatesBadge, 100)` from init
- Remove `renderCompany()` and redirect callers to `renderManualMapView()`
- Remove `countChangesInRange()`, `showChanges()`, `collectAllSnippets()` auto path
- Remove `resetAllBtn` handler (or redirect to manual map reset)
- Remove `startEdit()`/`saveEdit()` if auto-only, or redirect to MANUAL_DATA

**1H. Fix all `DATA[` references in surviving code**
- `buildMergeEntityInfo()` line 106110 → use MANUAL_DATA
- `showMergePreview()` line 106326 → use MANUAL_DATA
- `renderManualMapView()` line 107229 → use `MANUAL_DATA[companyKey]?.company || companyKey`
- `getNodeSnippets()` line 104864 → remove DATA fallback
- Table sort/filter handlers → redirect to MANUAL_DATA
- `showVerificationConflicts()` → redirect to MANUAL_DATA
- Timeline `updateSliders()` → call `renderManualMapView()` instead of `renderCompany()`

**1I. Handle stale localStorage `orgChartMode: 'auto'`**
- In init code, treat any mode that isn't `'matchReview'` as `'manual'`

**1J. Update `integrate_viewer.py`**
- Remove `DATA` injection (keep the auto map loading for MANUAL_DATA enrichment and MATCH_REVIEW_DATA generation)
- Add `const DATA = {}` stub in the output HTML

**1K. Archive dead scripts**
- Move `generate_auto_map.py`, `compare_maps.py`, `generate_match_batches_from_auto_map.py` to `archive/`

### Phase 2: Verify & Deploy (30 min)

**2A. Manual testing checklist**
- [ ] Load Novartis manual map — NBIR Emeryville merged into BR visible
- [ ] Make a correction on Browser A, verify it appears on Browser B within 15s
- [ ] Switch companies — data loads correctly
- [ ] Match review still works — items render, approve/reject persists
- [ ] Field edits persist and show across browsers
- [ ] Entity merges persist and show across browsers
- [ ] No auto map button visible
- [ ] No graduate button visible
- [ ] Table sort/filter works without errors
- [ ] Timeline slider works without errors
- [ ] No console errors on page load
- [ ] Page load time improved (smaller HTML file)

**2B. Run existing tests**
```bash
python3 -m pytest tests/ -v
```

**2C. Deploy**
```bash
vercel --prod
```

---

## Acceptance Criteria

### Functional
- [ ] Only two modes exist: "Org Map" and "Match Review"
- [ ] No auto map button, no graduate button, no duplicates button
- [ ] Manual map is the sole org chart view
- [ ] Match review works against manual map nodes
- [ ] All KV endpoints still work (corrections, field-edits, merges, sizes, match-review)
- [ ] Changes made by User A are visible to User B within 15 seconds without manual reload

### Non-Functional
- [ ] `index.html` file size reduced by ~4MB (from 7.9MB to ~4MB)
- [ ] API responses include `Cache-Control: no-store` header
- [ ] Polling costs < $0.05/day for 3 users
- [ ] No `localStorage` stale data issues on first load (KV always wins)

### Data Integrity
- [ ] Existing graduated maps in KV are preserved (they become the primary data)
- [ ] The variable reference bug (`MANUAL_DATA[currentCompany]` → `MANUAL_DATA[company]`) is fixed
- [ ] No data loss during migration
- [ ] MATCH_REVIEW_DATA still populated (pipeline still builds auto map files)
- [ ] MANUAL_DATA still has Gong evidence (snippets, sizes on nodes)

---

## Risk Analysis

| Risk | Mitigation |
|------|------------|
| Missed `DATA[` reference causes crash | `const DATA = {}` safety stub; grep audit of all 27+ locations |
| Match review crashes in merge helpers | Redirect `buildMergeEntityInfo`/`showMergePreview` to MANUAL_DATA |
| `updateDuplicatesBadge` crashes on init | Remove the `setTimeout` call at line 107384 |
| Timeline slider calls `renderCompany()` | Redirect to `renderManualMapView()` |
| Users with `orgChartMode: 'auto'` in localStorage | Init code defaults unknown modes to `'manual'` |
| Pipeline produces empty MATCH_REVIEW_DATA | Keep `build_true_auto_map.py` in pipeline; only skip DATA injection |
| Last-writer-wins race on KV | Known limitation, acceptable for 1-3 users, documented |
| Polling re-render disrupts active edit | `isEditing` guard flag, skip re-render when modal is open |
| Graduated map stats format mismatch | Cosmetic only; `totalNodes` vs `entities` shows inconsistently until re-saved |

---

## Files Modified

| File | Changes |
|------|---------|
| `public/index.html` | Fix bug, remove DATA/auto mode (~39K lines), add polling, fix all DATA[ refs |
| `api/_lib/kv.ts` | Add `bumpSyncVersion()` helper |
| `api/sync-version.ts` | **New file** — version endpoint |
| `api/corrections.ts` | Add Cache-Control, call bumpSyncVersion |
| `api/field-edits.ts` | Add Cache-Control, call bumpSyncVersion |
| `api/sizes.ts` | Add Cache-Control, call bumpSyncVersion |
| `api/merges.ts` | Add Cache-Control, call bumpSyncVersion |
| `api/match-review.ts` | Add Cache-Control, call bumpSyncVersion |
| `api/resolutions.ts` | Add Cache-Control, call bumpSyncVersion |
| `api/graduated-map.ts` | Add Cache-Control, call bumpSyncVersion |
| `api/autosave.ts` | Add Cache-Control only (NO sync version bump) |
| `scripts/integrate_viewer.py` | Remove DATA injection, keep auto map loading for enrichment |

**Archived to `archive/`:**
- `scripts/generate_auto_map.py`
- `scripts/compare_maps.py`
- `scripts/generate_match_batches_from_auto_map.py`

---

## References

- Variable reference bug: `public/index.html:103637`
- Graduate function: `public/index.html:104235-104289`
- Load graduated maps: `public/index.html:104292-104332`
- Mode switcher: `public/index.html:105481-105537`
- Match review merge helpers: `public/index.html:106110, 106326`
- Init duplicates badge: `public/index.html:107384`
- Timeline slider: `public/index.html:107545`
- Table handlers: `public/index.html:107557-107569`
- KV config: `api/_lib/kv.ts`
- Previous persistence plan: `docs/plans/2026-02-13-fix-remaining-state-persistence-plan.md`
- Global state persistence plan: `docs/plans/2026-02-12-fix-global-state-persistence-plan.md`
- Vercel CDN Cache docs: https://vercel.com/docs/cdn-cache
- Vercel Cache-Control headers: https://vercel.com/docs/headers/cache-control-headers
