---
title: "fix: Global state persistence — make all user changes durable in KV"
type: fix
date: 2026-02-12
---

# fix: Global State Persistence

## Overview

Architecture audit found 11 state persistence issues where user changes are silently lost. This plan fixes all of them in priority order, building on WS2 (already implemented) and complementing two existing plans (concurrent persistence, entity merge).

## Problem Statement

Users make changes (drag-drop, deletes, match approvals, duplicate dismissals) that only persist in localStorage. Clearing the browser, switching devices, or hitting the reset button causes silent data loss. The `beforeunload` save via `sendBeacon` silently fails on every page close due to a Content-Type bug.

**Hard evidence from architecture audit (2026-02-12):**

| Finding | Severity | Status |
|---------|----------|--------|
| `loadGraduatedMaps()` never fetches KV | P0 | **FIXED (WS2)** |
| `saveManualMapModifications()` gated on graduation | P0 | **FIXED (WS2)** |
| Company switch missing graduated-map reload | P1 | **FIXED (WS2)** |
| `sendBeacon` sends `text/plain`, server rejects 400 | P0 | **This plan — Phase 1A** |
| `manualMapOverrides` zero KV persistence | P0 | **This plan — Phase 1B** |
| Autosave KV write-only (never restored) | P1 | **This plan — Phase 4** |
| `validDuplicate:*` localStorage-only | P1 | **This plan — Phase 5** |
| Reset button doesn't clear KV | P1 | **This plan — Phase 5** |
| Company switch missing 3 reload calls | P1 | **This plan — Phase 2** |
| `createNewEntity()` missing audit log | P1 | **This plan — Phase 5** |
| Global localStorage + per-company KV keys | P2 | **Deferred** |
| Read-merge-write race conditions | P2 | **Deferred** |

## Relationship to Other Plans

| Plan | Scope | This Plan's Overlap |
|------|-------|---------------------|
| `2026-02-12-fix-concurrent-multi-user-persistence-plan.md` | Fix company key bug in save functions, read-merge-write for match-review.ts | None — complementary. That plan fixes HOW saves work; this plan fixes WHAT gets saved. |
| `2026-02-12-feat-entity-merge-alias-persistence-plan.md` | Merge tab, alias editing, pipeline integration | None — complementary. That plan adds new features; this plan fixes existing persistence gaps. |

---

## Implementation Phases

### Phase 1A: Fix sendBeacon Content-Type (P0)

**File:** `public/index.html` lines 107741-107752

**Problem:** `navigator.sendBeacon(url, JSON.stringify(data))` sends `Content-Type: text/plain`. Vercel's body parser doesn't parse it as JSON, so `req.body.state` is `undefined` and the server returns 400.

**Fix:** Wrap in `Blob` with explicit JSON content type.

```javascript
// BEFORE (broken):
navigator.sendBeacon(
  kvApiUrl('autosave', currentCompany),
  JSON.stringify({ state })
);

// AFTER (fixed):
navigator.sendBeacon(
  kvApiUrl('autosave', currentCompany),
  new Blob([JSON.stringify({ state })], { type: 'application/json' })
);
```

Same fix for the graduated-map beacon at line 107749-107752.

**Acceptance criteria:**
- [ ] Both `sendBeacon` calls use `new Blob([...], { type: 'application/json' })`
- [ ] No raw `JSON.stringify` passed directly to `sendBeacon`

**Test:** `tests/test_ws_sendbeacon_fix.py`
```python
def test_sendbeacon_uses_blob():
    """Both sendBeacon calls must use Blob with application/json"""
    # Find all sendBeacon calls, verify they use Blob wrapper

def test_no_raw_stringify_in_sendbeacon():
    """sendBeacon must not receive raw JSON.stringify output"""
```

---

### Phase 1B: Add KV Persistence for manualMapOverrides (P0)

**File:** `public/index.html` lines 103720-103728

**Problem:** `saveManualMapOverrides()` only writes to localStorage. `loadManualMapOverrides()` only reads from localStorage. All Manual Map drag-drop reparenting is lost on browser clear.

**Approach:** Rather than creating a new KV endpoint, fold overrides INTO `MANUAL_DATA` at save time. When a user drag-drops in Manual Map mode, the override is applied directly to the `MANUAL_DATA[company].root` tree (reparent the node), then `saveManualMapModifications()` syncs the updated tree to KV. This eliminates the overlay system for manual maps entirely.

**Why this approach:** The graduated-map KV key already stores the full `MANUAL_DATA[company]` tree. If we apply overrides into the tree at mutation time (not render time), the existing `saveManualMapModifications()` → KV sync path handles persistence automatically. No new API endpoint needed.

**Implementation:**

Update the drag-drop handler (~line 106813) to:
1. Mutate `MANUAL_DATA[currentCompany].root` directly (reparent the node in the tree)
2. Clear the `manualMapOverrides[nodeId]` entry (no longer needed as overlay)
3. Call `saveManualMapModifications()` (which now syncs to KV unconditionally, per WS2)

```javascript
// Current (overlay-only):
manualMapOverrides[draggedNodeId] = { originalParent, newParent, newParentName, movedAt };
saveManualMapOverrides();  // localStorage only
renderManualMapView();

// New (apply to tree + save to KV):
applyManualMapReparent(draggedNodeId, newParentId);
saveManualMapModifications();  // syncs MANUAL_DATA to KV
renderManualMapView();
```

New helper function:
```javascript
function applyManualMapReparent(nodeId, newParentId) {
  const root = MANUAL_DATA[currentCompany].root;
  // 1. Find and remove node from current parent
  const node = removeNodeFromParent(root, nodeId);
  if (!node) return;
  // 2. Find new parent and append node
  const newParent = findManualNodeById(root, newParentId);
  if (!newParent) return;
  if (!newParent.children) newParent.children = [];
  newParent.children.push(node);
}
```

**Acceptance criteria:**
- [ ] Drag-drop in Manual Map mutates `MANUAL_DATA` directly, not just `manualMapOverrides`
- [ ] `saveManualMapModifications()` is called after drag-drop (KV sync)
- [ ] Drag-drop changes persist after browser clear (loaded from KV via `loadGraduatedMaps`)
- [ ] Existing `buildManualMapWorkingTree()` still renders correctly
- [ ] `manualMapOverrides` is no longer written to on manual map drag-drop

**Test:** `tests/test_ws_manual_map_drag_persist.py`
```python
def test_drag_drop_calls_save_modifications():
    """Manual map drag handler must call saveManualMapModifications, not just saveManualMapOverrides"""

def test_drag_drop_does_not_use_overlay():
    """Manual map drag handler must NOT write to manualMapOverrides"""
    # Check that the drop handler's code path calls applyManualMapReparent, not manualMapOverrides[id] = ...
```

---

### Phase 2: Complete Company Switch Reloads (P1)

**File:** `public/index.html` ~line 107286

**Problem:** Company switch handler loads 6 things (matchReview, overrides, sizeOverrides, fieldEdits, entityMerges, graduatedMaps) but misses 3:
- `loadManualMapOverrides()` — stale cross-company drag-drop state
- `loadManualMapModifications()` — stale cross-company CRUD log
- `loadResolutions()` — stale conflict resolutions

Note: If Phase 1B eliminates `manualMapOverrides` for manual maps, we still need to handle it for auto mode overrides. And `loadManualMapModifications()` reads from localStorage only, so it needs the reload to pick up company-scoped data.

**Fix:**

```javascript
document.getElementById('companySelect').addEventListener('change', async e => {
  currentCompany = e.target.value;
  await Promise.all([
    loadGraduatedMaps(),
    loadMatchReviewState(),
    loadOverrides(),
    loadSizeOverrides(),
    loadFieldEdits(),
    loadEntityMerges(),
    loadResolutions()
  ]);
  loadManualMapOverrides();
  loadManualMapModifications();
  // render...
});
```

**Acceptance criteria:**
- [ ] Company switch calls `loadResolutions()`
- [ ] Company switch calls `loadManualMapOverrides()`
- [ ] Company switch calls `loadManualMapModifications()`
- [ ] Switching from Company A to B doesn't leave A's stale state in memory

**Test:** `tests/test_ws_company_switch_complete.py`
```python
def test_company_switch_loads_all_state():
    """Company switch handler must reload ALL state types"""
    # Parse the change handler block, verify all load functions are called
```

---

### Phase 3: WS1 — Graduate All Embedded Maps to KV (Script)

**File:** New `scripts/graduate_all_to_kv.py`

**Problem:** WS2 made `loadGraduatedMaps()` fetch from KV, but for most companies there's nothing in KV yet. The 7 embedded manual maps have never been graduated.

**Approach:** GET-before-POST script that only writes to KV for companies that don't already have a graduated map. This protects Novartis's existing KV data (which has the NIBR Cambridge merge and Biomedical Research rename).

```python
"""Graduate all embedded manual maps to KV.

For each company in MANUAL_DATA:
1. GET /api/graduated-map?account={company}
2. If 200: skip (already graduated, protect existing edits)
3. If 404: POST the embedded MANUAL_DATA to KV
"""
import os
import json
import re
import requests
from pathlib import Path

VIEWER_BASE_URL = os.environ.get('VIEWER_BASE_URL', 'http://localhost:3000')
BYPASS_SECRET = os.environ.get('VERCEL_AUTOMATION_BYPASS_SECRET', '')

def main():
    # Parse MANUAL_DATA from index.html
    html = (Path(__file__).parent.parent / 'public' / 'index.html').read_text()
    # Extract company keys from MANUAL_DATA
    # ... (use conftest.py extract_js_object pattern)

    for company, data in manual_data.items():
        url = f"{VIEWER_BASE_URL}/api/graduated-map?account={company.lower()}"
        headers = {'Content-Type': 'application/json'}
        if BYPASS_SECRET:
            headers['x-vercel-protection-bypass'] = BYPASS_SECRET

        # Check if already graduated
        resp = requests.get(url, headers=headers)
        if resp.status_code == 200:
            print(f"  {company}: already in KV, skipping")
            continue

        # POST to KV
        resp = requests.post(url, headers=headers, json={'map': data})
        if resp.ok:
            print(f"  {company}: graduated to KV ✓")
        else:
            print(f"  {company}: FAILED ({resp.status_code})")

if __name__ == '__main__':
    main()
```

**Acceptance criteria:**
- [ ] Script reads MANUAL_DATA from embedded index.html
- [ ] GET before POST — never overwrites existing KV data
- [ ] All 7 companies checked; only 404s get POSTed
- [ ] Novartis (already in KV) is skipped with log message
- [ ] Uses `VERCEL_AUTOMATION_BYPASS_SECRET` for protected endpoints

**Test:** `tests/test_ws1_graduation_script.py`
```python
def test_script_skips_existing(mock_get_200):
    """Script must not POST when GET returns 200"""

def test_script_posts_missing(mock_get_404):
    """Script must POST when GET returns 404"""

def test_script_uses_bypass_secret():
    """Script must include bypass secret in headers"""
```

---

### Phase 4: WS3 — Match Review Approvals Update MANUAL_DATA

**File:** `public/index.html` ~line 106429 (`approveMatch`)

**Problem:** Approving a match saves the decision to `match-review:{company}` KV key but never updates `MANUAL_DATA`. The manual map "fakes" approved match evidence at display time via `getApprovedMatchesForNode()`. If the match-review key is cleared, evidence disappears.

**Fix:** After saving the match decision, also write the evidence into the target node's `gongEvidence`:

```javascript
async function approveMatch(company, itemId, manualNode, manualPath) {
  // ... existing approval logic ...

  // NEW: Write evidence into MANUAL_DATA
  const node = findManualNodeById(MANUAL_DATA[company].root, manualNode);
  if (node) {
    if (!node.gongEvidence) node.gongEvidence = { snippets: [], sizeMentions: [], totalMentions: 0 };
    // Append snippet if not already present (dedup by callId)
    const snippet = buildSnippetFromMatch(approval);
    const isDupe = node.gongEvidence.snippets.some(s => s.callId === snippet.callId && s.quote === snippet.quote);
    if (!isDupe) {
      node.gongEvidence.snippets.push(snippet);
      node.gongEvidence.totalMentions = (node.gongEvidence.totalMentions || 0) + 1;
    }
    // Sync updated tree to KV
    await saveManualMapModifications();
  }
}
```

Also gate `getApprovedMatchesForNode()` to skip snippets already in `gongEvidence` (prevent double-display during transition).

**Acceptance criteria:**
- [ ] `approveMatch()` writes snippet into target node's `gongEvidence.snippets`
- [ ] Dedup: same snippet not added twice
- [ ] `saveManualMapModifications()` called after enrichment (KV sync)
- [ ] Evidence panel shows snippet exactly once (no duplicates from runtime overlay + embedded)
- [ ] KV `graduated-map:{company}` reflects the new snippet

**Test:** `tests/test_ws3_match_review_to_manual.py`
```python
def test_approve_match_calls_save_modifications():
    """approveMatch must call saveManualMapModifications after enriching MANUAL_DATA"""

def test_approve_match_deduplicates():
    """approveMatch must check for existing snippets before adding"""

def test_evidence_panel_no_duplicates():
    """getApprovedMatchesForNode must skip snippets already in gongEvidence"""
```

---

### Phase 5: Cleanup Fixes (P1)

#### 5A: `createNewEntity()` Missing Audit Log

**File:** `public/index.html` ~line 105863

**Problem:** `createNewEntity()` (manage-entities modal) calls `saveManualMapModifications()` but doesn't push to `manualMapModifications[currentCompany].added` like `addManualMapChild()` does.

**Fix:** Add tracking before the save call:

```javascript
function createNewEntity() {
  // ... existing validation and node creation ...
  parentNode.children.push(newNode);

  // NEW: Track in modifications log
  if (!manualMapModifications[currentCompany]) {
    manualMapModifications[currentCompany] = { added: [], deleted: [] };
  }
  manualMapModifications[currentCompany].added.push({
    id: newNode.id,
    name: newNode.name,
    parentId: parentNode.id,
    addedAt: new Date().toISOString()
  });

  saveManualMapModifications();
  // ...
}
```

#### 5B: Reset Button Must Clear KV

**File:** `public/index.html` ~line 107325

**Problem:** Reset button sets `overrides = {}` and saves to localStorage, but KV still has old data. On reload, KV data merges back.

**Fix:** Also DELETE from KV:

```javascript
document.getElementById('resetAllBtn').addEventListener('click', async () => {
  if (confirm('Reset all user overrides for ' + currentCompany + '?')) {
    overrides = {};
    saveOverrides();
    // Also clear KV
    try {
      await fetch(kvApiUrl('corrections', currentCompany), { method: 'DELETE' });
    } catch (e) {
      console.error('[Reset] KV clear failed:', e.message);
    }
    renderCompany(currentCompany);
  }
});
```

Note: The corrections API endpoint already supports DELETE (returns `{ success: true }`). Need to verify it handles a bulk delete (no entityId = delete all).

#### 5C: `validDuplicate:*` KV Persistence

**File:** `public/index.html` ~line 103972

**Problem:** Dismissing a duplicate leader saves to `localStorage.setItem('validDuplicate:...')` only. Lost on browser clear.

**Fix:** Store dismissed duplicates in a new section of `field-edits` or as a lightweight KV key. Simplest approach: use the existing `resolutions` endpoint (it's already global) with a `validDuplicate:` prefix:

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

On load, `loadResolutions()` already fetches all resolutions from KV. The duplicate check just needs to also check `conflictResolutions[validKey]`.

**Combined Phase 5 acceptance criteria:**
- [ ] `createNewEntity()` pushes to `manualMapModifications[company].added`
- [ ] Reset button calls DELETE on KV corrections endpoint
- [ ] `markDuplicateValid()` persists to KV via resolutions
- [ ] Dismissed duplicates survive browser clear

---

## Deferred (P2)

These are real issues but acceptable for 2-5 internal users:

1. **Global localStorage keys** (Finding 3.5/3.6) — Overrides, sizeOverrides, fieldEdits, matchReviewState use global localStorage keys but per-company KV keys. Risk: cross-company bleed. Mitigation: compound key format (`company:nodeId`) prevents collisions in practice.

2. **Read-merge-write race conditions** (Finding 3.11) — All KV endpoints have a ~50ms race window. At 2-5 users editing different entities, collision probability is effectively zero. The concurrent persistence plan addresses the worst case (match-review full overwrite).

3. **Autosave write-only** (Finding 3.9) — The autosave system captures state every 5 minutes but nothing reads it. Once Phases 1-5 fix all save paths, autosave becomes a true safety net rather than the last resort. Adding a "restore from autosave" UI is a future enhancement.

---

## Sequencing

```
Phase 1A (sendBeacon)     ─── 15 min, standalone
Phase 1B (manualMapOverrides) ─── 1-2 hours, needs careful tree mutation
Phase 2  (company switch) ─── 30 min, standalone
Phase 3  (graduation script) ─── 1 hour, must run AFTER deploy of WS2+Phase 1
Phase 4  (match review → MANUAL_DATA) ─── 1-2 hours, depends on Phase 3
Phase 5  (cleanup) ─── 1-2 hours, standalone
```

Phase 1A and Phase 2 can be done in parallel. Phase 3 must wait for a deploy that includes WS2 (so the viewer can load from KV). Phase 4 depends on Phase 3 (so graduated maps exist in KV for match review to enrich).

---

## Test Files Summary

| Test File | Phase | Tests |
|-----------|-------|-------|
| `tests/test_ws2_graduated_map_loading.py` | WS2 (done) | 7 tests, all passing |
| `tests/test_ws_sendbeacon_fix.py` | 1A | 2 tests |
| `tests/test_ws_manual_map_drag_persist.py` | 1B | 2 tests |
| `tests/test_ws_company_switch_complete.py` | 2 | 1 test |
| `tests/test_ws1_graduation_script.py` | 3 | 3 tests |
| `tests/test_ws3_match_review_to_manual.py` | 4 | 3 tests |

---

## Critical Files

| File | Changes |
|------|---------|
| `public/index.html:107741` | Phase 1A: sendBeacon Blob wrapper |
| `public/index.html:106813` | Phase 1B: drag-drop → mutate MANUAL_DATA |
| `public/index.html:103720` | Phase 1B: saveManualMapOverrides removal |
| `public/index.html:107286` | Phase 2: company switch handler |
| `scripts/graduate_all_to_kv.py` | Phase 3: new graduation script |
| `public/index.html:106429` | Phase 4: approveMatch enrichment |
| `public/index.html:105863` | Phase 5A: createNewEntity audit log |
| `public/index.html:107325` | Phase 5B: reset button KV clear |
| `public/index.html:103972` | Phase 5C: validDuplicate KV persistence |

---

## References

- Architecture audit: session `f4620748` (2026-02-12)
- WS2 implementation: `tests/test_ws2_graduated_map_loading.py` (7/7 pass)
- Concurrent persistence plan: `docs/plans/2026-02-12-fix-concurrent-multi-user-persistence-plan.md`
- Entity merge plan: `docs/plans/2026-02-12-feat-entity-merge-alias-persistence-plan.md`
- KV API endpoints: `api/graduated-map.ts`, `api/corrections.ts`, `api/autosave.ts`, `api/resolutions.ts`
- sendBeacon MDN: `sendBeacon(url, Blob)` sends with Blob's content type
