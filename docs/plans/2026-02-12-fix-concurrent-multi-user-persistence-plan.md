---
title: "fix: Concurrent multi-user match review persistence"
type: fix
date: 2026-02-12
revised: 2026-02-12
revision_note: "Simplified after plan review. Cut HSET migration, polling, and migration script. Read-merge-write + company key fix is sufficient for 2-5 users."
---

# fix: Concurrent Multi-User Match Review Persistence

## Overview

Two users editing GongOrgViewerStatic simultaneously lose each other's changes. The proven root cause is `saveMatchReviewStateToKV()` using the global `currentCompany` instead of the explicit company parameter — data goes to the wrong KV key when users switch the dropdown. Secondary: `match-review.ts` does a full blob overwrite instead of per-entity read-merge-write like the other 5 routes.

## Problem Statement

**Evidence from KV forensics (2026-02-11):**

- `autosave:astrazeneca.matchReviewState["abbvie"]` = 3 AstraZeneca items (cross-contaminated under wrong key)
- `match-review:abbvie` = EMPTY (data never reached correct key)
- Two users active 2:33-3:50 PM ET

**Two proven root causes:**

1. **Wrong company key on save** — All 11 `save*ToKV`/`delete*FromKV` functions use the global `currentCompany` for the API URL instead of the explicit `company` parameter passed from the caller. If the user switches the dropdown between clicking "Approve" and the async save completing, data goes to wrong KV key.

   | Function | Line | Uses `currentCompany`? |
   |---|---|---|
   | `saveMatchReviewStateToKV` | 99232 | Yes |
   | `saveOverrideToKV` | 98205 | Yes |
   | `deleteOverrideFromKV` | 98225 | Yes |
   | `saveSizeOverrideToKV` | 97029 | Yes |
   | `deleteSizeOverrideFromKV` | 97086 | Yes |
   | `saveFieldEditToKV` | 97127 | Yes |
   | `deleteFieldEditFromKV` | 97147 | Yes |
   | `saveEntityMergeToKV` | 97669 | Yes |
   | `deleteEntityMergeFromKV` | 97689 | Yes |
   | `performAutosave` | 100921 | Yes |
   | `beforeunload` sendBeacon | 100973 | Yes |

2. **match-review.ts full overwrite** — `api/match-review.ts:61` does `kv.set(kvKey, state)` replacing the entire blob. The other 5 entity-map routes (corrections, sizes, field-edits, merges, resolutions) already do read-merge-write correctly. match-review is the outlier.

**One secondary issue:**

3. **No KV reload on company switch** — `loadMatchReviewState()` runs once on page load. Switching companies in the dropdown re-renders from stale local state without fetching fresh data from KV.

## Proposed Solution

### Strategy: Fix company key bug + read-merge-write + reload on switch

No new Redis data model. No migration script. No polling. Use the same read-merge-write pattern already proven in 5 of 8 routes.

**Why not HSET?** (decided during plan review)
- HSET requires data migration (Redis key type change is destructive — can't be both STRING and HASH)
- Deploy ordering problem: old code + migrated data = all data appears empty
- The race window in read-merge-write is ~50ms; at 2-5 users editing different entities, probability of collision is effectively zero
- Read-merge-write is already battle-tested in corrections.ts, sizes.ts, field-edits.ts, merges.ts, resolutions.ts

## Technical Approach

### Phase 1: Fix all 11 save functions to use explicit company (client-side)

**File:** `public/index.html`

**Structural fix — create a helper that enforces explicit account:**

```javascript
// Helper: builds API URL with required account parameter
function kvApiUrl(endpoint, account) {
  if (!account) throw new Error('[KV] account parameter required for ' + endpoint);
  return '/api/' + endpoint + '?account=' + account.toLowerCase();
}
```

**Then rewrite each save/delete function to accept and use explicit `account`:**

```javascript
// BEFORE (uses global currentCompany):
async function saveMatchReviewStateToKV(isRetry = false) {
  const companyState = matchReviewState[currentCompany];
  // ...
  await fetch(`/api/match-review?account=${currentCompany.toLowerCase()}`, ...);
}

// AFTER (requires explicit account):
async function saveMatchReviewStateToKV(account, isRetry = false) {
  const companyState = matchReviewState[account];
  if (!companyState) return;
  // ...
  await fetch(kvApiUrl('match-review', account), ...);
}
```

**Thread `company` through all callers:**

```javascript
// saveMatchReviewState currently ignores company:
function saveMatchReviewState() {           // no param
  localStorage.setItem(...);
  saveMatchReviewStateToKV();               // uses currentCompany
}

// Fixed:
function saveMatchReviewState(company) {    // explicit
  localStorage.setItem(...);
  saveMatchReviewStateToKV(company);        // passed through
}

// approveMatch already has company — just thread it:
function approveMatch(company, itemId, manualNode, manualPath) {
  // ... existing logic ...
  saveMatchReviewState(company);            // was: saveMatchReviewState()
}
```

**Same pattern for all 11 functions.** Each `save*ToKV()`/`delete*FromKV()` gets an `account` first parameter. Each caller passes the explicit company from its own parameter.

**For `performAutosave` and `beforeunload`:** These legitimately use `currentCompany` since they're saving the current session. But strip cross-company `matchReviewState` from the autosave blob — only save `matchReviewState[currentCompany]`, not all companies.

**Test:**
```
1. Open browser DevTools Network tab
2. Select "novartis" in dropdown
3. Switch to "astrazeneca"
4. Approve an AZ match review item
5. Verify: POST goes to ?account=astrazeneca (NOT novartis)
6. Verify: No save function references currentCompany (grep check)
```

**Grep guard (add as comment in code):**
```bash
# No save/load function should reference currentCompany for API URLs.
# This grep should return 0 results:
# grep -n "currentCompany" public/index.html | grep -E "save.*ToKV|delete.*FromKV|kvApiUrl"
```

### Phase 2: Make match-review.ts do per-entity read-merge-write (server-side)

**File:** `api/match-review.ts`

Change the POST handler from full-blob-overwrite to per-entity-merge, matching the pattern in corrections.ts.

**Client change:** Instead of sending the entire `{ state: companyState }`, send individual item changes: `{ itemId, decision, category }`.

```typescript
// BEFORE (match-review.ts:51-69):
if (req.method === 'POST') {
  const { state } = req.body;
  await kv.set(kvKey, state);              // Full overwrite!
}

// AFTER:
if (req.method === 'POST') {
  const { itemId, decision, category } = req.body;
  // category = 'approved' | 'rejected' | 'manual'

  if (!itemId || !decision || !category) {
    return res.status(400).json({ error: 'itemId, decision, and category required' });
  }

  // Read-merge-write (same pattern as corrections.ts)
  const data = await kv.get<CompanyMatchState>(kvKey) || {
    approved: {}, rejected: {}, manual: {}
  };

  // Remove from other categories (approve removes from rejected/manual, etc.)
  delete data.approved[itemId];
  delete data.rejected[itemId];
  delete data.manual[itemId];

  // Add to target category
  data[category][itemId] = decision;

  await kv.set(kvKey, data);
  return res.json({ success: true });
}
```

**Add DELETE handler for resetting items:**
```typescript
if (req.method === 'DELETE') {
  const { itemId } = req.body;
  const data = await kv.get<CompanyMatchState>(kvKey) || {
    approved: {}, rejected: {}, manual: {}
  };
  delete data.approved[itemId];
  delete data.rejected[itemId];
  delete data.manual[itemId];
  await kv.set(kvKey, data);
  return res.json({ success: true });
}
```

**Client-side change** — update `saveMatchReviewStateToKV` to send individual items instead of full state:

```javascript
// New: save a single match review decision
async function saveMatchReviewItemToKV(account, itemId, decision, category, isRetry = false) {
  try {
    const response = await fetch(kvApiUrl('match-review', account), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, decision, category })
    });
    if (!response.ok) {
      console.error('[Match Review] KV save failed:', response.status);
      if (!isRetry) setTimeout(() => saveMatchReviewItemToKV(account, itemId, decision, category, true), 2000);
      else showToast('Match review save failed - data saved locally only', 'error');
    }
  } catch (e) {
    console.error('[Match Review] KV save network error:', e.message);
    if (!isRetry) setTimeout(() => saveMatchReviewItemToKV(account, itemId, decision, category, true), 2000);
    else showToast('Match review save failed - data saved locally only', 'error');
  }
}
```

**Update callers** (approveMatch, rejectMatch, manualMatch, resetMatchItem) to call `saveMatchReviewItemToKV` with the specific item instead of dumping full state.

**Test:**
```
1. User A approves item X → POST { itemId: X, category: 'approved', decision: {...} }
2. User B approves item Y → POST { itemId: Y, category: 'approved', decision: {...} }
3. Verify: KV contains both X and Y in approved
4. User A reloads → sees both X and Y
```

### Phase 3: Add KV reload on company switch (client-side)

**File:** `public/index.html`

**Change the company switch handler** (~line 100567):

```javascript
// BEFORE:
document.getElementById('companySelect').addEventListener('change', e => {
  currentCompany = e.target.value;
  if (currentMode === 'manual') {
    renderManualMapView();
  } else if (currentMode === 'matchReview') {
    renderMatchReview(currentCompany);
  } else {
    renderCompany(currentCompany);
  }
});

// AFTER:
document.getElementById('companySelect').addEventListener('change', async e => {
  currentCompany = e.target.value;
  // Reload fresh data from KV for the new company
  await Promise.all([
    loadMatchReviewState(),
    loadOverrides(),
    loadSizeOverrides(),
    loadFieldEdits(),
    loadEntityMerges()
  ]);
  if (currentMode === 'manual') {
    renderManualMapView();
  } else if (currentMode === 'matchReview') {
    renderMatchReview(currentCompany);
  } else {
    renderCompany(currentCompany);
  }
});
```

**Also fix each `load*` function** to accept an explicit `account` parameter instead of using `currentCompany` (same structural fix as save functions).

**Test:**
```
1. User A on novartis, approves item
2. User B on astrazeneca, switches dropdown to novartis
3. User B sees User A's approval immediately (no page reload needed)
```

## Acceptance Criteria

### Functional Requirements
- [x] All 11 `save*ToKV`/`delete*FromKV` functions use explicit `account` parameter, never `currentCompany`
- [x] `match-review.ts` POST does per-entity read-merge-write (not full overwrite)
- [x] Two users approving different items on the same account → both persist
- [x] Switching company dropdown fetches fresh data from KV
- [x] Autosave blob only includes `matchReviewState[currentCompany]`, not all companies

### Non-Functional Requirements
- [x] No regression: single-user workflow works identically
- [x] No new Redis data model, no migration script needed
- [x] Grep guard: `grep "currentCompany" public/index.html | grep -E "save.*ToKV|delete.*FromKV"` returns 0 results

### Quality Gates
- [x] Console logging for all save operations includes `[endpoint] account=X` for debugging
- [x] Error toast on save failure (existing behavior preserved from earlier fix)

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Read-merge-write race window (~50ms) | Acceptable at 2-5 users editing different entities. Same pattern used in 5 existing routes. |
| `gsk-roche-lilly-regeneron` compound account not in VALID_ACCOUNTS | Check if needs adding to `api/_lib/validation.ts:11` |
| Breaking change in match-review.ts POST body format | Client and server deploy together (single Vercel deployment) |
| `load*` functions also use `currentCompany` | Fix in Phase 3 alongside save functions |

## What Was Cut (and Why)

| Original Plan Item | Why Cut |
|---|---|
| HSET migration for all 5 routes | Overengineering. Read-merge-write is sufficient. HSET requires destructive key type change + migration script + deploy ordering. |
| 3-hash split for match-review | Overengineering. Per-entity read-merge-write on single key is simpler. No atomicity gap from multi-key writes. |
| Data migration script | Not needed — no data model change. |
| 10s polling | YAGNI. KV reload on company switch is sufficient for 2-5 internal users. Can add later if users complain. |
| Autosave rewrite | Out of scope. Only change: strip cross-company data from autosave blob. |

## References

### Internal
- Brainstorm: `docs/brainstorms/2026-02-12-fix-concurrent-match-review-persistence-brainstorm.md`
- KV client: `api/_lib/kv.ts`
- Validation: `api/_lib/validation.ts`
- Existing read-merge-write pattern: `api/corrections.ts:53-61`
- Client save functions: `public/index.html` lines 97027-99248
- Company switch handler: `public/index.html` line 100567

### Plan Review Feedback
- DHH reviewer: "Read-merge-write. Same pattern, same simplicity, same code your team already understands."
- Simplicity reviewer: "Phase 1 alone probably fixes the proven bug. HSET solves a theoretical problem."
- Pattern reviewer: Found 6 additional bugs including migration key-type conflict, polling race condition, autosave cross-contamination, and `deleteSizeOverrideFromKV` using wrong company key.
