---
title: "feat: Rebuild GongOrgViewerStatic as Next.js/React App"
type: feat
date: 2026-02-15
status: reviewed
---

# Rebuild GongOrgViewerStatic as Next.js/React App

## Overview

Clean rewrite of the org chart viewer from Vite + vanilla TypeScript to Next.js + React + Tailwind. The current Vite build deploys fine but the `api/*.ts` serverless functions fight Vercel at every turn (framework detection, `type:module` conflicts, runtime version mismatches, 401s behind deployment protection). Next.js is Vercel's first-class citizen — zero deployment friction.

**Scope**: Rewrite all 15 P0 features. Drop 8 legacy API endpoints. Port 3,416 lines of vanilla TS to ~8 React components + 1 custom hook. Replace 1,866-line CSS with Tailwind.

**Branch**: `feat/rebuild-v2`

**Reference Docs**:
- Feature audit: `docs/brainstorms/2026-02-15-rebuild-feature-audit-brainstorm.md`
- Tech stack: `docs/brainstorms/2026-02-15-nextjs-rebuild-brainstorm.md`

**Post-review simplifications** (from DHH, Kieran, Simplicity reviews):
- Dropped React Query — replaced with single `useKVState` hook (~80 lines)
- Dropped `sonner` — 20-line custom toast
- Dropped `AppContext`/`providers.tsx` — props only
- Collapsed 9 phases → 4 phases
- Collapsed 31 files → ~18 files
- Deferred autosave (P1) and ConflictResolutionModal (P2)
- Fixed Kieran's type safety issues (missing KV interfaces, impure tree-ops, discriminated union for API)
- Keep bundled 3MB data for V1 (skip pipeline JSON split)

---

## Problem Statement

4 consecutive deploy-fix commits (`14f2505`, `c74fed9`, `e9e2259`, uncommitted vercel.json change) without resolving API route deployment. The architecture (Vite + standalone serverless) requires constant workarounds that Next.js eliminates.

---

## Architecture

```
app/
├── layout.tsx                      # Header inline (company select, mode nav, stats, timeline)
├── page.tsx                        # Redirect / → /manual/astrazeneca
├── manual/[company]/page.tsx       # Manual Map (tree + table toggle)
├── match-review/[company]/page.tsx # Match Review
├── not-found.tsx                   # Invalid company
├── api/
│   ├── org-state/route.ts          # Consolidated KV CRUD (8 state types)
│   ├── match-review/route.ts       # Match decisions
│   ├── sync-version/route.ts       # Polling endpoint
│   └── autosave/route.ts           # Session snapshots
│   └── _lib/
│       ├── kv.ts                   # @vercel/kv client (static_KV_* env vars)
│       └── validation.ts           # Account validation + discriminated unions

components/
├── Header.tsx                      # All header UI inline (~80 lines)
├── TreeView.tsx                    # Tree container + recursive TreeNode + InlineEditForm
├── EvidencePanel.tsx               # Panel + snippet cards + size chips inline
├── MatchReviewTable.tsx            # Table + filters inline
├── ManageEntitiesModal.tsx         # Create/Delete/Merge tabs
├── SnippetContextModal.tsx         # Transcript context viewer
├── EntityPickerModal.tsx           # Entity search/select for manual matching

lib/
├── types.ts                        # All TypeScript interfaces (expanded with KV state types)
├── tree-ops.ts                     # Pure tree traversal (refactored: no global state reads)
├── build-working-tree.ts           # Pure: applies overlays to produce display tree
├── utils.ts                        # Formatting, date range, normalization, VALID_ACCOUNTS
├── use-kv-state.ts                 # Single hook: fetch all KV state, sync poll, mutations
```

**Total: ~18 files.** Every file is substantial enough to justify its existence.

---

## State Model

| State | Owner | Persistence |
|-------|-------|-------------|
| `company` | URL param `[company]` | URL |
| `mode` | URL path (`/manual` vs `/match-review`) | URL |
| `view` | `useState` in manual page | localStorage |
| `selectedNode` | `useState` in manual page (lifted, passed as props to TreeView + EvidencePanel) | None |
| `dateRange` | `useState` in manual page | None |
| All KV data (corrections, field-edits, sizes, merges, overrides, modifications, graduated-map, match-review) | `useKVState` hook | KV (no localStorage) |
| `draggedNodeId` | `useRef` in TreeView | None |
| `editingNodeId` | `useState` in TreeView | None |
| `tableSortKey/Asc` | `useState` in table view | None |

**No React Query. No Context. No providers.** One custom hook (`useKVState`) handles all KV data with `useEffect` + `fetch` + `useState`. Mutations are apply-and-save (no rollback — show toast on failure instead).

### `useKVState` Hook (~80 lines)

```typescript
function useKVState(company: string) {
  const [state, setState] = useState<OrgState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const lastVersionRef = useRef<string>('');
  const isDraggingRef = useRef(false);

  // Load all KV state on company change
  useEffect(() => {
    setLoading(true);
    fetchAllOrgState(company).then(data => {
      setState(data);
      setLoading(false);
    });
  }, [company]);

  // 10-second sync polling
  useEffect(() => {
    const interval = setInterval(async () => {
      if (document.hidden || isDraggingRef.current) return;
      const version = await fetchSyncVersion(company);
      if (version !== lastVersionRef.current) {
        const data = await fetchAllOrgState(company);
        setState(data);
      }
      lastVersionRef.current = version;
    }, 10_000);
    return () => clearInterval(interval);
  }, [company]);

  // Apply-and-save mutation (no rollback)
  const save = useCallback(async (type: StateType, body: OrgStateBody) => {
    setState(prev => applyUpdate(prev, type, body));
    const ok = await postOrgState(company, type, body);
    if (!ok) showToast('Save failed — change applied locally but not synced');
  }, [company]);

  return { state, loading, save, isDraggingRef };
}
```

---

## Type Safety Fixes (from Kieran's review)

### 1. Missing KV state interfaces — add to `lib/types.ts`

```typescript
export interface FieldEdit {
  name?: { original: string; edited: string };
  leaderName?: { original: string; edited: string };
  leaderTitle?: { original: string; edited: string };
  savedAt?: string;
}

export interface EntityMerge {
  absorbed: string[];
  aliases?: string[];
  mergedAt: string;
}

export interface ManualMapOverride {
  originalParent: string;
  newParent: string;
  newParentName?: string;
  movedAt: string;
}

export interface CompanyModifications {
  added: Array<{ id: string; name: string; parentId: string; addedAt: string }>;
  deleted: Array<{ id: string; deletedAt: string }>;
}

export type StateType = 'corrections' | 'field-edits' | 'sizes' | 'merges'
  | 'graduated-map' | 'manual-map-overrides' | 'manual-map-modifications' | 'resolutions';
```

### 2. Discriminated union for API route request body

```typescript
export type OrgStateRequest =
  | { type: 'corrections'; entityId: string; override: Override }
  | { type: 'field-edits'; entityId: string; edit: FieldEdit }
  | { type: 'sizes'; key: string; override: SizeOverride }
  | { type: 'merges'; canonicalId: string; merge: EntityMerge }
  | { type: 'manual-map-overrides'; nodeId: string; override: ManualMapOverride }
  | { type: 'manual-map-modifications'; modifications: CompanyModifications }
  | { type: 'graduated-map'; map: CompanyData }
  | { type: 'resolutions'; key: string; resolution: Record<string, unknown> };
```

### 3. Refactor `tree-ops.ts` — make pure

`isEntityAbsorbed` and `getDisplaySize` currently import mutable globals. Refactor to accept state as parameters:

```typescript
export function isEntityAbsorbed(
  entityId: string,
  merges: Record<string, EntityMerge>
): string | null { ... }

export function getDisplaySize(
  node: OrgNode,
  company: string,
  overrides: Record<string, SizeOverride>
): string | number | undefined { ... }
```

### 4. `buildWorkingTree` — explicit pure function in `lib/build-working-tree.ts`

```typescript
export function buildWorkingTree(
  root: OrgNode,
  overrides: Record<string, ManualMapOverride>,
  modifications: CompanyModifications | null,
  merges: Record<string, EntityMerge>,
  fieldEdits: Record<string, FieldEdit>
): WorkingTreeNode { ... }
```

---

## Implementation Phases (4 phases, not 9)

### Phase 1: Scaffold + Pipeline + Types + Deploy

**Goal**: Next.js app that builds, deploys to Vercel, and serves placeholder pages. All types ported and expanded. Pipeline outputs JSON.

**Tasks**:
- [x] Initialize Next.js app (`create-next-app` — App Router, TypeScript, Tailwind)
- [x] Add `--json` flag to `integrate_viewer.py` → writes `public/data/{company}/manual.json` and `match-review.json` per company. Keep backward compat with old JS format.
- [x] Port + expand `lib/types.ts` — add `FieldEdit`, `EntityMerge`, `ManualMapOverride`, `CompanyModifications`, `StateType`, `OrgStateRequest` discriminated union, `OrgState` aggregate type
- [x] Refactor `lib/tree-ops.ts` — make `isEntityAbsorbed` and `getDisplaySize` pure (accept state as params), add proper types (no `any`)
- [x] Create `lib/build-working-tree.ts` — pure function, explicit signature
- [x] Port `lib/utils.ts` — keep `formatDateShort`, `isInDateRange`, `normalizeEntityName`, `sanitizeUrl`, `safeJsonParse`. Drop `escapeHtml`, `showToast`, `isModalOpen`. Add `VALID_ACCOUNTS` array.
- [x] Create placeholder pages: `app/page.tsx` (redirect), `app/manual/[company]/page.tsx`, `app/match-review/[company]/page.tsx`, `app/not-found.tsx`
- [x] Create `app/layout.tsx` with Tailwind base styles
- [x] Minimal `vercel.json` (no `functions` block, no `framework` override)
- [x] Install deps: `next`, `react`, `react-dom`, `@vercel/kv`, `tailwindcss`, `typescript`
- [x] Dev deps: `vitest`, `@testing-library/react`
- [x] Port + expand tests for `tree-ops` (test pure refactored functions)
- [x] Test `buildWorkingTree` with fixture data
- [x] Validate pipeline JSON output against TypeScript interfaces
- [x] `npm run build` → zero errors. `vercel` → deploys. Routes return 200.

**Acceptance Criteria**:
- [x] `npm run build` passes
- [ ] `vercel` deploys on first try (the whole point of this rebuild)
- [ ] `/` redirects to `/manual/astrazeneca`
- [ ] `/manual/pfizer` → 404
- [x] `tree-ops` tests pass with refactored pure functions
- [x] `buildWorkingTree` tests pass
- [x] Pipeline produces valid JSON for all 7 companies

---

### Phase 2: API Routes + KV Hook + Layout + Navigation

**Goal**: Working API routes, the `useKVState` hook, header, and company/mode navigation. You can switch companies and see data load.

**Tasks**:
- [ ] Create `app/api/org-state/route.ts` — port from current `api/org-state.ts`, use `NextRequest/NextResponse`, validate with `OrgStateRequest` discriminated union, keep `Cache-Control: no-store`, drop CORS
- [ ] Create `app/api/match-review/route.ts` — port from `api/match-review.ts`. **Bug fix**: `manualMatch()` must store `manualNodeId`
- [ ] Create `app/api/sync-version/route.ts` and `app/api/autosave/route.ts`
- [ ] Create `app/api/_lib/kv.ts` and `app/api/_lib/validation.ts`
- [ ] Create `lib/use-kv-state.ts` — single hook: fetch all KV state on company change, 10-second sync polling (guards: `document.hidden`, `isDraggingRef`), apply-and-save mutations with toast on failure
- [ ] Build `components/Header.tsx` — all header UI inline: company `<select>`, mode `<Link>` tabs, view toggle buttons, stats bar, timeline slider. Props: `company`, `mode`, `dateRange`, `onDateRangeChange`, `view`, `onViewChange`, stats from data.
- [ ] Wire `app/layout.tsx` with `<Header>`
- [ ] Wire `app/manual/[company]/page.tsx` — validate company, call `useKVState(company)`, show loading spinner → content placeholder
- [ ] Wire `app/match-review/[company]/page.tsx` similarly
- [ ] Test: `curl` each API route. Navigate between companies — verify data loads. Navigate between modes — verify URL.

**Acceptance Criteria**:
- [ ] All 4 API routes respond correctly (GET/POST/DELETE)
- [ ] `useKVState` loads data on mount, shows loading → data
- [ ] Company selector changes URL and reloads data
- [ ] Mode tabs switch route
- [ ] Stats update per company
- [ ] Sync polling detects remote changes (test: `curl` a write, observe UI update within 10s)
- [ ] Header styled with Tailwind

---

### Phase 3: Tree + Evidence + Editing + CRUD + Drag-Drop + Match Review

**Goal**: All P0 features working. This is the big phase — all the UI.

**Tasks**:
- [ ] Build `components/TreeView.tsx` — builds working tree via `buildWorkingTree()` in `useMemo`, renders nodes recursively. Each node: name (with field edit value), leader, meta (size, mentions, sites), children. Click → select. Drag-drop with `useRef` for `draggedNodeId`, validation (no self-drop, no descendant-drop), visual feedback. Inline edit form (3 inputs, save/cancel). CSS connector lines.
- [ ] Build `components/EvidencePanel.tsx` — slide-up panel: entity info, team size input + size chips (clickable, shift+click scrolls to snippet), contacts, snippet list (date-filtered), Gong links ("No link" placeholder when missing), "Context" button ("Context unavailable" when no data), add/delete entity buttons, alias display for merged entities
- [ ] Build `components/SnippetContextModal.tsx` — transcript context with speaker resolution, highlighted quote
- [ ] Build `components/ManageEntitiesModal.tsx` — 3 tabs: Create (parent selector + name), Delete (entity selector + child count confirm), Merge (A/B selectors + validation + preview)
- [ ] Build `components/MatchReviewTable.tsx` — table with filters (status, confidence, text search), approve/reject/manual/reset actions, entity picker for manual match, stats, "Data as of" timestamp
- [ ] Build `components/EntityPickerModal.tsx` — searchable list of manual map nodes
- [ ] Wire `app/manual/[company]/page.tsx` — `selectedNode` and `dateRange` as `useState`, passed as props to TreeView + EvidencePanel. View toggle (tree/table) with localStorage persistence.
- [ ] Build table view inline in manual page (or small `SnippetsTable` section in TreeView.tsx) — flat table, sortable columns, date-filtered
- [ ] Test: render tree for all 7 companies, verify node counts. Click → evidence. Edit → save → KV. Add/delete → tree updates. Drag → reparent. Size chip → override. Match review → approve/reject/manual. Merge → absorbed entity hidden.

**Acceptance Criteria**:
- [ ] Tree renders all nodes for all 7 companies (node counts match current production)
- [ ] Click node → evidence panel shows snippets, contacts, size mentions
- [ ] Gong links work (or "No link" placeholder)
- [ ] Snippet context modal works with speaker resolution
- [ ] Inline edit: save → KV persists → tree shows new value
- [ ] Add entity: appears in tree, KV has graduated-map
- [ ] Delete entity: removed (with children), KV updated
- [ ] Drag-drop: reparent works, validation prevents invalid drops
- [ ] Size chip click → override saved. Custom input → override saved. Clear → cleared.
- [ ] Match review: filters work, approve/reject/manual/reset all work
- [ ] Manual match stores `manualNodeId`
- [ ] Merge: absorbed entity hidden, merge record in KV
- [ ] Table view: renders, sorts, filters
- [ ] Sync polling doesn't fire during drag
- [ ] Node selection preserved across re-renders

---

### Phase 4: Polish + Deploy + Validate

**Goal**: Styling pass, error handling, production deployment, regression validation.

**Tasks**:
- [ ] Tailwind styling pass across all components — match functional look of current CSS (tree connectors, node cards, evidence panel, modals, tables)
- [ ] Loading states: spinner while data loads
- [ ] Error states: inline toast (20-line custom `showToast` function) on KV failure
- [ ] Empty states: "No manual map available", "No match review data", "No snippets in date range"
- [ ] `npm run build` → zero errors
- [ ] `vercel` → deploys on first try
- [ ] Verify all 4 API routes with bypass secret
- [ ] Regression validation script: for each of 7 companies, verify node count, evidence panel, KV round-trip, sync polling, match review
- [ ] Compare node counts against current production ±0
- [ ] Full test suite passes
- [ ] Clean up: remove old `api/`, old `src/`, old `public/js/`

**Acceptance Criteria**:
- [ ] Vercel deployment succeeds with zero config workarounds
- [ ] All 7 companies render correctly
- [ ] All KV operations work
- [ ] No console errors
- [ ] Node counts match production
- [ ] UI is visually complete (no unstyled elements)

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State management | Custom `useKVState` hook (no React Query) | 1-3 users, 4 endpoints. `useEffect` + `fetch` + `useState` in 80 lines. |
| Toast | Custom 20-line function (no sonner) | Fires rarely on KV failure. `window.alert` would also work. |
| Mutation pattern | Apply-and-save (no rollback) | Rollback causes UI flicker. Show toast on failure instead. |
| Data loading | Bundled 3MB (all companies in one JSON) for V1 | 1-3 users on corporate network. Split per-company later if needed. |
| File structure | ~18 files, flat components/ | Every file is substantial. No 15-line wrapper files. |
| Routing | `/manual/[company]`, `/match-review/[company]` | Deep-linkable, Next.js-native. |
| CSS | Tailwind | Vercel's preferred. Replaces 1,866-line CSS. |
| `selectedNode` | `useState` in page, prop-drilled to TreeView + EvidencePanel | Kieran's fix: siblings need it, can't live in TreeView alone. |
| `dateRange` | `useState` in page, prop-drilled | No Context needed — used in one component tree. |
| Drag-and-drop | Custom event handlers (no library) | Trees are ~35 nodes. Simple interaction. |
| Autosave | Deferred (P1) | Every mutation already writes to KV immediately. |
| ConflictResolutionModal | Deferred (P2) | Not needed for V1. |
| `tree-ops.ts` | Refactored to pure (no global reads) | Kieran's critical fix. Enables testability. |
| API request types | Discriminated union `OrgStateRequest` | Kieran's fix. Type-safe validation at handler boundary. |

---

## Bug Fixes Included

| Bug | Fix |
|-----|-----|
| `manualMatch()` missing `manualNodeId` | Store `manualNodeId` in match-review route + hook |
| Sync fires during drag | `isDraggingRef` guard in polling interval |
| Node selection lost on sync | React state preserves selection (no DOM rebuild) |
| Snippet context button hidden silently | Show "Context unavailable" instead |
| Approved match `gongUrl` null | Show "No link" placeholder |
| Circular dependency injection (6 `register*()` fns) | Eliminated by React component tree |
| localStorage key collisions | Removed — no localStorage for data |
| Company-scoped state leakage | KV fetch is per-company; state resets on switch |

---

## Dependencies (Minimal)

**Runtime**: `next`, `react`, `react-dom`, `@vercel/kv` (4 deps)

**Dev**: `typescript`, `tailwindcss`, `vitest`, `@testing-library/react`

No React Query. No sonner. No MSW.

---

## Phase Execution

```
Phase 1 (Scaffold + Types + Pipeline JSON) ──→ Phase 2 (API + Hook + Layout)
                                                          ↓
                                              Phase 3 (All P0 UI Features)
                                                          ↓
                                              Phase 4 (Polish + Deploy)
```

Each phase ends with a deployable preview. Phase 3 is the bulk of the work.
