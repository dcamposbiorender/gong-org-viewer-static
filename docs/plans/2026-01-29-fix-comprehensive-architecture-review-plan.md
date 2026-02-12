# Comprehensive Architecture Review Fix Plan

**Date:** 2026-01-29
**Type:** fix
**Status:** Draft
**Reviews:** data-integrity-guardian, architecture-strategist, pattern-recognition-specialist, performance-oracle, security-sentinel

---

## Executive Summary

Five parallel review agents analyzed the GongOrgViewerStatic codebase after a full data pipeline re-run. This plan consolidates **47 findings** into prioritized fix waves to prevent bugs before they manifest.

| Severity | Count | Examples |
|----------|-------|----------|
| **CRITICAL** | 6 | Silent data loss, no auth, race conditions |
| **HIGH** | 11 | Dual schema problem, orphan nodes, input validation |
| **MEDIUM** | 18 | Code duplication, performance bottlenecks |
| **LOW** | 12 | Missing docs, unbounded backups |

---

## Wave 1: CRITICAL Data Integrity (Fix Immediately)

### P0-1: Silent Source Dropping During Deduplication
**File:** `scripts/consolidate_with_hierarchy.py:489-495`

**Bug:** Sources with `call_id=None` are silently discarded:
```python
if call_id and call_id not in seen_calls:  # Sources with None dropped!
```

**Fix:**
```python
# scripts/consolidate_with_hierarchy.py:489-495
if call_id:
    if call_id not in seen_calls:
        seen_calls.add(call_id)
        unique_sources.append(src)
else:
    # Preserve sources without call_id (they may have valuable quotes)
    unique_sources.append(src)
```

- [ ] Fix null call_id handling in dedup loop
- [ ] Add warning log when source has no call_id
- [ ] Add test: `test_sources_without_call_id_preserved.py`

---

### P0-2: Team Size Not Linked to Source Snippet (Known Bug)
**File:** `scripts/build_true_auto_map.py:198-200`

**Bug:** `sizeMentions` always empty - users see "no source" warning:
```python
"sizeMentions": [],  # Always empty - no linkage!
```

**Fix:** Link team_size extraction to the snippet where it was found.

```python
# scripts/build_true_auto_map.py - in build_snippets()
def build_snippets(sources, entity_team_size=None):
    snippets = []
    for i, src in enumerate(sources):
        quote = src.get("raw_quote", "")
        size_mentions = []

        # Check if this quote contains the team size
        if entity_team_size and entity_team_size in quote:
            size_mentions.append({
                "value": entity_team_size,
                "snippetIndex": i,
                "source": {
                    "callDate": src.get("call_date"),
                    "customerName": src.get("customer_name", "")
                }
            })

        snippet = {
            "quote": quote,
            # ... other fields
            "sizeMentions": size_mentions
        }
        snippets.append(snippet)
    return snippets
```

- [ ] Add size pattern matching to `build_snippets()`
- [ ] Populate `sizeMentions` when quote contains size
- [ ] Add test: `test_size_mentions_linked_to_snippets.py`

---

### P0-3: Transcript Truncation Without Tracking
**File:** `scripts/extract_all_batch_api.py:78`

**Bug:** Transcripts silently truncated to 15,000 chars with no metadata:
```python
"transcript": transcript[:15000],  # Silent truncation
```

**Fix:**
```python
# scripts/extract_all_batch_api.py:78
truncated = len(transcript) > 15000
all_calls.append({
    "company": company,
    "call_id": call_id,
    "call_date": call_date,
    "transcript": transcript[:15000],
    "truncated": truncated,
    "original_length": len(transcript) if truncated else None,
})
```

- [ ] Add `truncated` and `original_length` fields
- [ ] Pass through to extraction output
- [ ] Add warning in viewer for truncated calls

---

## Wave 2: HIGH - Structural Issues

### P1-1: Dual Extraction Schema Without Adapter
**Files:** `scripts/consolidate_with_hierarchy.py:100-133`

**Problem:** Two incompatible formats handled with scattered null coalescing:
- Format A: `entity_name`, `entity_type`
- Format B: `value`, `type`

**Fix:** Create explicit adapter at pipeline entry.

```python
# scripts/adapters.py (NEW FILE)
def normalize_extraction(raw: dict) -> dict:
    """Normalize extraction to canonical schema."""
    source = raw.get("source", {})
    return {
        "entity_name": raw.get("entity_name") or raw.get("value", ""),
        "entity_type": raw.get("entity_type") or raw.get("type", "team"),
        "speaker_id": raw.get("speaker_id") or source.get("speaker_id"),
        "raw_quote": raw.get("raw_quote") or source.get("raw_quote", ""),
        "call_id": raw.get("call_id") or source.get("call_id"),
        "call_date": raw.get("call_date") or source.get("call_date"),
        "leader": raw.get("leader"),
        "leader_title": raw.get("leader_title"),
        "confidence": raw.get("confidence", "medium"),
    }
```

- [x] Create `scripts/adapters.py` with `normalize_extraction()`
- [x] Update `consolidate_with_hierarchy.py` to use adapter
- [ ] Add test: `test_adapter_handles_both_formats.py`

---

### P1-2: No Validation Between Pipeline Stages
**Files:** All pipeline scripts

**Problem:** No schema validation - corrupt data propagates silently.

**Fix:** Add Pydantic/JSON Schema validation at stage boundaries.

```python
# scripts/schemas.py (NEW FILE)
from pydantic import BaseModel
from typing import Optional, List

class Source(BaseModel):
    call_id: Optional[str]
    call_date: Optional[str]
    raw_quote: str
    speaker_id: Optional[str]

class ExtractedEntity(BaseModel):
    entity_name: str
    entity_type: str
    leader: Optional[str]
    leader_title: Optional[str]
    source: Source

class ConsolidatedEntity(BaseModel):
    id: str
    entity_name: str
    entity_type: str
    parent_entity: Optional[str]
    all_sources: List[Source]
```

- [ ] Create `scripts/schemas.py` with Pydantic models
- [ ] Add validation at load points in each script
- [ ] Fail fast with clear error messages

---

### P1-3: Orphan Nodes Silently Become Roots
**File:** `scripts/build_true_auto_map.py:216-220`

**Problem:** Entities with invalid `parent_entity` become roots without warning.

**Fix:**
```python
# scripts/build_true_auto_map.py:216-220
orphan_warnings = []
for entity_id, entity in entity_map.items():
    parent_id = entity.get("parent_entity")
    if parent_id and parent_id not in entity_map:
        orphan_warnings.append(f"{entity_id} references missing parent {parent_id}")
        roots.append((entity_id, entity))
    elif not parent_id:
        roots.append((entity_id, entity))

if orphan_warnings:
    print(f"  WARNING: {len(orphan_warnings)} orphan nodes found:")
    for w in orphan_warnings[:5]:
        print(f"    - {w}")
```

- [ ] Add orphan detection with warnings
- [ ] Track orphans in output metadata
- [ ] Add test: `test_orphan_detection.py`

---

### P1-4: First-Non-Null-Wins Creates Non-Determinism
**File:** `scripts/consolidate_with_hierarchy.py:139-142`

**Problem:** Leader/team_size use first non-null from merged entities - order dependent.

**Fix:** Use most recent source or highest confidence instead.

```python
# scripts/consolidate_with_hierarchy.py - in aggregation
# Track leader with source date for recency
if e.get("leader"):
    leader_date = e.get("call_date") or source.get("call_date", "")
    if not agg["leader"] or leader_date > agg.get("leader_date", ""):
        agg["leader"] = e.get("leader")
        agg["leader_title"] = e.get("leader_title")
        agg["leader_date"] = leader_date
```

- [ ] Add `leader_date` tracking
- [ ] Use most recent leader, not first
- [ ] Document tie-breaking strategy

---

## Wave 3: MEDIUM - Code Quality

### P2-1: COMPANIES List Duplicated in 14 Files
**Files:** See pattern analysis

**Fix:** Centralize configuration.

```python
# scripts/config.py (NEW FILE)
COMPANIES = ["abbvie", "astrazeneca", "gsk", "lilly", "novartis", "regeneron", "roche"]

COMPANY_DISPLAY_NAMES = {
    "abbvie": "AbbVie",
    "astrazeneca": "AstraZeneca",
    # ...
}

MODEL = "claude-sonnet-4-20250514"

# Import in all scripts:
# from config import COMPANIES, MODEL
```

- [ ] Create `scripts/config.py`
- [ ] Update all 14 files to import from config
- [ ] Add test that validates COMPANIES matches directory structure

---

### P2-2: Utility Functions Duplicated
**Files:** Multiple (see pattern analysis)

**Duplicated Functions:**
- `slugify()` - 2 files
- `normalize_entity_name()` - 4 files
- `is_valid_entity_name()` - 3 files
- `deduplicate*()` - 5 implementations

**Fix:**
```python
# scripts/utils.py (NEW FILE)
import re

def slugify(name: str) -> str:
    """Convert entity name to URL-safe id (kebab-case)."""
    if not name:
        return ""
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")

def normalize_entity_name(name: str) -> str:
    """Normalize entity name for comparison."""
    return re.sub(r'\s+', ' ', name.lower().strip())

def is_valid_entity_name(name: str) -> bool:
    """Check if entity name is valid (not garbage)."""
    if not name or len(name) < 2:
        return False
    if name.lower() in ['the', 'a', 'an', 'team', 'group']:
        return False
    return True
```

- [ ] Create `scripts/utils.py`
- [ ] Update all files to import shared utilities
- [ ] Remove duplicated implementations

---

### P2-3: Hardcoded File Paths
**Files:** `extract_roche_with_claude.py:19`, `build_true_auto_map.py:27`

**Fix:**
```python
# scripts/config.py
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
EXTRACTOR_PROMPT = BASE_DIR / "batches" / "extractor_prompt_v5.md"
PARTICIPANTS_CSV = Path(os.environ.get(
    "PARTICIPANTS_CSV",
    str(BASE_DIR.parent.parent / "Gong" / "gong_call_participants_export_2025-12-19T1539.csv")
))
```

- [ ] Add paths to `config.py`
- [ ] Support environment variable overrides
- [ ] Update scripts to use config paths

---

## Wave 4: MEDIUM - Performance

### P3-1: CSV File Re-Read 14 Times Per Run
**File:** `scripts/build_true_auto_map.py:54-85, 292-293`

**Problem:** 32,731 rows × 2 reads × 7 companies = 458,234 iterations

**Fix:** Load once, pass to all companies.
```python
# scripts/build_true_auto_map.py
def load_all_participant_data():
    """Load CSV once for both lookups."""
    conv_lookup, participant_lookup = {}, {}
    with open(PARTICIPANTS_CSV) as f:
        for row in csv.DictReader(f):
            conv_key = row.get("conversation_key", "")
            if conv_key:
                short = conv_key[:12]
                conv_lookup[short] = conv_key
                participant_lookup[short] = {
                    "customer_names": row.get("customer_names", ""),
                    "internal_names": row.get("biorender_rep_names", ""),
                }
    return conv_lookup, participant_lookup

# In main():
conv_lookup, participant_lookup = load_all_participant_data()  # Once
for company in companies:
    build_map(company, conv_lookup, participant_lookup)  # Pass through
```

- [ ] Merge two CSV load functions
- [ ] Load once at start
- [ ] Pass lookups as parameters

---

### P3-2: Pre-compile Regex Patterns
**File:** `scripts/consolidate_with_hierarchy.py:47-55`

**Problem:** 6 patterns × 1,531 quotes = 9,186 regex compilations

**Fix:**
```python
# Pre-compile at module level
TEAM_SIZE_PATTERNS = [
    re.compile(r'(?:about|around|...)?\s*(\d{1,4}(?:,\d{3})*)\s*(?:people|...)', re.IGNORECASE),
    # ...
]

def extract_team_size_from_text(text: str) -> str | None:
    for pattern in TEAM_SIZE_PATTERNS:
        match = pattern.search(text)  # Pre-compiled
```

- [ ] Pre-compile all regex patterns
- [ ] Update functions to use compiled patterns

---

### P3-3: Reduce LLM Rate Limit Delay
**File:** `scripts/consolidate_with_hierarchy.py:33`

**Current:** 1.0s delay × 38 batches = 38 seconds of sleep

**Fix:** Reduce to 0.2s or use batch API like extraction.

- [ ] Reduce `RATE_LIMIT_DELAY` to 0.2
- [ ] Consider using batch API for consolidation

---

## Wave 5: LOW - API Security (Internal Tool Acceptable Risk)

> **Note:** These findings are from security-sentinel. Since this is an internal tool without sensitive customer data exposure, these are documented but lower priority.

### P4-1: Add Account Whitelist Validation
**Files:** `api/*.ts`

```typescript
const VALID_ACCOUNTS = ['gsk', 'abbvie', 'novartis', 'roche', 'lilly', 'regeneron', 'astrazeneca'];
if (!VALID_ACCOUNTS.includes(account)) {
  return res.status(400).json({ error: 'Invalid account' });
}
```

- [x] Add account validation to all endpoints (created api/_lib/validation.ts, updated 7 API files)
- [ ] Consider authentication if deployed externally

---

## Implementation Checklist

### Wave 1 (Critical) - Do First
- [x] P0-1: Fix null call_id source dropping (consolidate_with_hierarchy.py:489-504)
- [x] P0-2: Link sizeMentions to snippets (build_true_auto_map.py - extract_size_from_quote)
- [x] P0-3: Track transcript truncation (extract_all_batch_api.py:74-82)

### Wave 2 (High) - This Week
- [x] P1-1: Create `scripts/adapters.py` with normalize_extraction()
- [ ] P1-2: Create `scripts/schemas.py` (Pydantic validation - deferred)
- [x] P1-3: Add orphan node warnings (build_true_auto_map.py)
- [x] P1-4: Fix leader selection determinism (consolidate_with_hierarchy.py:515-533)

### Wave 3 (Medium) - Next Week
- [x] P2-1: Create `scripts/config.py` with centralized COMPANIES, paths, MODEL
- [x] P2-2: Create `scripts/utils.py` with slugify, normalize, deduplicate utilities
- [x] P2-3: Move hardcoded paths to config (config.py imports added)

### Wave 4 (Performance) - When Time Permits
- [x] P3-1: Consolidate CSV loading (build_true_auto_map.py:load_all_participant_data)
- [x] P3-2: Pre-compile regex in consolidate_with_hierarchy.py
- [x] P3-3: Use centralized RATE_LIMIT_DELAY from config.py (0.2s vs 1.0s)

### Wave 5 (Security) - If Deploying Externally
- [x] P4-1: Add account validation (api/_lib/validation.ts + 7 API files updated)

---

## Verification

After implementing fixes, run:

```bash
# Run test suite
python3 -m pytest tests/ -v

# Re-run pipeline on one company
python3 scripts/consolidate_with_hierarchy.py --company roche
python3 scripts/build_true_auto_map.py --company roche

# Verify no data loss
python3 << 'EOF'
import json
data = json.load(open('output/roche_true_auto_map.json'))
def check(node, depth=0):
    issues = []
    if node.get('size') and not any(s.get('sizeMentions') for s in node.get('snippets', [])):
        issues.append(f"{node['name']}: size but no sizeMentions")
    for child in node.get('children', []):
        issues.extend(check(child, depth+1))
    return issues
issues = check(data['root'])
print(f"Issues found: {len(issues)}")
for i in issues[:5]:
    print(f"  - {i}")
EOF
```

---

## References

- Data Integrity Review: agent a0a2cad
- Architecture Review: agent a5a060f
- Pattern Analysis: agent a6b83f6
- Performance Review: agent a373f65
- Security Review: agent ae07320
