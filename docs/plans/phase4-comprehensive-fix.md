# Phase 4: Comprehensive Fix Design

## Objective

Fix all 3 pipeline bugs with minimal changes, reusing existing infrastructure.

## Current State

### What Works
- `batches_enriched/{company}/` - Source data with participants ready
- `extract_roche_with_claude.py` - LLM extraction template (uses prompt v4)
- `consolidate_with_hierarchy.py` - Handles both extraction formats
- `build_true_auto_map.py` - Builds tree, resolves speaker names from CSV
- `integrate_viewer.py` - Transforms snake_case → camelCase

### What's Broken
| Bug | Current State | Fix Required |
|-----|--------------|--------------|
| Speaker ID | Extraction captures it, but `build_true_auto_map.py` drops it | Add `speakerId` to snippet output |
| Leaders | Prompt v4 doesn't ask for entity leaders | Update prompt v5 + re-extract |
| Size "no source" | Size extracted but not linked to snippet | Link size to snippetIndex |

---

## Fix Tasks (Parallelizable)

### Task 1: Update Extraction Prompt (v5)
**File**: `batches/extractor_prompt_v5.md`

Add to entity schema:
```json
{
  "entity_name": "Discovery Sciences",
  "entity_type": "department",
  "leader": "Monica Chen",           // NEW: Person who leads/manages this entity
  "leader_title": "Director",        // NEW: Leader's title if mentioned
  "team_size": "50",                 // Already exists but often empty
  "source": {
    "call_id": "2024-01-15_abc123",
    "call_date": "2024-01-15",
    "raw_quote": "Monica leads the Discovery Sciences team of about 50 people",
    "speaker_id": "7092682458871298329"  // NEW: Numeric ID from [Speaker X]
  }
}
```

Add extraction guidance:
```
## Leader Extraction
When someone says "X leads/manages/runs/heads the Y team", extract:
- entity_name: Y
- leader: X (the person's name)
- leader_title: their title if mentioned

## Speaker ID Capture
Always include the speaker_id from the transcript format [Speaker NNNNNN].
This is the numeric ID that appears before each speech turn.
```

**Owner**: Can be done independently
**Time**: 30 min

---

### Task 2: Create Unified Extraction Script
**File**: `scripts/extract_all_companies.py`

Based on `extract_roche_with_claude.py`, but:
1. Takes `--company` argument
2. Reads from `batches_enriched/{company}/` (has participants)
3. Uses prompt v5
4. Outputs speaker_id in extraction
5. Captures leader field

Key changes from existing script:
```python
# Line ~100: Include speaker_id in output
result = {
    "call_id": call_id,
    "call_date": call_date,
    "speaker_id": extract_speaker_id(line),  # NEW
    "entities": [...],
    "contacts": [...]
}
```

**Dependencies**: Task 1 (prompt v5)
**Time**: 1 hr

---

### Task 3: Update `consolidate_with_hierarchy.py`
**File**: `scripts/consolidate_with_hierarchy.py`

Changes needed:
1. Preserve `leader` and `leader_title` from extraction
2. When extracting team_size from quote, store `size_snippet_index`

```python
# Around line 130
if not agg["team_size"] and raw_quote:
    size = extract_team_size_from_text(raw_quote)
    if size:
        agg["team_size"] = size
        agg["size_source_index"] = len(agg["sources"]) - 1  # NEW: link to snippet

# Around line 140
agg["leader"] = e.get("leader")  # NEW: preserve leader
agg["leader_title"] = e.get("leader_title")  # NEW
```

**Dependencies**: None (can do now)
**Time**: 30 min

---

### Task 4: Update `build_true_auto_map.py`
**File**: `scripts/build_true_auto_map.py`

Changes needed (lines 148-158):
```python
snippet = {
    "quote": src.get("raw_quote", ""),
    "date": call_date,
    "callId": call_id,
    "gongUrl": get_gong_url(call_id, conv_lookup),
    "speakerId": src.get("speaker_id"),  # NEW: pass through
    "customerName": participants.get("customer_names"),
    "internalName": participants.get("internal_names"),
    "sizeMentions": []
}
```

Also add leader to node:
```python
node = {
    "id": entity_id,
    "name": entity.get("entity_name", entity_id),
    "type": entity.get("entity_type", "team"),
    "leader": {  # NEW
        "name": entity.get("leader"),
        "title": entity.get("leader_title")
    } if entity.get("leader") else None,
    ...
}
```

And link size to snippet:
```python
"sizeMentions": [{
    "value": entity.get("team_size"),
    "snippetIndex": entity.get("size_source_index", 0),
    "source": {...}
}] if entity.get("team_size") else []
```

**Dependencies**: Task 3
**Time**: 45 min

---

### Task 5: Re-run Extraction for All Companies
**Command**:
```bash
for co in abbvie astrazeneca gsk lilly novartis regeneron roche; do
    python3 scripts/extract_all_companies.py --company $co
done
```

**Dependencies**: Tasks 1, 2
**Time**: 2-3 hrs (API rate limits)
**Parallelization**: Can run 2-3 companies in parallel with separate terminals

---

### Task 6: Re-run Pipeline
**Commands**:
```bash
for co in abbvie astrazeneca gsk lilly novartis regeneron roche; do
    python3 scripts/consolidate_with_hierarchy.py --company $co
    python3 scripts/build_true_auto_map.py --company $co
done
python3 scripts/integrate_viewer.py --update
```

**Dependencies**: Tasks 3, 4, 5
**Time**: 30 min

---

### Task 7: Verify Outputs
**Verification script**:
```python
# Check all 3 bugs are fixed
for company in companies:
    data = load_true_auto_map(company)

    # Bug 1: Speaker ID present
    snippets = get_all_snippets(data)
    with_speaker = [s for s in snippets if s.get("speakerId")]
    assert len(with_speaker) > 0, f"{company}: No speaker IDs"

    # Bug 2: Leaders present
    nodes = get_all_nodes(data)
    with_leader = [n for n in nodes if n.get("leader")]
    print(f"{company}: {len(with_leader)} nodes with leaders")

    # Bug 3: Size has source
    with_size = [n for n in nodes if n.get("sizeMentions")]
    for n in with_size:
        assert n["sizeMentions"][0].get("snippetIndex") is not None
```

**Dependencies**: Task 6
**Time**: 15 min

---

## Execution Plan for Subagents

### Wave 1 (Parallel - No Dependencies)
| Agent | Task | Time |
|-------|------|------|
| Agent A | Task 1: Create prompt v5 | 30 min |
| Agent B | Task 3: Update consolidation script | 30 min |

### Wave 2 (After Wave 1)
| Agent | Task | Dependencies | Time |
|-------|------|--------------|------|
| Agent C | Task 2: Create unified extraction script | Task 1 | 1 hr |
| Agent D | Task 4: Update build_true_auto_map.py | Task 3 | 45 min |

### Wave 3 (After Wave 2)
| Agent | Task | Time |
|-------|------|------|
| Agent E | Task 5: Extract abbvie, gsk, lilly | 1.5 hr |
| Agent F | Task 5: Extract astrazeneca, novartis | 1.5 hr |
| Agent G | Task 5: Extract regeneron, roche | 1.5 hr |

### Wave 4 (After Wave 3)
| Agent | Task | Time |
|-------|------|------|
| Main | Task 6: Re-run pipeline | 30 min |
| Main | Task 7: Verify outputs | 15 min |

---

## File Checklist

### Files to Create
- [ ] `batches/extractor_prompt_v5.md`
- [ ] `scripts/extract_all_companies.py`
- [ ] `scripts/verify_fix.py`

### Files to Modify
- [ ] `scripts/consolidate_with_hierarchy.py` (~10 lines)
- [ ] `scripts/build_true_auto_map.py` (~15 lines)

### Files to Regenerate
- [ ] `extractions/{company}/entities_llm_v2.json` (all 7)
- [ ] `output/{company}/consolidated_with_hierarchy.json` (all 7)
- [ ] `output/{company}_true_auto_map.json` (all 7)
- [ ] `public/index.html`

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| API rate limits | Run extractions in parallel batches of 2-3 |
| Prompt v5 extracts poorly | Test on 1 company first before all 7 |
| Breaking existing data | Back up `extractions/` and `output/` first |

---

## Success Criteria

1. **Speaker ID**: >80% of snippets have non-null `speakerId`
2. **Leaders**: >20% of nodes have `leader` object
3. **Size Source**: 100% of nodes with `sizeMentions` have `snippetIndex`
4. **Tests Pass**: `python3 -m pytest tests/ -v` green
