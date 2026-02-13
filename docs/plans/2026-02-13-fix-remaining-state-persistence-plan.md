---
title: "fix: Remaining state persistence — drag-drop KV, graduation, match evidence, cleanup"
type: fix
date: 2026-02-13
prerequisite: "fix/global-state-persistence branch (ad5ad22)"
---

# fix: Remaining State Persistence Fixes

## Overview

Completes the state persistence work started in `ad5ad22`. That commit fixed 4 issues (KV loading, sendBeacon, company switch, audit log). This plan covers the remaining 6 items: drag-drop persistence, graduation script, match review evidence, reset button, duplicate dismissals, and the `currentCompany` race in `saveManualMapModifications`.

## Already Done (ad5ad22)

- WS2: `loadGraduatedMaps()` from KV, unconditional KV sync, async init (7 tests)
- Phase 1A: sendBeacon Blob fix (2 tests)
- Phase 2: Company switch complete reloads (3 tests)
- Phase 5A: `createNewEntity()` audit log (verified in suite)

---

## Phase 1B: Manual Map Drag-Drop Persistence (P0)

### Problem

`manualMapOverrides` (drag-drop reparenting in Manual Map mode) is localStorage-only with zero KV persistence. The key is NOT company-scoped, creating cross-company collision risk.

### Approach: Apply overrides directly to MANUAL_DATA tree

Rather than creating a new KV endpoint, mutate `MANUAL_DATA[company].root` at drop time, then `saveManualMapModifications()` syncs to KV via the existing `graduated-map` endpoint.

### Implementation

#### 1B-1. Write `removeNodeFromTree()` helper

```javascript
// Remove a node from its parent in the tree, returning the removed node
function removeNodeFromTree(root, nodeId) {
  function findAndRemove(parent) {
    if (!parent.children) return null;
    for (let i = 0; i < parent.children.length; i++) {
      if (parent.children[i].id === nodeId) {
        return parent.children.splice(i, 1)[0];
      }
      const found = findAndRemove(parent.children[i]);
      if (found) return found;
    }
    return null;
  }
  return findAndRemove(root);
}
```

Key behaviors:
- Returns the full subtree (node + children) so it can be re-attached
- Uses `splice` to remove in-place
- Recursive depth-first search

#### 1B-2. Update drop handler (line 106838-106853)

```javascript
// BEFORE:
manualMapOverrides[draggedNodeId] = newOverride;
saveManualMapOverrides();
renderManualMapView();

// AFTER:
const root = MANUAL_DATA[currentCompany].root;
const movedNode = removeNodeFromTree(root, draggedNodeId);
if (movedNode) {
  const newParent = findManualNodeById(root, node.id);
  if (newParent) {
    if (!newParent.children) newParent.children = [];
    newParent.children.push(movedNode);
    saveManualMapModifications();
  }
}
renderManualMapView();
```

#### 1B-3. Migration: Apply existing localStorage overrides to tree on init

After `loadGraduatedMaps()` completes, apply any pre-existing `manualMapOverrides` from localStorage into `MANUAL_DATA`, then clear them:

```javascript
function migrateManualMapOverrides() {
  const stored = localStorage.getItem('manualMapOverrides');
  if (!stored) return;
  const overrides = JSON.parse(stored);
  if (Object.keys(overrides).length === 0) return;

  let migrated = 0;
  Object.entries(overrides).forEach(([nodeId, ov]) => {
    // Determine which company this node belongs to
    for (const company of Object.keys(MANUAL_DATA)) {
      const root = MANUAL_DATA[company]?.root;
      if (!root) continue;
      const node = findManualNodeById(root, nodeId);
      if (!node) continue;
      const removed = removeNodeFromTree(root, nodeId);
      if (!removed) continue;
      const newParent = findManualNodeById(root, ov.newParent);
      if (!newParent) continue;
      if (!newParent.children) newParent.children = [];
      newParent.children.push(removed);
      migrated++;
      break;
    }
  });

  if (migrated > 0) {
    console.log(`[Migration] Applied ${migrated} manual map overrides to tree`);
    // Save migrated trees to KV
    Object.keys(MANUAL_DATA).forEach(company => {
      saveManualMapModifications();
    });
  }
  // Clear the old overrides
  localStorage.removeItem('manualMapOverrides');
  manualMapOverrides = {};
}
```

Call after `loadGraduatedMaps()` in the init IIFE, before `loadManualMapModifications()`.

#### 1B-4. Keep `buildManualMapWorkingTree()` reading overlays for backward compat

During the transition, `buildManualMapWorkingTree()` will still check `manualMapOverrides`. After migration clears the object, it becomes a no-op. Remove the overlay reads in a future cleanup PR.

#### 1B-5. Fix `saveManualMapModifications()` to accept explicit company

```javascript
// BEFORE (uses currentCompany):
async function saveManualMapModifications() {
  // ...
  graduatedMaps[currentCompany] = MANUAL_DATA[currentCompany];
  // ...
  const response = await fetch(kvApiUrl('graduated-map', currentCompany), ...);
}

// AFTER (explicit parameter, defaults to currentCompany for backward compat):
async function saveManualMapModifications(company) {
  company = company || currentCompany;
  // ...
  graduatedMaps[company] = MANUAL_DATA[company];
  // ...
  const response = await fetch(kvApiUrl('graduated-map', company), ...);
}
```

### Acceptance Criteria

- [ ] `removeNodeFromTree()` function exists and handles nested nodes
- [ ] Drop handler mutates `MANUAL_DATA` directly, NOT `manualMapOverrides`
- [ ] `saveManualMapModifications()` called after drop (KV sync)
- [ ] `migrateManualMapOverrides()` applies pre-existing overrides on init
- [ ] After migration, `localStorage.getItem('manualMapOverrides')` returns null
- [ ] Drag-drop changes survive browser clear (loaded from KV)
- [ ] `saveManualMapModifications()` accepts explicit company parameter
- [ ] Ancestry check (`isManualMapDescendant`) still works against `MANUAL_DATA` directly

### Tests: `tests/test_ws_phase1b_drag_persist.py`

```python
def test_remove_node_from_tree_exists():
    """removeNodeFromTree function must exist"""

def test_drop_handler_mutates_manual_data():
    """Drop handler must call removeNodeFromTree + push to new parent, not manualMapOverrides"""

def test_drop_handler_calls_save_modifications():
    """Drop handler must call saveManualMapModifications after tree mutation"""

def test_migrate_function_exists():
    """migrateManualMapOverrides function must exist"""

def test_migrate_clears_localstorage():
    """Migration removes manualMapOverrides from localStorage"""

def test_save_modifications_accepts_company_param():
    """saveManualMapModifications accepts explicit company parameter"""
```

---

## Phase 3: WS1 Graduation Script

### Problem

`loadGraduatedMaps()` (WS2) fetches from KV, but most companies have no KV data yet. The 7 embedded manual maps need to be seeded.

### Implementation: `scripts/graduate_all_to_kv.py`

```python
"""Graduate all embedded manual maps to KV.

GET-before-POST: never overwrites existing KV data.
Idempotent: safe to re-run after partial failure.
"""
import os
import sys
import json
import re
import requests
from pathlib import Path

VIEWER_BASE_URL = os.environ.get('VIEWER_BASE_URL', 'http://localhost:3000')
BYPASS_SECRET = os.environ.get('VERCEL_AUTOMATION_BYPASS_SECRET', '')

def extract_manual_data(html_path):
    """Extract MANUAL_DATA companies from index.html."""
    # Use the conftest.py extract_js_object pattern
    from tests.conftest import extract_js_object
    html = html_path.read_text(encoding='utf-8')
    return extract_js_object(html, 'MANUAL_DATA')

def main():
    html_path = Path(__file__).parent.parent / 'public' / 'index.html'
    print(f"Reading MANUAL_DATA from {html_path}...")
    manual_data = extract_manual_data(html_path)
    print(f"Found {len(manual_data)} companies: {', '.join(manual_data.keys())}")

    headers = {'Content-Type': 'application/json'}
    if BYPASS_SECRET:
        headers['x-vercel-protection-bypass'] = BYPASS_SECRET

    results = {'graduated': [], 'skipped': [], 'failed': []}

    for company, data in manual_data.items():
        url = f"{VIEWER_BASE_URL}/api/graduated-map?account={company.lower()}"
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                print(f"  {company}: already in KV — SKIPPED")
                results['skipped'].append(company)
                continue
            elif resp.status_code != 404:
                print(f"  {company}: unexpected GET status {resp.status_code} — SKIPPED")
                results['failed'].append((company, f"GET {resp.status_code}"))
                continue

            resp = requests.post(url, headers=headers, json={'map': data}, timeout=30)
            if resp.ok:
                print(f"  {company}: graduated to KV ✓")
                results['graduated'].append(company)
            else:
                print(f"  {company}: POST failed ({resp.status_code}) — FAILED")
                results['failed'].append((company, f"POST {resp.status_code}"))
        except requests.RequestException as e:
            print(f"  {company}: network error ({e}) — FAILED")
            results['failed'].append((company, str(e)))

    # Summary
    print(f"\n--- Summary ---")
    print(f"Graduated: {len(results['graduated'])} {results['graduated']}")
    print(f"Skipped (already in KV): {len(results['skipped'])} {results['skipped']}")
    print(f"Failed: {len(results['failed'])} {results['failed']}")

    if results['failed']:
        print("\nRe-run script to retry failed companies.")
        sys.exit(1)

if __name__ == '__main__':
    main()
```

### Acceptance Criteria

- [ ] Script extracts all company keys from embedded MANUAL_DATA
- [ ] GET before POST — never overwrites existing KV data
- [ ] Novartis (already in KV) is skipped
- [ ] Uses `VERCEL_AUTOMATION_BYPASS_SECRET` for protected endpoints
- [ ] Summary output shows graduated/skipped/failed counts
- [ ] Non-zero exit on failure for CI integration
- [ ] Idempotent: re-running after partial failure only retries failures

### Tests: `tests/test_ws1_graduation_script.py`

```python
def test_script_file_exists():
    """scripts/graduate_all_to_kv.py must exist"""

def test_script_uses_get_before_post():
    """Script must check GET status before POSTing"""

def test_script_uses_bypass_secret():
    """Script must use VERCEL_AUTOMATION_BYPASS_SECRET env var"""
```

---

## Phase 4: WS3 Match Review → MANUAL_DATA

### Problem

`approveMatch()` saves to `match-review:{company}` KV but never writes evidence into `MANUAL_DATA`. The evidence panel "fakes" it at display time via `getApprovedMatchesForNode()`.

### Field Mapping

Match review items (`MATCH_REVIEW_DATA.companies[co].items[n]`) → `gongEvidence.snippets[n]`:

| Match Review Item | gongEvidence Snippet |
|---|---|
| `item.id` | `callId` |
| `item.snippet` | `quote` |
| `item.snippet_date` | `date` |
| `item.person_name` | `internalName` |
| `item.gong_entity` | `entityName` (+ " (approved match)") |
| (none) | `customerName: null` |
| (none) | `gongUrl: null` |

### Implementation

#### 4-1. Add `buildSnippetFromMatchItem()` helper

```javascript
function buildSnippetFromMatchItem(item) {
  return {
    callId: item.id,
    quote: item.snippet || '',
    date: item.snippet_date || '',
    internalName: item.person_name || '',
    customerName: null,
    gongUrl: null,
    entityName: (item.gong_entity || '') + ' (approved match)'
  };
}
```

#### 4-2. Update `approveMatch()` to enrich MANUAL_DATA

```javascript
function approveMatch(company, itemId, manualNode, manualPath) {
  initMatchReviewState(company);
  delete matchReviewState[company].rejected[itemId];
  delete matchReviewState[company].manual[itemId];
  const decision = { manualNode, manualPath, approvedAt: new Date().toISOString() };
  matchReviewState[company].approved[itemId] = decision;
  saveMatchReviewState(company);
  saveMatchReviewItemToKV(company, itemId, decision, 'approved');

  // NEW: Write evidence into MANUAL_DATA
  if (MANUAL_DATA[company]?.root) {
    const targetNode = findManualNodeById(MANUAL_DATA[company].root, manualNode);
    if (targetNode) {
      if (!targetNode.gongEvidence) {
        targetNode.gongEvidence = { snippets: [], sizeMentions: [], totalMentions: 0 };
      }
      // Find the match review item to get snippet data
      const items = MATCH_REVIEW_DATA?.companies?.[company]?.items || [];
      const matchItem = items.find(i => i.id === itemId);
      if (matchItem) {
        const snippet = buildSnippetFromMatchItem(matchItem);
        // Dedup by callId
        const isDupe = targetNode.gongEvidence.snippets.some(
          s => s.callId === snippet.callId
        );
        if (!isDupe) {
          targetNode.gongEvidence.snippets.push(snippet);
          targetNode.gongEvidence.totalMentions =
            (targetNode.gongEvidence.totalMentions || 0) + 1;
        }
        // Also add team_size if present
        if (matchItem.team_size) {
          targetNode.gongEvidence.sizeMentions = targetNode.gongEvidence.sizeMentions || [];
          targetNode.gongEvidence.sizeMentions.push({
            value: String(matchItem.team_size),
            source: { callDate: matchItem.snippet_date, customerName: matchItem.person_name }
          });
        }
      }
      saveManualMapModifications(company);
    }
  }

  renderMatchReview(company);
}
```

#### 4-3. Update `showManualNodeEvidence()` to deduplicate

In `showManualNodeEvidence()` at line 106965, filter approved matches to skip those already in `gongEvidence.snippets`:

```javascript
const approvedMatches = getApprovedMatchesForNode(currentCompany, node.name);
approvedMatches.forEach(match => {
  // Skip if already embedded in gongEvidence (from Phase 4 enrichment)
  const alreadyEmbedded = snippets.some(s => s.callId === match.id);
  if (alreadyEmbedded) return;
  // ... existing overlay code ...
});
```

### Acceptance Criteria

- [ ] `buildSnippetFromMatchItem()` exists with correct field mapping
- [ ] `approveMatch()` writes snippet into target node's `gongEvidence.snippets`
- [ ] Dedup by `callId` — same snippet not added twice
- [ ] `saveManualMapModifications(company)` called after enrichment
- [ ] `showManualNodeEvidence()` skips already-embedded snippets (no duplicates)
- [ ] Defensive: if `MANUAL_DATA[company]` undefined, match-review save still works

### Tests: `tests/test_ws3_match_review_to_manual.py`

```python
def test_build_snippet_from_match_item_exists():
    """buildSnippetFromMatchItem function must exist"""

def test_approve_match_calls_save_modifications():
    """approveMatch must call saveManualMapModifications after enriching MANUAL_DATA"""

def test_approve_match_dedup_by_call_id():
    """approveMatch must check callId before adding snippet"""

def test_show_evidence_skips_embedded():
    """showManualNodeEvidence must skip approved matches already in gongEvidence"""

def test_approve_match_defensive_no_manual_data():
    """approveMatch must not throw if MANUAL_DATA[company] is undefined"""
```

---

## Phase 5B: Reset Button KV Clear

### Problem

Reset button clears `overrides` in localStorage but KV still has old data. On reload, KV merges back.

### Approach: Add bulk delete to corrections.ts + client DELETE

#### Server-side: Add bulk delete path to `api/corrections.ts`

```typescript
if (req.method === 'DELETE') {
  const { entityId } = req.body as { entityId?: string };

  if (entityId) {
    // Existing: delete single override
    const data = await kv.get<OverridesMap>(key) || {};
    delete data[entityId];
    await kv.set(key, data);
    return res.json({ success: true, remainingCount: Object.keys(data).length });
  } else {
    // NEW: bulk delete — clear entire key
    await kv.del(key);
    return res.json({ success: true, remainingCount: 0 });
  }
}
```

#### Client-side: Update reset button handler

```javascript
document.getElementById('resetAllBtn').addEventListener('click', async () => {
  if (confirm('Reset all hierarchy corrections for ' + currentCompany + '?')) {
    overrides = {};
    saveOverrides();
    try {
      await fetch(kvApiUrl('corrections', currentCompany), { method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
    } catch (e) {
      console.error('[Reset] KV clear failed:', e.message);
    }
    renderCompany(currentCompany);
  }
});
```

**Scope decision:** Keep reset limited to hierarchy corrections (rename button text to "Reset corrections" for clarity). Other state types (field-edits, sizes, merges) have their own delete workflows.

### Acceptance Criteria

- [ ] `corrections.ts` DELETE without `entityId` calls `kv.del(key)` (bulk delete)
- [ ] Reset button calls DELETE on KV corrections endpoint
- [ ] Reset is effective — corrections don't reappear on reload
- [ ] Button text clarified: "Reset corrections" (not misleading "Reset all")

### Tests: `tests/test_ws_phase5b_reset.py`

```python
def test_reset_button_calls_kv_delete():
    """Reset handler must call fetch with DELETE method on corrections endpoint"""

def test_corrections_ts_supports_bulk_delete():
    """corrections.ts DELETE handler must support no-entityId case"""
```

---

## Phase 5C: validDuplicate KV Persistence

### Problem

`markDuplicateValid()` writes to `localStorage.setItem('validDuplicate:...')` only. Lost on browser clear. The check in `findDuplicateLeaders()` reads localStorage directly, not `conflictResolutions`.

### Implementation

#### 5C-1. Update `markDuplicateValid()` to also save to KV

```javascript
function markDuplicateValid(leaderName) {
  const validKey = `validDuplicate:${currentCompany}:${leaderName}`;
  localStorage.setItem(validKey, 'true');
  // Also persist to KV via resolutions endpoint
  saveResolution(validKey, { dismissed: true, dismissedAt: new Date().toISOString() });
  showDuplicatesModal();
  updateDuplicatesBadge();
}
```

#### 5C-2. Update duplicate check to consult `conflictResolutions`

```javascript
// BEFORE (line 103837-103838):
const validKey = `validDuplicate:${currentCompany}:${name}`;
if (!localStorage.getItem(validKey)) {
  duplicates.push(...);
}

// AFTER:
const validKey = `validDuplicate:${currentCompany}:${name}`;
if (!localStorage.getItem(validKey) && !conflictResolutions[validKey]) {
  duplicates.push(...);
}
```

#### 5C-3. Add `loadResolutions()` to init `Promise.all`

```javascript
// In the init IIFE:
await Promise.all([
  loadOverrides(),
  loadSizeOverrides(),
  loadMatchReviewState(),
  loadFieldEdits(),
  loadEntityMerges(),
  loadGraduatedMaps(),
  loadResolutions()  // ADD THIS
]);
```

### Acceptance Criteria

- [ ] `markDuplicateValid()` calls `saveResolution()` with dismissal data
- [ ] Duplicate check consults both `localStorage` AND `conflictResolutions`
- [ ] Dismissed duplicates survive browser clear
- [ ] `loadResolutions()` in init `Promise.all` (not fire-and-forget)

### Tests: `tests/test_ws_phase5c_valid_duplicates.py`

```python
def test_mark_duplicate_saves_to_kv():
    """markDuplicateValid must call saveResolution"""

def test_duplicate_check_consults_conflict_resolutions():
    """findDuplicateLeaders must check conflictResolutions, not just localStorage"""

def test_load_resolutions_in_init_promise_all():
    """loadResolutions must be in the init Promise.all, not fire-and-forget"""
```

---

## Sequencing & Dependencies

```
Phase 1B (drag-drop persistence) ─── highest risk, do first, deploy alone
Phase 3  (graduation script)     ─── run AFTER Phase 1B deploy
Phase 4  (match review evidence) ─── depends on Phase 3 (needs KV data)
Phase 5B (reset button)          ─── independent, can parallel with 5C
Phase 5C (valid duplicates)      ─── independent, can parallel with 5B
```

Phase 1B should be committed and deployed independently to validate the tree mutation approach before building Phase 4 on top of it.

---

## Deferred (P2)

- Global localStorage keys vs per-company KV keys (Finding 3.5/3.6)
- Read-merge-write race conditions (Finding 3.11)
- Autosave as recovery mechanism (Finding 3.9) — becomes useful once all save paths are fixed
- Remove `manualMapOverrides` from autosave blob (after migration rollout)

---

## Test Files Summary

| File | Phase | Tests |
|------|-------|-------|
| `tests/test_ws_phase1b_drag_persist.py` | 1B | 6 |
| `tests/test_ws1_graduation_script.py` | 3 | 3 |
| `tests/test_ws3_match_review_to_manual.py` | 4 | 5 |
| `tests/test_ws_phase5b_reset.py` | 5B | 2 |
| `tests/test_ws_phase5c_valid_duplicates.py` | 5C | 3 |
| **Total** | | **19** |

---

## Critical Files

| File | Phase | Change |
|------|-------|--------|
| `public/index.html:106838` | 1B | Drop handler → tree mutation |
| `public/index.html:103623` | 1B | `saveManualMapModifications` explicit company |
| `public/index.html` (new) | 1B | `removeNodeFromTree()`, `migrateManualMapOverrides()` |
| `scripts/graduate_all_to_kv.py` | 3 | New file |
| `public/index.html:106467` | 4 | `approveMatch()` enrichment |
| `public/index.html:106965` | 4 | `showManualNodeEvidence()` dedup |
| `api/corrections.ts:65` | 5B | Bulk delete path |
| `public/index.html:107357` | 5B | Reset button KV call |
| `public/index.html:103837` | 5C | Duplicate check + `conflictResolutions` |
| `public/index.html:107287` | 5C | Init `Promise.all` + `loadResolutions` |

---

## References

- Prior commit: `ad5ad22` on `fix/global-state-persistence`
- Architecture audit: session `f4620748`
- SpecFlow analysis: agent `a1910c8` (15 gaps identified, all addressed above)
- Repo research: agent `a48194e` (confirmed patterns)
- Prior plan: `docs/plans/2026-02-12-fix-global-state-persistence-plan.md`
- Concurrent persistence plan: `docs/plans/2026-02-12-fix-concurrent-multi-user-persistence-plan.md`
