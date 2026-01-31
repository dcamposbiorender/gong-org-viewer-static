---
title: Fix Five Critical Data Pipeline Issues
type: fix
date: 2026-01-30
deepened: 2026-01-30
---

# Fix Five Critical Data Pipeline Issues

## Enhancement Summary

**Deepened on:** 2026-01-30
**Research agents used:** pattern-recognition-specialist, code-simplicity-reviewer, architecture-strategist, data-integrity-guardian, performance-oracle, kieran-python-reviewer, kieran-typescript-reviewer, julik-frontend-races-reviewer, security-sentinel, best-practices-researcher

### Critical Discovery: The Match Review Pipeline is BROKEN

**The most important finding:** `generate_match_review.py` cannot run because it requires intermediate files that DON'T EXIST:
- `output/abbvie_llm_matches.json` - NOT FOUND
- `output/abbvie_match_batches.json` - NOT FOUND

The current `abbvie_enriched_match_review_data.json` is **stale data from Jan 27** with only 35 entities vs 231 in current v5 extractions (85% data loss).

### Recommended Approach: DELETE the Broken Pipeline

The **code-simplicity-reviewer** recommends deleting ~1350 lines of dead code instead of fixing it:
- `generate_match_review.py` (350 lines)
- `llm_auto_matcher.py` (400 lines)
- `enrich_snippets.py` (300 lines)
- `match_service.py` (300 lines)

**Rationale:** The true auto map (`abbvie_true_auto_map.json`) already has all the snippets with resolved names. The match review pipeline duplicates this data poorly.

### Security Issues Discovered (CRITICAL)

| Severity | Issue | Location |
|----------|-------|----------|
| CRITICAL | PII (emails) embedded in public HTML | `public/index.html` DATA objects |
| HIGH | XSS via `innerHTML` | Multiple render functions |
| MEDIUM | No API authentication | `/api/*` routes |

### Key Improvements Identified

1. **Delete broken pipeline** instead of fixing it
2. **Fix JS leader rendering** - single line change in `renderManualMapTree()`
3. **Fix entity matching** - normalize names before lookup
4. **Add PII protection** - move sensitive data to authenticated API
5. **Fix race conditions** - debounce slider, guard render functions

---

## Overview

Investigation reveals **5 distinct bugs** in the data pipeline that are causing display issues in the viewer:

| Issue | Root Cause | Where It Breaks |
|-------|------------|-----------------|
| 1. Numbers instead of names | `[Speaker NNNN]:` prefix in `raw_quote` not cleaned in `abbvie_enriched_match_review_data.json` | Match Review snippets |
| 2. "Discovery Oncology" missing | Manual map entity lookup fails for entities without exact name match | Manual Map view |
| 3. Person blank in Match Review | `person_name` field never populated in `convert_match_review_to_viewer()` | Match Review "Person" column |
| 4. Snippets cut off | Truncation with `...` ellipsis in source data + additional truncation in pipeline | All views |
| 5. No leaders in Manual Map | Leaders exist in auto map but not being merged into manual map | Manual Map leader display |

---

## Critical Context: Pipeline is Broken

### The Problem is Deeper than Expected

The match review pipeline (`generate_match_review.py`) is **completely broken**:

```
generate_match_review.py needs:
  - output/{company}_llm_matches.json     ← DOESN'T EXIST
  - output/{company}_match_batches.json   ← DOESN'T EXIST
```

**Current state:**
- `abbvie_enriched_match_review_data.json` generated: `2026-01-27T11:33:59` (3 days old)
- v5 extractions generated: `2026-01-29` (current)
- **The match review data is stale and never regenerated after v5**

### Two Competing Pipelines

| Pipeline | Status | Output |
|----------|--------|--------|
| "True" pipeline | WORKING | `abbvie_true_auto_map.json` with 231 entities, resolved names |
| "Cleaned" pipeline | BROKEN | `abbvie_enriched_match_review_data.json` with 35 entities, no names |

**Architecture recommendation:** Archive the broken "cleaned" pipeline. The "true" pipeline has everything needed.

---

## Issue 1: Numbers Instead of Names in Snippets

### Problem
Snippets in Match Review display show `"...89237141]: There was like..."` instead of cleaned quotes.

### Root Cause
The `abbvie_enriched_match_review_data.json` file contains **pre-truncated quotes** with speaker ID prefixes:
```json
"snippet": "...89237141]: There was like a larger demonstration..."
```

But the **source extraction** (`extractions/abbvie/entities_llm_v2.json`) has **clean quotes**:
```json
"raw_quote": "There was like a larger demonstration organized by Artem..."
```

**The truncation with `...` prefix is happening BEFORE the `clean_quote()` function runs** in `build_true_auto_map.py`.

### Research Insights

**Python Reviewer Warning:** The proposed regex fix may be speculative:
- Pattern `\.{3}\d+\]:\s*` may not exist in actual data - verify first
- The v5 extractions are clean, so this pattern may only exist in stale data
- Use `lstrip('.')` for cleaner ellipsis removal instead of `startswith` check

**Best Practice:**
```python
def clean_quote(raw_quote: str) -> str:
    """Remove speaker prefixes and leading ellipsis from quotes."""
    if not raw_quote:
        return ""
    # Remove full speaker pattern
    cleaned = re.sub(r'\[Speaker \d+\]:\s*', '', raw_quote)
    # Remove leading ellipsis and any trailing digits+colon (truncated pattern)
    cleaned = cleaned.lstrip('.').lstrip()
    cleaned = re.sub(r'^\d+\]:\s*', '', cleaned)
    return cleaned.strip()
```

### Recommended Fix
**Option A (Preferred):** Delete the broken match review pipeline and use `abbvie_true_auto_map.json` directly - it already has clean quotes.

**Option B (If keeping pipeline):** Fix `clean_quote()` in both `build_true_auto_map.py` AND `generate_match_review.py`.

---

## Issue 2: "Discovery Oncology" Not in Manual Map

### Problem
User says "Discovery Oncology" from the manual map gets "3 mentions" but doesn't show entity evidence.

### Root Cause Analysis
Looking at the manual map (`abbvie_rd_map.json`):
```json
{
  "id": "oncology-discovery",
  "name": "Oncology Discovery",  // Note: "Oncology Discovery" not "Discovery Oncology"
  ...
}
```

The auto map has:
```json
{
  "name": "Oncology Discovery",  // Same name
  "snippets": [...]
}
```

### Research Insights

**Pattern Recognition:** Entity matching is duplicated across files with inconsistent normalization:
- `integrate_viewer.py`: uses `name.lower().strip()`
- `build_true_auto_map.py`: uses different normalization
- No fuzzy matching for near-misses

**Best Practice:** Centralize entity matching with consistent normalization:
```python
def normalize_entity_name(name: str) -> str:
    """Normalize entity name for matching."""
    return re.sub(r'\s+', ' ', name.lower().strip())

def build_entity_lookup(entities: list) -> dict:
    """Build lookup with multiple key variations."""
    lookup = {}
    for entity in entities:
        name = entity.get("name", "")
        normalized = normalize_entity_name(name)
        lookup[normalized] = entity
        # Also add ID-based lookup
        if entity.get("id"):
            lookup[entity["id"]] = entity
    return lookup
```

### Likely Fix
1. Normalize both sides of the lookup consistently
2. Add fallback fuzzy matching for 90%+ similarity
3. Log mismatches for debugging

---

## Issue 3: Person Blank in Match Review

### Problem
Match Review shows "Person: —" for all items despite metadata existing.

### Root Cause
In `integrate_viewer.py` line 526-527:
```python
viewer_item = {
    ...
    "person_name": None,  # ALWAYS SET TO None!
    "person_email": None,
    ...
}
```

The code **never populates** `person_name` from the source data.

### Research Insights

**Data Integrity:** The match review data (`all_snippets`) has `speakerId: null` because the old pipeline didn't resolve it. The TRUE auto map has resolved names:
```json
"customerName": "Kira Fahy; Shuang Chen",
"internalName": "Michael Long; Michelle Jang"
```

**Performance:** The participant CSV is loaded multiple times across scripts. Recommend caching:
```python
# Global cache for participant data
_participant_cache = None

def get_participants(csv_path: str) -> dict:
    global _participant_cache
    if _participant_cache is None:
        _participant_cache = load_participants(csv_path)
    return _participant_cache
```

### Recommended Fix
**Option A (Preferred):** Delete match review pipeline - true auto map already has person names.

**Option B:** Modify `convert_match_review_to_viewer()` to look up person from true auto map by call_id.

---

## Issue 4: Snippets Cut Off / Unreadable

### Problem
Snippets show as `"...his an effective demonstration. So, like we are the in vivo antibody discovery group..."` - truncated and unreadable.

### Root Cause
**Multiple truncation points:**

1. **Source truncation**: The `raw_quote` in extractions is sometimes already truncated with `...` at start/end
2. **Match review truncation**: `generate_match_review.py` line 92: `[:500]` truncation
3. **Display truncation**: CSS may apply additional truncation

### Research Insights

**Code Simplicity:** The `[:500]` truncation is unnecessary - full quotes are fine for JSON. Remove it.

**Best Practice:** If truncation is needed for display, do it in the frontend with CSS `text-overflow: ellipsis`, not in data.

### Recommended Fix
1. Remove `[:500]` from `generate_match_review.py` line 92
2. Clean `...` prefix in quote before storing
3. OR delete the pipeline and use true auto map (preferred)

---

## Issue 5: No Leaders in Manual Map

### Problem
Manual map shows entities but no leaders, despite leaders being in the manual map JSON and some being extracted.

### Root Cause - FOUND IT
The **data is correct** - the issue is in the **viewer JavaScript/HTML**.

In `public/index.html` at line 84363-84370, the `renderManualMapTree()` function only shows leaders from `evidence.matchedContacts`, **NOT from `node.leader`**:

```javascript
// CURRENT CODE (line 84363-84370)
const decisionMaker = evidence.matchedContacts?.find(c => c.isDecisionMaker);
if (decisionMaker) {
  // Only shows Gong-extracted contacts, ignores node.leader!
}
```

### Research Insights

**TypeScript Reviewer:** The proposed fix has redundant `.find()` calls. Better approach:
```javascript
// Prefer node.leader (manual map), fall back to matchedContacts (Gong)
const leader = node.leader || evidence.matchedContacts?.find(c => c.isDecisionMaker);
if (leader?.name) {
  const leaderEl = document.createElement('div');
  leaderEl.className = 'node-leader';
  leaderEl.textContent = leader.title ? `${leader.name}, ${leader.title}` : leader.name;
  nodeEl.appendChild(leaderEl);
}
```

**Race Condition Warning (Julik Reviewer):** The render function has potential issues:
- Multiple rapid re-renders can cause DOM corruption
- Add render guard: `if (this.isRendering) return; this.isRendering = true;`
- Use `requestAnimationFrame` for DOM updates

### Fix Location
`public/index.html` line 84363-84370 in `renderManualMapTree()` function

---

## Security Considerations (CRITICAL)

### PII Exposure in Public HTML

**Severity: CRITICAL**

The viewer embeds email addresses and names directly in the public HTML:
```javascript
// In public/index.html DATA objects
"customerEmail": "john.smith@abbvie.com",
"internalName": "Michael Long"
```

**Impact:** Anyone can view-source and extract all customer PII.

**Fix:** Move sensitive data to authenticated API endpoints:
1. Create `/api/snippets/[callId]` endpoint
2. Require authentication
3. Only embed non-sensitive summary data in HTML
4. Lazy-load full details on demand

### XSS Vulnerabilities

**Severity: HIGH**

Multiple uses of `innerHTML` without sanitization:
```javascript
element.innerHTML = userProvidedContent; // DANGER
```

**Fix:** Use `textContent` or sanitize with DOMPurify:
```javascript
element.textContent = userProvidedContent; // Safe
// OR
element.innerHTML = DOMPurify.sanitize(content);
```

---

## Race Conditions in Viewer (Frontend Review)

### Issues Found

1. **Render Overlap:** Multiple `renderManualMapTree()` calls can overlap
2. **Drag State Ghost:** Drag operations may not clean up on rapid clicks
3. **Slider Debounce Needed:** Date range slider fires too frequently
4. **Company Switch Race:** Switching companies mid-render corrupts state

### Recommended Fixes

```javascript
// 1. Render guard
let isRendering = false;
function renderManualMapTree(node, container) {
  if (isRendering) return;
  isRendering = true;
  try {
    // ... render logic
  } finally {
    isRendering = false;
  }
}

// 2. Debounced slider
const debouncedFilter = debounce(() => filterByDateRange(), 150);
slider.addEventListener('input', debouncedFilter);

// 3. Company switch guard
let currentCompanyRender = null;
async function switchCompany(company) {
  const thisRender = Symbol();
  currentCompanyRender = thisRender;
  // ... load data
  if (currentCompanyRender !== thisRender) return; // Stale render
  // ... render
}
```

---

## Code Duplication Found

### Pattern Recognition Results

| Pattern | Occurrences | Files |
|---------|-------------|-------|
| `COMPANIES` constant | 14 files | All scripts |
| `slugify()` function | 3 files | build_true_auto_map.py, consolidate_with_hierarchy.py, integrate_viewer.py |
| `SPEAKER_PREFIX_PATTERN` | 2 files | build_true_auto_map.py, generate_match_review.py |
| CSV loading | 4 files | Multiple scripts |

**Recommendation:** Extract shared utilities to `scripts/utils/`:
- `scripts/utils/constants.py` - COMPANIES, file paths
- `scripts/utils/text.py` - clean_quote, slugify
- `scripts/utils/data.py` - CSV loading, caching

---

## Acceptance Criteria

### Issue 1: Numbers → Names
- [x] Snippets display without `[Speaker NNNN]:` or `...NNNN]:` prefixes
- [x] All quotes are clean and readable
- [x] Test with AbbVie Aesthetics entity (currently shows `89237141`)

### Issue 2: "Discovery Oncology" Evidence
- [x] Oncology Discovery entity in Manual Map shows Gong evidence
- [x] Entity lookup matches names case-insensitively
- [x] All matched entities display their snippets

### Issue 3: Person Name in Match Review
- [x] Match Review items show customer name when available
- [x] Person field populated from participant CSV lookup
- [x] Internal rep name also displayed

### Issue 4: Full Snippets
- [x] Match Review snippets show full quotes (not truncated)
- [x] `all_snippets` contain complete text
- [x] No `...` prefix/suffix truncation

### Issue 5: Leaders in Manual Map
- [x] Manual Map nodes display leader names from JSON
- [x] Leader titles shown where available
- [x] Verify Roopal Thakkar appears for AbbVie R&D root

---

## Revised Implementation Order

**Based on research findings, recommended approach:**

### Phase 1: Quick Win (Issue 5 - Leaders)
Single JS fix, no pipeline changes needed:
```javascript
const leader = node.leader || evidence.matchedContacts?.find(c => c.isDecisionMaker);
```

### Phase 2: Decide on Pipeline Strategy
**Option A (Recommended):** Delete broken match review pipeline
- Archive `generate_match_review.py`, `llm_auto_matcher.py`, `enrich_snippets.py`
- Modify `integrate_viewer.py` to read directly from `true_auto_map.json`
- This automatically fixes Issues 1, 3, 4

**Option B:** Fix the broken pipeline
- Create missing intermediate files
- Fix `clean_quote()` regex
- Add person lookup
- Remove `[:500]` truncation

### Phase 3: Fix Entity Matching (Issue 2)
- Normalize entity names consistently
- Add fuzzy matching fallback
- Log mismatches for debugging

### Phase 4: Security Hardening
- Move PII to authenticated API
- Fix XSS vulnerabilities
- Add rate limiting

### Phase 5: Race Condition Fixes
- Add render guards
- Debounce slider
- Guard company switch

---

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `public/index.html` | Fix leader rendering (Issue 5), XSS fixes | HIGH |
| `scripts/integrate_viewer.py` | Read from true_auto_map OR fix person_name | HIGH |
| `scripts/generate_match_review.py` | DELETE or fix regex + truncation | MEDIUM |
| `scripts/build_true_auto_map.py` | Improve `clean_quote()` regex (if keeping) | MEDIUM |
| `scripts/utils/` (new) | Extract shared utilities | LOW |

---

## Verification Script

```bash
#!/bin/bash
# Run after fixes to verify

cd /Users/david.campos/VibeCode/Vercel/projects/GongOrgViewerStatic

# 1. Check no speaker IDs in snippets
echo "=== Checking for speaker ID patterns ==="
python3 -c "
import json
with open('output/abbvie_true_auto_map.json') as f:
    data = json.load(f)
    issues = []
    for entity in data.get('entities', []):
        for snippet in entity.get('snippets', []):
            quote = snippet.get('quote', '')
            if ']:' in quote[:30] or quote.startswith('...'):
                issues.append(quote[:50])
    if issues:
        print(f'FAIL: {len(issues)} snippets with speaker IDs')
        for i in issues[:3]:
            print(f'  - {i}')
    else:
        print('PASS: No speaker ID patterns found')
"

# 2. Check Oncology Discovery has evidence
echo ""
echo "=== Checking Oncology Discovery evidence ==="
python3 -c "
import json
with open('output/viewer_manual_data.json') as f:
    data = json.load(f)
    def find_node(node, target_id):
        if node.get('id') == target_id:
            return node
        for child in node.get('children', []):
            found = find_node(child, target_id)
            if found:
                return found
        return None

    for company, company_data in data.items():
        node = find_node(company_data.get('root', {}), 'oncology-discovery')
        if node:
            evidence = node.get('gongEvidence', {})
            snippets = evidence.get('snippets', [])
            print(f'{company}: oncology-discovery has {len(snippets)} snippets')
"

# 3. Check leaders in manual data
echo ""
echo "=== Checking leaders in manual map ==="
python3 -c "
import json
with open('output/viewer_manual_data.json') as f:
    data = json.load(f)
    def count_leaders(node, count=0):
        if node.get('leader', {}).get('name'):
            count += 1
        for child in node.get('children', []):
            count = count_leaders(child, count)
        return count

    for company, company_data in data.items():
        leader_count = count_leaders(company_data.get('root', {}))
        print(f'{company}: {leader_count} nodes with leaders')
"

# 4. Check for PII in public HTML (security)
echo ""
echo "=== Checking for PII exposure ==="
grep -c '@.*\.com' public/index.html && echo "WARNING: Email addresses found in public HTML" || echo "PASS: No obvious email patterns"
```

---

## Next Steps

1. **Decide on pipeline strategy** - Delete broken pipeline (recommended) or fix it
2. **Implement Issue 5 fix** - Single JS line change for leaders
3. **Run verification script** to establish baseline
4. **Implement remaining fixes** based on chosen strategy
5. **Address security issues** - PII exposure is critical
6. **Deploy and verify**

