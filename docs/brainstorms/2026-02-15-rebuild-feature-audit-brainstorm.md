# Brainstorm: GongOrgViewerStatic Rebuild Feature Audit

**Date:** 2026-02-15
**Status:** Complete
**Participants:** David, Claude

---

## What We're Building

An org intelligence viewer that extracts organizational structure from Gong sales call transcripts and lets users (sales reps + sales ops) review, correct, and curate org charts for 7 pharma companies. Two user types: readers (pre-call research) and curators (maintain maps, review matches).

---

## Feature List (Canonical, Prioritized)

### P0 — Core (Must Have)

| # | Feature | Notes |
|---|---------|-------|
| 1 | Company selector | Switch between 7 company org trees |
| 2 | Manual Map tree view | Hierarchical org chart with expand/collapse |
| 3 | Node selection + Evidence panel | Click node → see Gong snippets, contacts, size mentions |
| 4 | **Expanded snippet context viewer** | Click snippet → modal with transcript excerpt (contextBefore + quote highlighted + contextAfter). Speaker IDs resolved to names. Gong link. **See "Making Snippet Context Resilient" below.** |
| 5 | Inline field editing | Edit node name, leader name, leader title |
| 6 | Add/delete entities | CRUD on the manual map tree |
| 7 | Drag-drop reparenting | Move nodes between parents |
| 8 | Team size management | Input field + clickable size chips from Gong data |
| 9 | Match Review mode | Table of unmatched Gong entities with LLM suggestions |
| 10 | Approve/reject/manual match | Workflow for match decisions |
| 11 | Entity merge + alias | Absorb duplicates, manage alternative names |
| 12 | KV persistence (source of truth) | All edits persist to Vercel KV. No localStorage for data. |
| 13 | Multi-user sync (polling) | 10-second polling with abstracted sync interface |
| 14 | Gong deep links | Every snippet links back to the call in Gong |
| 15 | Pipeline: extract → consolidate → build → integrate | Offline LLM extraction with consistent schema |

### P1 — Important

| # | Feature | Notes |
|---|---------|-------|
| 16 | History/undo | See edit history, revert accidental changes. Currently no edit trail at all. |
| 17 | Table view | Flat table format as alternative to tree. Search, sort, filter. |
| 18 | Timeline date filter | Dual-range slider to filter snippets by call date |
| 19 | Match review filters | Status, confidence, search filters |
| 20 | Autosave to KV | Periodic state snapshots as safety net |

### P2 — Nice to Have

| # | Feature | Notes |
|---|---------|-------|
| 21 | Conflict resolution | Detect Gong vs manual map conflicts, resolve via modal |
| 22 | Change detection bar | Highlight reorgs, leadership changes, size changes from Gong data. Dead code today — needs reimplementation against MANUAL_DATA. **Last priority.** |
| 23 | Auto map as starting point | For new companies with no manual map, generate an auto-generated tree as a starting point for curation. Plan for auto→graduate path but don't build yet. |

---

## Key Decisions

### 1. Snippet Context: Store at Extraction Time

**Decision:** Capture contextBefore/contextAfter during LLM extraction, not in a fragile second-pass pipeline step.

**Current problem:** `find_context()` in `integrate_viewer.py` does substring matching of LLM-extracted quotes against original transcripts. If the LLM paraphrases even slightly, the match fails silently and the "Context" button disappears.

**New approach:** During extraction, the LLM already knows where it found the quote. Store a snippet ID or the surrounding context in the extraction JSON directly. The pipeline then just passes it through instead of trying to re-find it.

**Fallback:** For existing extractions that lack context, keep `find_context()` as a best-effort enrichment with fuzzy matching (e.g., `difflib.SequenceMatcher` with 0.8 threshold) instead of exact substring.

### 2. KV Is the Only Source of Truth for Data

**Decision:** KV is authoritative for all user edits. localStorage is only for UI preferences (collapsed panels, last-selected company, theme). No data duplication.

**Implication:** Every edit requires a network call. Offline editing is not supported (acceptable for 1-3 internal users on corporate networks).

**Endpoint consolidation:** Consolidate the 11 KV endpoints into ~3-4:
- `org-state` — corrections, field-edits, sizes, merges, overrides, graduated-map, manual-map-overrides, manual-map-modifications (one object per company)
- `match-review` — match decisions per company
- `sync-version` — polling endpoint
- `autosave` — session state snapshots

Fewer round-trips, simpler client. Bigger payloads per write but acceptable for this data volume.

### 3. Keep 3 MB Bundled Data

**Decision:** Keep all 7 companies in static JS files. 3 MB is fine for an internal tool with 1-3 users. Lazy loading adds complexity for no meaningful UX gain.

### 4. Multi-User Sync: Polling with Abstracted Interface

**Decision:** Keep 10-second polling. Abstract the sync mechanism behind an interface (e.g., `SyncProvider.onRemoteChange(callback)`) so swapping to SSE/WebSocket later is a client-only change.

**Why not real-time now:** Vercel serverless functions timeout at 10-25 seconds. SSE/WebSocket would require a persistent connection service (Supabase Realtime, Pusher, etc.), adding a dependency for 1-3 users.

### 5. Resolutions: Per-Company Keys

**Decision:** Use per-company KV keys for conflict resolutions (`resolutions:{account}:{company}`) instead of a single global key. Prevents cross-company pollution and aligns with how all other endpoints work.

### 6. History/Undo: KV Append Log

**Decision:** Build an edit history by appending to a KV log (`history:{account}:{company}`). Each edit stores: timestamp, user, action type, before/after values. Enables undo and audit trail.

**Constraint:** KV values have a 1 MB size limit. For large histories, truncate oldest entries or paginate.

### 7. Auto Map: Plan for It, Don't Build It

**Decision:** Architect the data model so an auto-generated tree can exist alongside the manual map. The graduation path (auto → manual) should be possible without restructuring. But don't build the auto map view or graduation UI now.

### 8. Dead Code: Remove All Auto Map References

**Decision:** In a rebuild, eliminate the ~500 lines of dead `DATA[currentCompany]` code paths. The empty `DATA = {}` stub, `renderCompany()`, `buildWorkingTree(DATA...)`, `renderTree()`, change detection code, verification badges — all of it goes. Clean slate.

---

## Missing Features & Edge Cases Found

### Silent Failures (Must Fix)

| Issue | Impact | Fix |
|-------|--------|-----|
| `getNodeSnippets()` fails for merged entities when absorbed node is only in auto map (which is empty) | Merged entity evidence is silently incomplete | Look up absorbed nodes in MANUAL_DATA tree, not DATA |
| `isModalOpen()` check misses CSS-class-toggled modals | Sync polling can refresh while user is mid-edit in a modal | Standardize all modals to use one pattern (CSS class OR inline style, not both) |
| localStorage key collisions between localhost and production | Data corruption when developing locally | Namespace localStorage keys with deployment origin |
| KV save retries once then gives up with only a toast | Edits can be silently lost on flaky network | Add retry queue with exponential backoff, show persistent error state |
| `test_bug_08` fails due to schema drift | False test confidence | Fix test to match actual extraction schema |

### Untested Features (Need Coverage)

- Manual map CRUD (add/delete entities)
- Drag-drop reparenting
- Size override chip click workflow
- Field edit save/cancel
- Multi-user sync conflict resolution
- Date range slider filtering
- Table view rendering
- All 13 JS modules have zero JS unit tests (only Python tests checking data shapes)

### Gaps in User Flows

| Flow | Gap |
|------|-----|
| User accidentally deletes a node with children | No undo. Children are gone. History/undo (P1) would fix this. |
| User approves a match, switches company, comes back | Approved match evidence injection depends on runtime state. If match-review KV data isn't loaded yet, evidence is missing until sync fires. |
| Two users merge the same entity pair simultaneously | Read-merge-write on KV should handle this, but no test verifies it. |
| User edits a node name that has an alias | Alias still points to old name. Should aliases auto-update when canonical name changes? |
| Pipeline re-run overwrites MANUAL_DATA | `integrate_viewer.py --update` regenerates `manual-data.js`. Any KV graduated-map overlay survives (it's in KV), but the base data resets. Users might see stale nodes reappear. |
| Snippet context button missing for some snippets | Quote didn't match transcript. User has no idea why context is available for some snippets but not others. Should show "Context unavailable" button instead of hiding it silently. |

---

## Open Questions

1. **Alias auto-update on rename:** When a canonical entity is renamed via field edit, should all aliases stay as-is (they're alternative names, not the canonical) or should the old canonical name become a new alias automatically?

2. **Pipeline re-run safety:** When the pipeline regenerates `manual-data.js`, should it merge with the existing KV graduated-map state, or does the KV overlay always win? Currently KV wins on load, but the base data shifts underneath.

3. **Export format:** History/undo was requested. Should the edit history be exportable (CSV/JSON) for audit purposes, or is it purely an in-app undo mechanism?

---

## Next Steps

Run `/workflows:plan` to design the rebuild implementation. This brainstorm establishes the WHAT. The plan will establish the HOW — tech stack choices, file structure, migration strategy from the current codebase.
