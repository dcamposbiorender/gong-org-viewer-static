# Brainstorm: GongOrgViewerStatic → Next.js/React Rebuild

**Date:** 2026-02-15
**Status:** Complete
**Participants:** David, Claude
**Prerequisite:** [Feature Audit Brainstorm](2026-02-15-rebuild-feature-audit-brainstorm.md) — defines WHAT to build. This doc defines the tech stack.

---

## Why Rebuild

The current Vite + vanilla TypeScript + `api/*.ts` serverless setup fights Vercel at every turn:
- Framework auto-detection issues (needed `framework: null` hack)
- `type:module` breaks serverless functions
- `@vercel/node` runtime version conflicts
- API routes return 401 despite bypass secret being configured
- Multiple failed deploys trying to get TS serverless to work

Next.js is Vercel's first-class framework. Zero deployment friction.

---

## Key Decisions

### 1. Routing: URL-based with company in path
- `/manual/[company]` and `/match-review/[company]` routes
- Deep-linkable, browser back button works, most Next.js-native
- Company selector changes the URL, which drives data loading

### 2. Styling: Tailwind CSS
- Vercel's preferred approach
- Replaces 1,866-line `styles.css`
- No separate CSS files to maintain

### 3. Data Loading: JSON per company, loaded on demand
- Pipeline outputs JSON files per company (not `const MANUAL_DATA = {...}` JS)
- Client fetches only the selected company (~400KB vs 3MB upfront)
- Files served from `public/data/[company]/manual.json`, `match-review.json`
- Pipeline change: `integrate_viewer.py` outputs JSON instead of JS assignments

### 4. State Management: React Query + Context
- **React Query**: KV-synced data (corrections, sizes, merges, field-edits, match decisions). Handles fetching, caching, revalidation, optimistic updates.
- **React Context**: UI state (selected company from URL, current mode from URL, selected node, date range, evidence panel expanded)
- **Local useState**: Transient state (drag state, editing node, table sort, modal open/close)

### 5. Strategy: Clean Rewrite
- Fresh Next.js app in the same repo (new branch or subfolder)
- Port features following P0 → P1 → P2 priority from feature audit
- Ship when P0 (15 features) is complete
- Old Vite code stays on `feat/rebuild-v2` as reference

---

## Migration Map

### What Stays the Same
- Python pipeline (extract → consolidate → build → integrate) — just change output format
- Vercel KV as persistence layer
- `@vercel/kv` client library
- All pure utility functions (`tree-ops.ts`, date utils, sanitization)
- All type definitions (`types.ts`)

### What Changes

| Current | Next.js |
|---------|---------|
| `index.html` (393 lines) | `app/layout.tsx` + `app/[mode]/[company]/page.tsx` |
| `src/state.ts` (19 mutable `let` vars) | React Context + URL params + local state |
| `src/kv.ts` (535 lines) | React Query hooks (`useOrgState`, `useMatchReview`) |
| `src/tree-view.ts` (DOM createElement) | `<TreeView>` + `<TreeNode>` components |
| `src/evidence-panel.ts` (innerHTML) | `<EvidencePanel>` component |
| `src/match-table.ts` (innerHTML) | `<MatchReviewTable>` component |
| `src/entity-crud.ts` (DOM manipulation) | `<ManageEntitiesModal>` component |
| `src/entity-merge.ts` | `<MergeEntitiesTab>` component |
| `src/snippet-context.ts` | `<SnippetContextModal>` component |
| `src/sync.ts` (setInterval) | `useSyncPolling` hook with useEffect |
| `src/init.ts` (IIFE + lazy deps) | Removed — React render handles initialization |
| `src/utils.ts` (`escapeHtml`) | Removed — React handles XSS by default |
| 12 `api/*.ts` serverless files | 4 Next.js Route Handlers (drop 8 legacy endpoints) |
| `public/js/data.js` (3MB globals) | `public/data/[company]/manual.json` (per-company JSON) |
| `public/css/styles.css` (1,866 lines) | Tailwind utility classes |
| Circular dep registration pattern | Gone — React props/context |
| `localStorage` caching layer | React Query cache |

### API Routes (Simplified)

| Next.js Route | Purpose |
|---------------|---------|
| `app/api/org-state/route.ts` | All org edits (corrections, sizes, merges, etc.) |
| `app/api/match-review/route.ts` | Match decisions |
| `app/api/sync-version/route.ts` | Polling endpoint |
| `app/api/autosave/route.ts` | Session snapshots |

8 legacy endpoints dropped (already consolidated into `org-state`).

### Component Tree (Approximate)

```
app/layout.tsx
├── Header (company select, mode tabs, view toggle, stats)
├── app/manual/[company]/page.tsx
│   ├── TreeView / TableView (toggled)
│   │   └── TreeNode (recursive)
│   └── EvidencePanel
├── app/match-review/[company]/page.tsx
│   └── MatchReviewTable
├── Modals (portals)
│   ├── ManageEntitiesModal (Create / Delete / Merge tabs)
│   ├── SnippetContextModal
│   ├── EntityPickerModal
│   └── ConflictResolutionModal
└── Providers (QueryClient, AppContext)
```

---

## Pipeline Change

`integrate_viewer.py --update` currently writes:
```javascript
const MANUAL_DATA = { abbvie: {...}, ... };
```

New output:
```
public/data/abbvie/manual.json
public/data/abbvie/match-review.json
public/data/astrazeneca/manual.json
...
```

Each file is pure JSON, ~400KB per company. Fetched on demand when company is selected.

---

## Open Questions

1. **Do we need SSR for any page?** Probably not — this is a behind-auth internal tool. Client-side rendering is fine.
2. **Toast library?** Current code uses a custom `showToast()`. Use `sonner` (Vercel's preferred) or keep simple.
3. **Drag-and-drop library?** Current code is custom. `@dnd-kit` is the React standard, or keep custom with React event handlers.

---

## Next Steps

Run `/workflows:plan` to create the implementation plan with phases, file list, and test strategy.
