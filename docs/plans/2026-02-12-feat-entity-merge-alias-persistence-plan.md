---
title: Entity Merge & Alias Persistence
type: feat
date: 2026-02-12
revised: 2026-02-12 (post-review)
---

# Entity Merge & Alias Persistence

## Overview

Add the ability to merge any two entities in the org chart viewer (not just auto-detected duplicates) and persist those merge decisions as aliases that the Python pipeline consults on future runs. Today, merges only work from the Duplicates modal (same-leader detection), and re-running the pipeline recreates previously merged duplicates.

## Problem Statement

1. **No arbitrary merge** — Users can only merge entities that share a leader name. If "ABCD" and "ABCD Group" have different leaders, there's no way to merge them.
2. **Merges don't persist across pipeline runs** — `consolidate_with_hierarchy.py` does its own LLM-based dedup but never checks Vercel KV for prior merge decisions. Re-extraction recreates the same duplicates.
3. **No alias management** — Once merged, users can't add additional aliases (e.g., "ABCD Therapeutics") or remove stale ones.

## Proposed Solution

### Part 1: Merge Tab in Manage Entities Modal

Add a "Merge" tab as the third tab in the existing Manage Entities modal (alongside Create/Delete). Users search for two entities, preview the merge, and confirm.

### Part 2: Editable Aliases on Entity Detail Panel

Show "Also known as: [alias1, alias2]" on canonical entities with add/remove capability.

### Part 3: Alias-Aware Pipeline Step

New step in `consolidate_with_hierarchy.py` that fetches merges from KV, checks extracted entities against known aliases, and writes flagged matches to `alias_matches.json` for human review. No auto-apply.

---

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────┐
│  Viewer (public/index.html)                 │
│  ┌───────────────────────┐                  │
│  │ Manage Entities Modal  │                  │
│  │ [Create] [Delete] [Merge] ← NEW TAB     │
│  └───────────────────────┘                  │
│  ┌───────────────────────┐                  │
│  │ Entity Detail Panel    │                  │
│  │ "Also known as: ..."  ← NEW SECTION     │
│  └───────────────────────┘                  │
└──────────────┬──────────────────────────────┘
               │ POST/DELETE (no PATCH — use existing POST)
               ▼
┌──────────────────────────────┐
│  /api/merges.ts (Vercel KV)  │ ← NO API CHANGES
│  Key: merges:{account}       │
└──────────────┬───────────────┘
               │ GET (fetch merges)
               ▼
┌──────────────────────────────────────────────┐
│  consolidate_with_hierarchy.py               │
│  Step 3.5: Check Known Aliases  ← NEW STEP  │
│  Output: alias_matches.json                  │
└──────────────────────────────────────────────┘
```

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UI placement | 3rd tab in Manage Entities | Keeps entity management in one place |
| Pipeline behavior | Flag for review, no auto-apply | Safer — avoids silent mis-merges |
| Alias editing | Editable after merge | Users discover aliases over time |
| Children on merge | Reparent to canonical at render time | Preserves subtree; source data immutable |
| Snippets on merge | Combine on canonical at render time | Shows all evidence; no snippet tracking needed |
| Unmerge strategy | Delete merge record — source data is immutable | Absorbed entity + children + snippets reappear automatically |
| Alias uniqueness | Unique per company (client-side check) | Prevents pipeline ambiguity |
| Matching in pipeline | Exact + normalized only, no fuzzy | YAGNI — simple and predictable |
| API changes | None — use existing POST for all saves | Simplicity review: PATCH is redundant |
| EntityMerge interface | Keep unchanged (`mergedSnippets: string[]`) | No migration needed; snippet origin tracking unnecessary |

### Key Insight from Review

**Source data (`DATA[company].root`) is immutable.** All user changes (corrections, field-edits, merges) are stored as overlays applied at render time. This means:
- **Unmerge = delete merge record.** The absorbed entity, its children, and its snippets all reappear automatically.
- **No `MergedSnippet` or `ReparentedChild` tracking needed.** The tree is rebuilt from scratch on every render.
- **No PATCH endpoint needed.** Alias updates modify `entityMerges[canonicalId]` in JS and POST the full object via existing `saveEntityMergeToKV()`.

---

## Review Findings Applied

| Finding | Source | Action |
|---------|--------|--------|
| Drop `MergedSnippet`/`ReparentedChild` interfaces | Simplicity | Done — keep `mergedSnippets: string[]` |
| Drop PATCH endpoint | Simplicity | Done — use existing POST |
| Drop Phase 4 unmerge rewrite | Simplicity | Done — existing 5-line unmerge works |
| Clear `entityMerges` on company switch | Data Integrity | Added to Phase 1 — prevents cross-company contamination |
| Block merging a canonical entity | Data Integrity | Added to Phase 1 validations |
| Use `addEventListener` not inline `onclick` | Architecture | Applied to alias chip rendering |
| Anchor normalization regex to end-of-string | Architecture | Changed `\b(group\|...)\b` → `\b(group\|...)\s*$` |
| Document orphaned field-edits on absorbed entities | Data Integrity | Added to Known Limitations |
| Alias uniqueness — client-side only | Simplicity | Server-side 409 dropped; client check sufficient for 2-5 users |
| Consolidate 5 test files → 2 | Simplicity | Done |

---

## Implementation Phases

### Phase 1: Merge Tab + Alias Editing (`public/index.html`)

**1a. Fix cross-company merge contamination (prerequisite)**

Clear `entityMerges` before loading from KV on company switch:

```javascript
async function loadEntityMerges() {
  // Clear previous company's merges to prevent cross-contamination
  entityMerges = {};

  try {
    const response = await fetch(kvApiUrl('merges', currentCompany));
    if (response.ok) {
      const kvData = await response.json();
      if (kvData && Object.keys(kvData).length > 0) {
        entityMerges = kvData;
      }
    }
  } catch (e) {
    console.log('Using empty merges (KV not available)');
  }

  localStorage.setItem('entityMerges:' + currentCompany.toLowerCase(), JSON.stringify(entityMerges));
}
```

**1b. Add tab button and pane to Manage Entities modal (~line 2010)**

```html
<!-- Add after deleteEntityTab button -->
<button id="mergeEntityTab" class="reset-btn" style="flex: 1; opacity: 0.6;"
  onclick="switchManageEntitiesTab('merge')">Merge Entities</button>

<!-- Add after deleteEntityPane -->
<div id="mergeEntityPane" style="display: none;">
  <!-- Entity A (to be absorbed) picker -->
  <!-- Entity B (canonical) picker -->
  <!-- Preview panel -->
  <!-- Confirm button -->
</div>
```

**1c. Update `switchManageEntitiesTab()` (~line 99483)**

Add `merge` case that shows mergeEntityPane, hides others, sets opacity.

**1d. Entity picker pattern**

Reuse the search + dropdown pattern from Create Entity's parent picker:
- Text input with search
- Dropdown list filtered by search term (name + existing aliases)
- Selected entity shown as card with name, type, parent path
- Search matches against both canonical names AND existing aliases

**1e. Merge preview panel**

Shows before confirming:
- Entity A name -> becomes alias on Entity B
- Children being reparented (list names, cap at 10 + "and N more...")
- Snippet count being combined
- Warning if Entity A has leader but Entity B doesn't

**1f. Validations before merge**

- Entity A != Entity B (self-merge blocked)
- Entity A is not already absorbed by another entity
- Entity B is not already absorbed by another entity
- **Entity A is not canonical for other merges** (must unmerge A's absorbed entities first — prevents transitive orphans)
- Entity A's name doesn't collide with existing aliases on other entities (client-side check)

**1g. Execute merge function**

```javascript
function executeMergeFromTab() {
  const entityAId = mergeState.entityA.id;
  const entityBId = mergeState.entityB.id;
  const entityAName = getFieldValue(mergeState.entityA, 'name');
  const entityBName = getFieldValue(mergeState.entityB, 'name');

  // Build merge record — simple, no snippet/child tracking needed
  entityMerges[entityBId] = {
    absorbed: [...(entityMerges[entityBId]?.absorbed || []), entityAId],
    aliases: [...(entityMerges[entityBId]?.aliases || []), entityAName],
    mergedSnippets: [],  // Keep for backward compat, not used for logic
    mergedAt: new Date().toISOString(),
    user: 'user'
  };

  // Save to localStorage (company-scoped) + KV
  localStorage.setItem('entityMerges:' + currentCompany.toLowerCase(),
    JSON.stringify(entityMerges));
  saveEntityMergeToKV(currentCompany, entityBId, entityMerges[entityBId]);

  // Re-render
  renderCompany(currentCompany);
  closeManageEntitiesModal();
  showToast(`Merged "${entityAName}" into "${entityBName}"`, 'success');
}
```

**1h. Alias editing on detail panel**

In the evidence panel (`selectNode()` renderer), add after entity name. Use `addEventListener` instead of inline `onclick` to prevent XSS from alias names with quotes:

```javascript
// If this entity is canonical for a merge, show aliases
if (entityMerges[node.id]?.aliases?.length) {
  const aliasSection = document.createElement('div');
  aliasSection.style.cssText = 'margin: 8px 0; padding: 8px; background: #f0f4ff; border-radius: 4px;';

  const label = document.createElement('div');
  label.style.cssText = 'font-size: 11px; color: #666; margin-bottom: 4px;';
  label.textContent = 'Also known as:';
  aliasSection.appendChild(label);

  const chipContainer = document.createElement('div');
  chipContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px;';

  entityMerges[node.id].aliases.forEach(alias => {
    const chip = document.createElement('span');
    chip.className = 'alias-chip';
    chip.style.cssText = 'background: #e0e7ff; padding: 2px 8px; border-radius: 12px; font-size: 12px;';
    chip.textContent = alias;

    const removeBtn = document.createElement('span');
    removeBtn.style.cssText = 'cursor: pointer; margin-left: 4px; color: #666;';
    removeBtn.textContent = '\u00d7';
    removeBtn.addEventListener('click', () => removeAlias(node.id, alias));
    chip.appendChild(removeBtn);
    chipContainer.appendChild(chip);
  });

  const addBtn = document.createElement('button');
  addBtn.style.cssText = 'background: none; border: 1px dashed #999; padding: 2px 8px; border-radius: 12px; font-size: 12px; cursor: pointer;';
  addBtn.textContent = '+ Add';
  addBtn.addEventListener('click', () => showAddAliasInput(node.id));
  chipContainer.appendChild(addBtn);

  aliasSection.appendChild(chipContainer);
}
```

**1i. Alias add/remove functions**

```javascript
function addAlias(canonicalId, aliasName) {
  aliasName = aliasName.trim();
  if (!aliasName) return;

  // Client-side uniqueness check
  for (const [cid, merge] of Object.entries(entityMerges)) {
    if (cid !== canonicalId && merge.aliases?.includes(aliasName)) {
      showToast(`Alias "${aliasName}" already used by another entity`, 'error');
      return;
    }
  }

  entityMerges[canonicalId].aliases.push(aliasName);
  localStorage.setItem('entityMerges:' + currentCompany.toLowerCase(),
    JSON.stringify(entityMerges));
  saveEntityMergeToKV(currentCompany, canonicalId, entityMerges[canonicalId]);
  // Re-render detail panel
  selectNode(selectedNode, document.querySelector('.node.selected'));
}

function removeAlias(canonicalId, aliasName) {
  const merge = entityMerges[canonicalId];
  if (!merge) return;
  merge.aliases = merge.aliases.filter(a => a !== aliasName);
  localStorage.setItem('entityMerges:' + currentCompany.toLowerCase(),
    JSON.stringify(entityMerges));
  saveEntityMergeToKV(currentCompany, canonicalId, merge);
  selectNode(selectedNode, document.querySelector('.node.selected'));
}
```

**Acceptance criteria:**
- [ ] `entityMerges` cleared on company switch (no cross-company contamination)
- [ ] Merge tab appears in Manage Entities modal as 3rd tab
- [ ] Entity picker searches by name AND existing aliases
- [ ] Preview shows: alias creation, children count+names, snippet count, leader warning
- [ ] Self-merge, absorbed entity, canonical-entity-as-source blocked with clear error
- [ ] Merge saves to localStorage (company-scoped) + KV
- [ ] Canonical entities show "Also known as" section with alias chips
- [ ] "+ Add" button shows inline input; X button removes alias
- [ ] Alias uniqueness enforced client-side
- [ ] No inline `onclick` — all event handlers via `addEventListener`
- [ ] Toast notification confirms merge
- [ ] Existing Create/Delete tabs unaffected

---

### Phase 2: Children Reparenting + Snippet Combining (`public/index.html`)

**2a. Update `buildWorkingTree()` to reparent children (~line 98270)**

When a node is canonical for merges, add absorbed entities' children at render time:

```javascript
// In buildWorkingTree, after cloning children and processing overrides:
if (entityMerges[node.id]) {
  const merge = entityMerges[node.id];
  for (const absorbedId of merge.absorbed) {
    const absorbedNode = findNodeById(DATA[currentCompany].root, absorbedId);
    if (absorbedNode?.children) {
      absorbedNode.children.forEach(child => {
        // Only add if not already moved by a correction override
        if (!overrides[child.id]) {
          clone.children.push(buildWorkingTree(child, node));
        }
      });
    }
  }
}
```

**2b. Combined snippet rendering**

```javascript
function getNodeSnippets(node) {
  let snippets = [...(node.snippets || [])];
  if (entityMerges[node.id]) {
    for (const absorbedId of entityMerges[node.id].absorbed) {
      const absorbedNode = findNodeById(DATA[currentCompany].root, absorbedId);
      if (absorbedNode?.snippets) {
        snippets.push(...absorbedNode.snippets);
      }
    }
    // Dedupe by callId + quote
    const seen = new Set();
    snippets = snippets.filter(s => {
      const key = (s.callId || '') + ':' + (s.quote || '').slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return snippets;
}
```

Update `selectNode()` to use `getNodeSnippets(node)` instead of `node.snippets`.

**2c. Unmerge — no changes needed**

The existing `unmergeEntity()` at line 97897 already works:
1. Deletes the merge record
2. Saves to localStorage + KV
3. Re-renders

Since source data is immutable, the absorbed entity reappears with its children and snippets automatically. `buildWorkingTree()` stops reparenting children, `getNodeSnippets()` stops combining snippets, `isEntityAbsorbed()` returns null.

**Acceptance criteria:**
- [ ] Absorbed entity's children appear under canonical in tree
- [ ] Canonical entity's detail panel shows combined snippets from all absorbed entities
- [ ] Snippets deduped by callId + quote prefix
- [ ] `selectNode()` uses `getNodeSnippets()` instead of `node.snippets` directly
- [ ] Unmerge restores absorbed entity with all its children and snippets
- [ ] Partial unmerge works (unmerge one of multiple absorbed entities)

---

### Phase 3: Pipeline Alias-Aware Step (`scripts/consolidate_with_hierarchy.py`)

**3a. New helper: `scripts/fetch_kv_merges.py`**

```python
"""Fetch entity merges from Vercel KV API for pipeline use."""
import os
import re
import requests


def fetch_merges(company: str) -> dict:
    """Fetch merges from /api/merges for a company.

    Returns dict: { canonicalId: { absorbed: [], aliases: [], ... } }
    """
    base_url = os.environ.get('VIEWER_BASE_URL', 'http://localhost:3000')
    bypass_secret = os.environ.get('VERCEL_AUTOMATION_BYPASS_SECRET', '')

    url = f"{base_url}/api/merges?account={company.lower()}"
    headers = {}
    if bypass_secret:
        headers['x-vercel-protection-bypass'] = bypass_secret

    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()


def build_alias_lookup(merges: dict) -> dict:
    """Build normalized alias -> (canonical_id, canonical_name) lookup."""
    lookup = {}
    for canonical_id, merge in merges.items():
        for alias in merge.get('aliases', []):
            normalized = normalize_entity_name(alias)
            lookup[normalized] = {
                'canonical_id': canonical_id,
                'alias': alias
            }
    return lookup


def normalize_entity_name(name: str) -> str:
    """Normalize entity name for alias matching.

    Rules: lowercase, strip common suffixes (END OF STRING ONLY),
    strip punctuation, collapse whitespace.
    MUST match the JS normalizeEntityName() in index.html.
    """
    name = name.lower().strip()
    # Only strip suffixes at end of string (not "Group Therapeutics")
    name = re.sub(r'\b(group|inc|ltd|llc|corp|corporation|limited)\s*$', '', name)
    name = re.sub(r'[.,;:!?]', '', name)
    name = re.sub(r'\s+', ' ', name)
    return name.strip()
```

**3b. Integration into consolidate_with_hierarchy.py**

Insert between quality filter (Step 3) and LLM consolidation (Step 4), around line 586:

```python
from fetch_kv_merges import fetch_merges, build_alias_lookup, normalize_entity_name

# Step 3.5: Check known aliases
print("  Checking known aliases from KV...")
alias_matches = []
try:
    merges = fetch_merges(company)
    alias_lookup = build_alias_lookup(merges)
    print(f"  Loaded {len(alias_lookup)} known aliases")

    for entity in quality_entities:
        normalized = normalize_entity_name(entity['name'])
        if normalized in alias_lookup:
            match = alias_lookup[normalized]
            alias_matches.append({
                'extracted_name': entity['name'],
                'extracted_id': entity['id'],
                'canonical_id': match['canonical_id'],
                'matched_alias': match['alias'],
                'match_type': 'normalized',
                'sources': [s.get('call_id') for s in entity.get('sources', [])]
            })

    if alias_matches:
        matches_path = output_dir / f"{company}" / "alias_matches.json"
        matches_path.parent.mkdir(parents=True, exist_ok=True)
        with open(matches_path, 'w') as f:
            json.dump({
                'company': company,
                'generated_at': datetime.now().isoformat(),
                'matches': alias_matches,
                'summary': {'total': len(alias_matches)}
            }, f, indent=2)
        print(f"  Alias matches found: {len(alias_matches)} (see {matches_path})")
    else:
        print("  No alias matches found")

except requests.RequestException as e:
    print(f"  Warning: Could not fetch merges from KV ({e}). Skipping alias check.")

# Step 4: LLM consolidation (unchanged)
```

**3c. JS normalization function (must match Python)**

Add to `public/index.html`:

```javascript
function normalizeEntityName(name) {
  return name.toLowerCase().trim()
    .replace(/\b(group|inc|ltd|llc|corp|corporation|limited)\s*$/g, '')
    .replace(/[.,;:!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

**Acceptance criteria:**
- [ ] `fetch_merges()` fetches from KV API with bypass secret support
- [ ] `build_alias_lookup()` maps normalized aliases to canonical IDs + names
- [ ] `normalize_entity_name()` only strips suffixes at END of string
- [ ] Python and JS normalization functions produce identical output
- [ ] Pipeline prints alias match summary when matches found
- [ ] Pipeline writes `output/{company}/alias_matches.json` with match details
- [ ] `alias_matches.json` includes canonical name (not just ID) for readability
- [ ] Pipeline continues to LLM consolidation after flagging (does NOT skip or auto-merge)
- [ ] Pipeline handles KV unavailability gracefully (warning, not crash)

---

## Test Files

Two test files (consolidated from 5):

**`tests/test_entity_merge.py`** — Frontend behavior
```python
def test_merge_tab_renders():
    """Merge tab button and pane exist in HTML"""

def test_self_merge_blocked():
    """Selecting same entity as A and B shows error"""

def test_canonical_as_source_blocked():
    """Cannot merge an entity that is canonical for other merges"""

def test_children_reparent_after_merge():
    """After merge, absorbed entity's children render under canonical"""

def test_combined_snippets_display():
    """Canonical entity shows snippets from all absorbed entities"""

def test_alias_chips_render():
    """Canonical entity with aliases shows alias chips"""

def test_add_alias_validates_uniqueness():
    """Cannot add alias already used by another entity"""

def test_unmerge_restores_entity():
    """Unmerged entity reappears with children and snippets"""

def test_partial_unmerge():
    """Unmerging one of three absorbed entities keeps the other two"""

def test_no_cross_company_contamination():
    """Switching companies clears entityMerges; entities not hidden across companies"""
```

**`tests/test_alias_pipeline.py`** — Pipeline behavior
```python
def test_normalize_entity_name():
    """Normalization strips END-of-string suffixes, lowercases, collapses whitespace"""
    assert normalize_entity_name("Discovery Sciences Group") == "discovery sciences"
    assert normalize_entity_name("ABCD Inc.") == "abcd"
    assert normalize_entity_name("  Biologics  Engineering  ") == "biologics engineering"
    # Edge cases: suffix NOT at end should NOT be stripped
    assert normalize_entity_name("Group Therapeutics") == "group therapeutics"
    assert normalize_entity_name("Workgroup Alpha") == "workgroup alpha"

def test_build_alias_lookup():
    """Builds correct reverse mapping from merges data"""

def test_pipeline_flags_matches():
    """Pipeline writes alias_matches.json when matches found"""

def test_pipeline_continues_on_kv_failure():
    """Pipeline prints warning but does not crash if KV unavailable"""

def test_normalization_parity():
    """Python and JS normalize functions produce identical output for test cases"""
```

---

## Affected Files Summary

| File | Change | Lines (approx) |
|------|--------|----------------|
| `public/index.html` | Merge tab, alias editing, loadEntityMerges fix, buildWorkingTree update, getNodeSnippets, normalizeEntityName | +350 |
| `scripts/fetch_kv_merges.py` | **New file** — KV fetch + alias lookup + normalization | +60 |
| `scripts/consolidate_with_hierarchy.py` | Add alias check step between quality filter and LLM | +40 |
| `tests/test_entity_merge.py` | **New file** — Frontend merge/alias tests | +80 |
| `tests/test_alias_pipeline.py` | **New file** — Pipeline alias matching tests | +50 |

**No API changes needed.** Existing `api/merges.ts` POST/GET/DELETE handles everything.

---

## Known Limitations (Documented, Accepted)

1. **Orphaned field-edits/corrections on absorbed entities** — If Entity A has field-edits or corrections and gets merged, those edits persist in KV but become invisible. On unmerge, they reappear. This is acceptable because: (a) the data is not lost, just hidden; (b) cascading across 4 KV stores adds significant complexity for an edge case; (c) unmerge restores everything.

2. **Corrections on merge-reparented children** — If a user drags a child of an absorbed entity to a new parent while the merge is active, the correction records the canonical entity as "original parent" rather than the absorbed entity. On unmerge, the correction persists but points to the wrong parent. Mitigation: documented as known behavior; users can delete the correction manually.

3. **Pipeline doesn't auto-apply aliases** — The pipeline flags matches but doesn't collapse them. The user must manually review `alias_matches.json` and confirm or dismiss via the Merge tab. This is by design (safety > convenience).

4. **localStorage → company-scoped key change** — Changing from `localStorage.getItem('entityMerges')` to `localStorage.getItem('entityMerges:company')` means existing localStorage data from before this change will be orphaned. Users will need to re-merge any entities that were only in the old key. KV data is unaffected and will be loaded correctly.

---

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| KV unavailable during pipeline run | Graceful fallback — print warning, skip alias check, continue |
| Vercel Deployment Protection blocks pipeline API calls | Use `VERCEL_AUTOMATION_BYPASS_SECRET` env var |
| Normalization drift between Python and JS | Shared parity test in `tests/test_alias_pipeline.py` |
| Large index.html (100k+ lines) — editing risk | Test after each phase, use precise line-number edits |
| Concurrent merge conflicts | Read-merge-write pattern; last-write-wins acceptable for 2-5 users |
| Pipeline re-run regenerates absorbed entity | `isEntityAbsorbed()` hides it automatically based on KV merge record |

---

## Success Metrics

- [ ] Users can merge any two entities from Manage Entities modal
- [ ] Aliases are visible and editable on canonical entity's detail panel
- [ ] Unmerge restores original entity (source data is immutable — no tracking needed)
- [ ] No cross-company merge contamination
- [ ] Re-running pipeline flags known aliases in `alias_matches.json`
- [ ] Pipeline doesn't crash if KV is unavailable

---

## References

- Brainstorm: `docs/brainstorms/2026-02-12-entity-merge-and-alias-persistence-brainstorm.md`
- Existing merges API: `api/merges.ts`
- Existing merge JS: `public/index.html:97726-97909`
- Manage Entities modal: `public/index.html:2002-2079`
- Tab switching: `public/index.html:99483-99501`
- Pipeline consolidation: `scripts/consolidate_with_hierarchy.py:570-615`
- KV client: `api/_lib/kv.ts`
- KV concurrency fix: `docs/brainstorms/2026-02-12-fix-concurrent-match-review-persistence-brainstorm.md`
- Simplicity review: Drop MergedSnippet/ReparentedChild/PATCH — source data immutable
- Architecture review: XSS via inline onclick, normalization regex anchoring
- Data integrity review: Cross-company contamination, transitive orphan prevention
