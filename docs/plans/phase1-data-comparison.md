# Phase 1.2: Data Comparison - AbbVie Pipeline Stages

Generated: 2026-01-29

## Summary of Findings

| Stage | speaker_id | team_size | leader | snippets |
|-------|------------|-----------|--------|----------|
| 1. Source Batch | ✅ Has names in `participants` | N/A | N/A | N/A |
| 2. Extraction | ❌ NOT CAPTURED | ❌ Not in schema | ❌ Not in schema | ✅ `raw_quote` |
| 3. Consolidated | ❌ null | ✅ Extracted from quotes | ❌ Missing | ✅ `all_sources` |
| 4. True Auto Map | ❌ Missing | ✅ `sizeMentions` | ❌ Missing | ✅ `snippets` array |
| 5. Enriched Output | ❌ null | ❌ Not included | ❌ Missing | ✅ Has snippets |

---

## Stage 1: Source Batch (`batches_enriched/abbvie/batch_000.json`)

**What's available:**
```json
{
  "call_id": "2025-12-11_bb7ad7d9fee4",
  "participants": {
    "customer_names": "Stone Shi",
    "biorender_names": "Michael Long; Michelle Jang",
    "customer_emails": "...",
    "biorender_emails": "..."
  },
  "transcript_text": "[Speaker 7092682458871298329]: hi stone.\n[Speaker 773370772777253046]: Thanks..."
}
```

**Key insight:**
- Participant names ARE available: `customer_names`, `biorender_names`
- Transcript has numeric speaker IDs: `[Speaker 7092682458871298329]`
- BUT no mapping from numeric ID → name exists

---

## Stage 2: Raw Extraction (`extractions/abbvie/entities_llm_v2.json`)

**Actual structure:**
```json
{
  "entity_type": "department",
  "entity_name": "research",
  "raw_quote": "...abbvie it research, it subsidizes it...",
  "call_ids": ["2023-11-21_1b065e3127c2", ...],
  "mention_count": 265,
  "confidence": "medium"
}
```

**Critical finding:**
- `speaker_id`: ❌ NOT IN SCHEMA - 0 of 102 entities have it
- `team_size`: ❌ NOT IN SCHEMA
- `leader`: ❌ NOT IN SCHEMA
- The extraction prompt v4 doesn't ask for these fields!

---

## Stage 3: Consolidated (`output/abbvie/consolidated_with_hierarchy.json`)

**Structure:**
```json
{
  "id": "research",
  "entity_name": "Research",
  "entity_type": "department",
  "team_size": null,
  "mention_count": 3,
  "all_sources": [
    {
      "call_id": "2023-11-21_1b065e3127c2",
      "raw_quote": "...abbvie it research, it subsidizes it...",
      "speaker_id": null,
      "confidence": "medium"
    }
  ]
}
```

**Note:** `speaker_id: null` - it tries to preserve it but extraction never captured it.

---

## Stage 4: True Auto Map (`output/abbvie_true_auto_map.json`)

**Structure:**
```json
{
  "root": {
    "name": "AbbVie R&D",
    "children": [
      {
        "name": "Medical Affairs",
        "type": "department",
        "size": null,
        "snippets": [...],
        "sizeMentions": [...],
        "children": [...]
      }
    ]
  }
}
```

**Note:** Uses nested tree structure, not flat `nodes` array. Has `snippets` but no `gong_evidence`.

---

## Stage 5: Enriched Match Review (`output/abbvie_enriched_match_review_data.json`)

**Structure:**
```json
{
  "gong_entity": "Research & Development",
  "snippet": "...we are the in vivo antibody discovery group...",
  "call_id": "2024-10-25_39eeff6ff150",
  "gong_url": "https://app.gong.io/call?id=39eeff6ff150",
  "all_snippets": [
    {
      "gong_entity": "Research & Development",
      "quote": "...",
      "call_id": "...",
      "gong_url": "..."
    }
  ]
}
```

**Note:** NO speaker_id field at all in final output!

---

## Root Cause Analysis

### Why speaker_id is missing

1. **Extraction prompt v4** does NOT include `speaker_id` in schema
2. **extract_entities.py** doesn't add speaker_id post-extraction
3. **consolidate_with_hierarchy.py** tries to preserve `speaker_id` but it's already null
4. **enrich_snippets.py** passes null through to `speakerId`
5. **Viewer** receives null and displays nothing (or raw ID if present)

### Why team_size is "no source"

1. **Extraction prompt v4** DOES include `team_size` in schema
2. **BUT** the current `entities_llm_v2.json` doesn't have team_size in entity records
3. **consolidate_with_hierarchy.py** (lines 131-133) extracts team_size from quote text via regex
4. **BUT** this extracted team_size is not linked back to the source snippet
5. **Viewer** shows size but can't link to evidence

### Why leaders are missing

1. **Extraction prompt v4** has `is_decision_maker` for contacts but no `leader` field for entities
2. **No pipeline step** extracts "X leads the Y team" patterns
3. **integrate_viewer.py** has `build_leader_lookup()` but only reads from manual map
4. **Auto map** never gets leader data populated

---

## What Needs to Change

### 1. Extraction Prompt v5 (new schema)
```json
{
  "source": {
    "call_id": "string",
    "call_date": "YYYY-MM-DD",
    "raw_quote": "exact quote",
    "speaker_id": "numeric ID from transcript [Speaker XXXXX]",
    "speaker_context": "customer|biorender|unknown"
  },
  "leader": "person name if mentioned as leading this entity"
}
```

### 2. Speaker ID Resolution Service
- Build lookup from `batches_enriched/*/participants`
- Map numeric ID → participant name using transcript context
- Apply during enrichment phase

### 3. Team Size Linking
- When team_size extracted from quote, store the quote reference
- In enriched output: `team_size: { value: 10, source_snippet: {...} }`

### 4. Leader Extraction Pattern
- Add pattern to extraction: "X leads/manages/runs Y"
- Store leader reference with entity
- Merge with manual map leaders in integration

---

# Phase 2: Pipeline Code Trace

Generated: 2026-01-29

## Script-by-Script Analysis

### 1. Extraction Scripts (INCONSISTENT)

**Different scripts for different companies:**

| Script | Companies | speaker_id | Schema |
|--------|-----------|------------|--------|
| `extract_gsk_az_novartis.py` | GSK, AZ, Novartis | ✅ Captured | `type`, `value`, `speaker_id` |
| `extract_entities.py` | Others | ❌ Not captured | `entity_type`, `entity_name` |
| Unknown LLM extractor | AbbVie | ❌ Not captured | `entity_type`, `entity_name`, `call_ids` |

**Evidence:**
- GSK: 622/622 entities have speaker_id
- AbbVie: 0/102 entities have speaker_id

### 2. Consolidation (`consolidate_with_hierarchy.py`)

**Handles both schemas** (lines 99-128):
- Gets `entity_name` OR `value`
- Gets `entity_type` OR `type`
- Gets `call_ids` OR `call_id`
- Passes `speaker_id` through (line 128)

**Extracts team_size from quotes** (lines 131-133):
```python
if not agg["team_size"] and raw_quote:
    agg["team_size"] = extract_team_size_from_text(raw_quote)
```

**Problem:** Team size extracted but NOT linked back to source snippet.

### 3. Auto Map Build (`build_true_auto_map.py`)

**DROPS speaker_id entirely!**

Snippet format (lines 148-158):
```python
snippet = {
    "quote": src.get("raw_quote", ""),
    "date": call_date,
    "callId": call_id,
    "gongUrl": get_gong_url(call_id, conv_lookup),
    "customerName": participants.get("customer_names"),  # From CSV lookup
    "internalName": participants.get("internal_names"),  # From CSV lookup
    "sizeMentions": []
    # NO speakerId field!
}
```

**Uses participant CSV** (lines 68-84) to get names per CALL, not per SPEAKER.

### 4. Viewer Integration (`integrate_viewer.py`)

**Final snippet format** (lines 247-257):
```python
viewer_snippet = {
    "quote": snippet.get("quote", ""),
    "date": snippet.get("date"),
    "gongUrl": snippet.get("gongUrl"),
    "callId": snippet.get("callId"),
    "customerName": snippet.get("customerName"),
    "internalName": snippet.get("internalName"),
    # NO speakerId!
}
```

**Leader handling** (lines 189-227):
- `build_leader_lookup()` gets leaders from MANUAL map only
- Auto map nodes get leader merged from manual map
- No extraction-based leader data exists

---

## Data Flow Summary

```
SPEAKER_ID FLOW:
extract_gsk_az_novartis.py → speaker_id captured
                    ↓
consolidate_with_hierarchy.py → speaker_id passed through
                    ↓
build_true_auto_map.py → speaker_id DROPPED ← BUG!
                    ↓
integrate_viewer.py → no speaker_id available
                    ↓
VIEWER: Cannot show who said the quote

TEAM_SIZE FLOW:
consolidate_with_hierarchy.py → team_size extracted from quote text
                    ↓
build_true_auto_map.py → team_size in node.size ← OK
                    ↓
integrate_viewer.py → size field preserved ← OK
                    ↓
VIEWER: Shows size but NO link to source snippet ← BUG!

LEADER FLOW:
extraction → NO leader captured ← BUG!
                    ↓
manual_map → has leader data
                    ↓
integrate_viewer.py → merges manual leader to auto nodes
                    ↓
VIEWER: Auto mode shows manual map leaders (but shouldn't rely on this)
```

---

## Confirmed Root Causes

| Issue | Root Cause | Fix Location |
|-------|------------|--------------|
| **Speaker ID as numbers** | `build_true_auto_map.py` doesn't include speaker_id in snippet output | `build_true_auto_map.py` lines 148-158 |
| **No leaders in Auto mode** | Extraction scripts don't capture "X leads Y" patterns | Extraction prompt + consolidation |
| **Team size "no source"** | team_size extracted but not linked to source snippet | Need to preserve snippet reference when extracting size |
| **Inconsistent extraction** | Different scripts for different companies | Standardize on one extraction approach |
