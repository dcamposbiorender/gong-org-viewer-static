---
title: "Rebuild GongOrgViewerStatic"
type: refactor
date: 2026-02-15
brainstorm: docs/brainstorms/2026-02-15-rebuild-feature-audit-brainstorm.md
reviewed-by: DHH, Kieran (TypeScript), Simplicity Reviewer (2026-02-15)
---

# Rebuild GongOrgViewerStatic

## Overview

Rebuild the org intelligence viewer from vanilla JS globals into typed ES modules — while preserving every working feature and fixing the silent failures discovered in the audit.

**What stays:** Vercel KV persistence, Python extraction pipeline, static deployment model, the UX.
**What changes:** ES modules via Vite, TypeScript, API consolidation, KV as sole data source.

## Problem Statement

13 vanilla JS files (4,500 lines) with global functions, script-tag load ordering, 11 near-identical API routes (800 lines of boilerplate), ~500 lines of dead auto-map code, dual localStorage/KV state causing sync bugs, zero JS unit tests. The audit found 22 gaps including evidence panel wiped on sync re-render, match approvals that break on rename, and a fragile snippet context pipeline.

## Proposed Solution

Two-phase rebuild plus independent pipeline cleanup. Each phase is deployable. We migrate file-by-file, keeping the app functional throughout.

---

## Technical Approach

### Architecture

```
GongOrgViewerStatic/
├── api/                          # Vercel serverless functions (TypeScript)
│   ├── _lib/
│   │   ├── kv.ts                 # KV client + bumpSyncVersion (KEEP)
│   │   ├── validation.ts         # Account whitelist (KEEP, fix to discriminated union)
│   │   └── cors.ts               # CORS headers (KEEP)
│   ├── org-state.ts              # NEW: Consolidated endpoint (replaces 7 routes)
│   ├── match-review.ts           # KEEP (fix ID-based matching)
│   ├── sync-version.ts           # KEEP
│   └── autosave.ts               # KEEP
├── src/                          # NEW: TypeScript frontend source (FLAT — no subdirectories)
│   ├── types.ts                  # Interfaces: raw data types, working tree types, KV state types
│   ├── state.ts                  # Global state with company-scoped accessors
│   ├── kv.ts                     # KV load/save functions (plain functions, no class)
│   ├── sync.ts                   # Polling functions (plain functions, no class)
│   ├── modal.ts                  # openModal/closeModal/isAnyModalOpen (plain functions)
│   ├── utils.ts                  # escapeHtml, sanitizeUrl, showToast, formatDate
│   ├── tree-ops.ts               # buildWorkingTree, findNode, countNodes
│   ├── tree-view.ts              # renderManualMapTree, renderManualMapView
│   ├── table-view.ts             # renderTable with search, sort, filter
│   ├── evidence-panel.ts         # showManualNodeEvidence
│   ├── snippet-context.ts        # Expanded snippet context modal + speaker resolution
│   ├── match-table.ts            # renderMatchReview with filters
│   ├── match-actions.ts          # approve/reject/manual/reset (ID-based)
│   ├── entity-crud.ts            # Create/delete entities
│   ├── entity-merge.ts           # Merge + alias
│   ├── entity-edit.ts            # Inline field editing
│   └── init.ts                   # App entry point
├── public/
│   ├── index.html                # Simplified HTML shell (no inline styles/onclick)
│   ├── css/styles.css            # KEEP
│   └── js/                       # Pipeline-generated data (gitignored)
│       ├── manual-data.json      # Changed from .js to .json
│       └── match-review-data.json
├── scripts/                      # Python pipeline (KEEP, cleanup later)
├── tests/
│   ├── unit/                     # Vitest: tree-ops, snippet-context, match-actions, entity-merge
│   ├── api/                      # KV API contract tests (pytest)
│   └── pipeline/                 # Pipeline data shape tests (pytest)
├── vite.config.ts
├── tsconfig.json
└── vercel.json                   # Updated with build step
```

### Key Design Decisions

**1. Vite as bundler (not Next.js, not Webpack)**
- ES modules solve the root cause of fragility (implicit load-order dependencies)
- Output is still static `index.html` + bundled JS — same deployment model
- `vercel.json`: `"buildCommand": "npx vite build"`, `"outputDirectory": "dist"`

**2. Plain functions, not classes**

All three reviewers agreed: classes with one method are functions in a trench coat.

```typescript
// src/modal.ts — plain functions, not a Modal class
const openModals = new Set<string>();

export function openModal(id: string) {
  document.getElementById(id)?.classList.add('active');
  openModals.add(id);
}

export function closeModal(id: string) {
  document.getElementById(id)?.classList.remove('active');
  openModals.delete(id);
}

export function isAnyModalOpen(): boolean {
  return openModals.size > 0;
}
```

```typescript
// src/kv.ts — plain function with toast on failure, no retry queue
export async function kvSave(endpoint: string, data: unknown): Promise<boolean> {
  try {
    const res = await fetch(kvApiUrl(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return true;
  } catch {
    showToast('Save failed. Please try again.', 'error');
    return false;
  }
}
```

```typescript
// src/sync.ts — plain functions, not a SyncProvider class
let lastKnownVersion: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startPolling(intervalMs = 10_000): void { /* setInterval */ }
export function stopPolling(): void { /* clearInterval */ }

export async function onRemoteChange(): Promise<void> {
  const selectedId = state.selectedNode?.id ?? null;
  await loadAllKvState();
  renderCurrentView();
  if (selectedId) {
    const node = findNodeById(state.currentTree, selectedId);
    if (node) selectNode(node); // Re-select and show evidence
  }
}
```

**3. TypeScript with union types (but pragmatic about `any`)**

Use TypeScript strict mode for real bug prevention, but allow `any` where typing cost exceeds safety value. Separate raw pipeline types from working-tree types.

```typescript
// src/types.ts

// --- Raw pipeline data (what comes from JSON files) ---

type OrgNodeType = 'group' | 'department' | 'team' | 'division'
  | 'function' | 'therapeutic_area' | 'sub_team' | 'unknown';
type EvidenceStatus = 'supported' | 'conflicting' | 'unverified';
type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface OrgNode {
  id: string;
  name: string;
  type: OrgNodeType;
  leader?: { name: string; title: string };
  size?: number;
  level?: number;
  sites?: string[];
  gongEvidence?: GongEvidence;
  children: OrgNode[];
}

export interface Snippet {
  quote: string;
  date: string;
  gongUrl?: string;
  callId?: string;
  callTitle?: string;
  contextBefore?: string;
  contextAfter?: string;
  speakerId?: string;
  customerName?: string;
  internalName?: string;
  entityName?: string;
}

export interface SizeMention {
  value: string;
  source?: { callDate?: string; customerName?: string };
  snippetIndex?: number;
}

export interface Contact {
  name: string;
  title?: string;
  isDecisionMaker?: boolean;
}

export interface GongEvidence {
  snippets: Snippet[];
  sizeMentions: SizeMention[];
  matchedContacts: Contact[];
  matchedEntities?: MatchedEntity[];
  teamSizes?: string[];  // Legacy fallback
  totalMentions: number;
  confidence: ConfidenceLevel;
  status: EvidenceStatus;
}

// --- Working tree types (enriched at runtime) ---

export interface WorkingTreeNode extends OrgNode {
  originalParent?: string | null;
  override?: Override;
  notes?: string;
}

// --- KV state types ---

export interface Override {
  newParent: string;
  originalParent: string;
  movedAt: string;
}

export interface SizeOverride {
  selectedSizeIndex?: number | null;
  customValue?: string;
}

export interface MatchDecision {
  manualNodeId: string;    // ID-based (not name!)
  manualNode: string;      // Display name (for UI only)
  manualPath?: string;
  approvedAt?: string;
  rejectedAt?: string;
}
```

**4. Match approval by ID, not name**

```typescript
// Current (broken on rename):
if (approval.manualNode === nodeName) { ... }

// Fixed:
if (approval.manualNodeId === node.id) { ... }
```

Requires a one-time migration of existing match-review KV data to add `manualNodeId` fields.

**5. API consolidation — straight code, no factory**

Consolidate 7 routes into `org-state.ts` with a `type` query parameter. No handler factory — just write the endpoint as a straightforward switch on `type`. The CORS/validation boilerplate is 15 lines per file; for 4 endpoints, copy-paste is more readable than abstraction.

```typescript
// api/org-state.ts (sketch)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const validation = validateAccount(req.query.account);
  if (!validation.isValid) return res.status(400).json({ error: validation.error });

  const type = req.query.type as string; // corrections, field-edits, sizes, merges, etc.
  const kvKey = `org-state:${validation.account}:${type}`;

  try {
    if (req.method === 'GET') {
      const data = await kv.get(kvKey) || {};
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const existing = await kv.get(kvKey) || {};
      const merged = { ...existing, ...req.body };
      await kv.set(kvKey, merged);
      await bumpSyncVersion(validation.account);
      return res.status(200).json({ ok: true });
    }
    // DELETE...
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'Internal error' });
  }
}
```

**6. validateAccount returns discriminated union** (from Kieran's review)

```typescript
// api/_lib/validation.ts
type ValidAccount = 'abbvie' | 'astrazeneca' | 'gsk' | 'lilly' | 'novartis' | 'regeneron' | 'roche';

type ValidationResult =
  | { isValid: true; account: ValidAccount }
  | { isValid: false; error: string };

export function validateAccount(raw: unknown): ValidationResult { ... }
```

No more `validation.account!` non-null assertions.

---

## Implementation Phases

### Phase 1: Modernize + Migrate

**Goal:** Vite + TypeScript + ES modules + API consolidation + kill dead code. One phase, not two — they are inseparable.

#### Sub-phase 1a: Vite Setup (zero behavior change)

- [x] Add `vite.config.ts`, `tsconfig.json`, update `package.json` with `vite`, `typescript`, `vitest`
- [x] Update `vercel.json`: `"buildCommand": "npx vite build"`, `"outputDirectory": "dist"`
- [x] Create `src/types.ts` — complete interfaces (raw types, working tree types, KV state types) with union types
- [x] Create `src/init.ts` as entry point that imports existing JS files (shim layer)
- [x] Verify: `npm run dev` starts Vite, `npm run build` produces `dist/`, deploy to preview works

#### Sub-phase 1b: Migrate + Consolidate

- [ ] Pipeline change: `integrate_viewer.py` outputs `.json`. App loads via `fetch()` on init *(deferred — data files still .js for now)*
- [x] Create flat `src/` modules (17 files) migrating from the 13 vanilla JS files:
  - `state.ts` — typed state, company-scoped accessors, KV-only (no localStorage for data)
  - `utils.ts` — escapeHtml, sanitizeUrl, showToast, formatDate, boldSizeMentions
  - `tree-ops.ts` — findNodeById, countNodes, getDisplaySize. **Removed all `DATA[currentCompany]` dead code.**
  - `kv.ts` — all KV load/save as plain functions. Toast on failure.
  - `sync.ts` — polling as plain functions. Preserves selected node on re-render. Checks `isModalOpen()`.
  - `modal.ts` — openModal/closeModal/isAnyModalOpen as plain functions with Set tracking
  - `tree-view.ts` — renderManualMapTree, renderManualMapView (manual map only, no auto map)
  - `table-view.ts` — renderTable with search, sort, filter
  - `evidence-panel.ts` — showManualNodeEvidence with addEventListener (no inline onclick)
  - `snippet-context.ts` — snippet context modal + speaker resolution
  - `match-table.ts` — renderMatchReview with filters, addEventListener throughout
  - `match-actions.ts` — approve/reject/manual/reset with lazy renderer registration
  - `entity-crud.ts` — create/delete with window.confirm() for deletion
  - `entity-merge.ts` — merge + alias. **Fixed: calls renderManualMapView() after merge.**
  - `entity-edit.ts` — inline field editing. **Removed dead `startEdit()`/`saveEdit()` for auto mode.**
  - `init.ts` — entry point wiring all dependencies
- [x] Create `api/org-state.ts` — straight code, no factory. Switch on `type` param.
- [x] Update `api/_lib/validation.ts` — discriminated union return type.
- [x] Delete 13 old JS files *(7 old API files kept for backward compat during client migration)*
- [x] Update `index.html` — single `<script type="module">`, no inline onclick/style
- [ ] Update `conftest.py` to read `.json` instead of `.js` *(deferred — data files still .js)*
- [x] Write `tree-ops.test.ts` alongside the migration (25 tests, all passing)

**Acceptance Criteria:**
- [x] `npm run dev` and `npm run build` work
- [ ] All 22 E2E features work identically *(browser testing in progress)*
- [x] All 4 API endpoints respond correctly *(org-state created, old endpoints still functional)*
- [x] Zero global functions, zero `onclick=""` in HTML
- [x] `npx tsc --noEmit` passes
- [x] `tree-ops.test.ts` passes (25/25)
- [x] Existing Python tests pass (84 pass, 1 pre-existing fail)
- [ ] Deploy to preview, smoke test

---

### Phase 2: Fix Silent Failures + Tests

**Goal:** Fix the known bugs the audit found. Add the remaining 3 high-value Vitest test files.

#### Fixes

- [ ] **Match approval migration:** One-time script to add `manualNodeId` to existing KV match-review data
- [ ] **Deterministic entity IDs:** Make IDs in `integrate_viewer.py` a hash of `company + entity_path`. KV state survives pipeline re-runs.
- [ ] **Resolutions per-company:** Change key from `resolutions:global` to `resolutions:{account}:{company}`
- [ ] **Company dropdown disabled while modal open**
- [ ] **Loading spinner** during initial KV load
- [ ] **Toast on KV failure** (already in Phase 1 kv.ts, verify it works)
- [ ] **`window.confirm()` before entity deletion** with children count warning

#### Tests (4 files — the high-value ones)

- [ ] `tree-ops.test.ts` — (already written in Phase 1)
- [ ] `snippet-context.test.ts` — speaker resolution for 2-speaker and 3+ speaker calls, context available vs unavailable rendering
- [ ] `match-actions.test.ts` — approve/reject/reset state transitions, ID-based matching
- [ ] `entity-merge.test.ts` — merge validation (self, transitive, already absorbed), alias management, cross-company isolation

#### Python Tests (upgrade)

- [ ] Fix `test_bug_08_extraction_completeness.py` to match actual schema
- [ ] Add pipeline ID determinism test
- [ ] Add snippet context match rate test
- [ ] Remove regex-based JS tests from `test_entity_merge.py` (replaced by Vitest)

**Acceptance Criteria:**
- [ ] `npm test` runs Vitest, all pass
- [ ] `python3 -m pytest tests/ -v` passes
- [ ] Match approval survives entity rename (tested)
- [ ] Pipeline re-run does not orphan KV state (tested)
- [ ] Entity deletion has confirmation dialog

---

### Independent: Pipeline Cleanup (whenever)

**Not a phase of this rebuild.** Separate effort, separate risk profile.

- Unify extraction scripts into single `extract_entities.py` with company-specific prompt templates
- Fuzzy matching fallback for snippet context (`difflib.SequenceMatcher`, 0.8 threshold)
- Archive legacy extraction scripts to `archive/legacy_scripts/`

---

## What Was Cut (and Why)

Per unanimous review feedback from DHH, Kieran, and Simplicity reviewers:

| Cut | Reason |
|-----|--------|
| Phase 5: History/Undo | YAGNI. `window.confirm()` for deletes is sufficient for 1-3 users. Add later if requested. |
| KvClient class + retry queue + backoff | Over-engineered. Toast on failure is the right UX at this scale. |
| Per-item KV keys for concurrency | 1-3 users will never trigger read-modify-write races. |
| Handler factory (`api/_lib/handler.ts`) | Abstraction tax exceeds copy-paste tax for 4 endpoints. |
| Alias-on-rename machinery | Redundant — ID-based match fix already solves the problem. |
| Modal class | Plain functions do the same job in fewer lines. |
| SyncProvider class | One function with a closure variable. |
| `src/` subdirectories | Flat is better at 17 files. Subdirs add import noise. |
| JSON Schema validation in pipeline | Existing pytest assertions already validate shape. |
| Company list build-time generation | 7-item hardcoded list doesn't need code generation. |
| Soft-delete | `window.confirm()` prevents accidents. Full soft-delete is Phase 5 territory (cut). |
| 4 of 8 test files | kv-client, sync, entity-crud, modal tests cut. Test the complex logic, not the glue. |

---

## Alternative Approaches Considered

| Approach | Why Rejected |
|----------|-------------|
| **Full Next.js rewrite** | Overkill. Adds SSR, larger bundle, framework lock-in for 1-3 users. |
| **React components** | One page with modals. Vanilla TS with ES modules is sufficient. |
| **Supabase instead of KV** | KV is simpler and works. Supabase adds complexity for no gain at this scale. |
| **Big-bang rewrite** | High risk. Incremental keeps the app deployable throughout. |
| **5-phase plan** | Over-cautious. Phases 1+2 are inseparable (Vite + TS migration). Phase 5 is YAGNI. |

---

## Acceptance Criteria

### Functional

- [ ] All 22 features from E2E spec pass
- [ ] Snippet context shown for existing enriched snippets; "Context unavailable" for unenriched
- [ ] Entity deletion has `window.confirm()` with children count
- [ ] KV is the sole data source for all user edits
- [ ] Match approval survives entity rename (ID-based)
- [ ] Evidence panel preserves selection across sync re-renders
- [ ] All modals and drag-in-progress block sync polling

### Non-Functional

- [ ] TypeScript strict mode (allow `any` where typing cost exceeds safety)
- [ ] All modules are ES modules (no globals)
- [ ] 4 Vitest test files covering tree-ops, snippet-context, match-actions, entity-merge
- [ ] Build time < 5 seconds (Vite)
- [ ] Bundle size < 50 KB (app code, excluding data JSON)
- [ ] No inline `onclick`, no inline `style` attributes in HTML

### Quality Gates

- [ ] `npm test` passes (Vitest)
- [ ] `python3 -m pytest tests/ -v` passes
- [ ] `npx tsc --noEmit` passes
- [ ] Manual smoke test of all 22 E2E features
- [ ] Deploy to preview before merging each phase

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Vite 6.x | Available | Zero-config for vanilla TS |
| TypeScript 5.x | Already in devDeps | Enable strict mode |
| Vitest | Available | Vite-native test runner |
| `@vercel/kv` | Already in deps | No change |
| Python 3 + pytest | Already available | No change |

No new infrastructure. No new services. No new API keys.

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Regression during migration | Medium | High | Deploy to preview before merging. tree-ops tests written alongside migration. |
| Vite build breaks Vercel deployment | Low | High | Sub-phase 1a verifies build works before any code migration. |
| KV data format change (match-review migration) | Medium | Medium | Run migration script against production KV before deploying. |
| Pipeline ID change orphans KV state | Medium | High | Deterministic IDs + reconciliation script in Phase 2. |

---

## References

### Internal

- Brainstorm: `docs/brainstorms/2026-02-15-rebuild-feature-audit-brainstorm.md`
- Architecture: `docs/architecture.md`
- E2E Feature Spec: `tests/e2e-feature-spec.md`
- XSS learnings: `docs/solutions/ui-bugs/xss-via-inline-onclick-with-quotes.md`
- Immutable source pattern: `docs/solutions/architecture-patterns/immutable-source-data-free-undo.md`
- Cross-company contamination: `docs/solutions/ui-bugs/cross-company-localstorage-contamination.md`

### Key File Paths (bugs to fix)

- Dead auto-map code: `public/js/rendering.js:1265-1290`, `public/js/tree-ops.js:115-230`
- Broken merge render: `public/js/entity-merge.js:308` (calls `renderCompany` not `renderManualMapView`)
- Name-based match lookup: `public/js/evidence.js:131` (`approval.manualNode === nodeName`)
- Modal detection bug: `public/js/utils.js:113-119` (`isModalOpen()`)
- Fragile snippet context: `scripts/integrate_viewer.py:70-120` (`find_context`)
