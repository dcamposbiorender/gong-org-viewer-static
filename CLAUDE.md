# GongOrgViewerStatic

## What This Is

Static org chart viewer. Extracts org structure from Gong call transcripts, displays for user review/correction.

**Full architecture**: `docs/architecture.md`

---

## Pipeline (Memorize This)

```
batches_enriched/ → extract → extractions/ → consolidate → output/ → build_map → integrate → index.html
```

| Step | Script | Output |
|------|--------|--------|
| 1. Extract | `extract_*.py` | `extractions/{co}/entities_llm_v2.json` |
| 2. Consolidate | `consolidate_with_hierarchy.py` | `output/{co}/consolidated_with_hierarchy.json` |
| 3. Build Map | `build_true_auto_map.py` | `output/{co}_true_auto_map.json` |
| 4. Integrate | `integrate_viewer.py` | `public/index.html` |

---

## Critical Field Mappings (Why Things Break)

**Rule**: Python = snake_case → Viewer JS = camelCase

| Field | Python Files | Viewer JS |
|-------|-------------|-----------|
| Call ID | `call_id` | `callId` |
| Quote | `raw_quote` | `quote` |
| Evidence | `gong_evidence` | `gongEvidence` |
| Gong URL | `gong_url` | `gongUrl` |
| Speaker | `speaker_id` | `customerName`/`internalName` |

**Extraction formats differ by company:**
- GSK/AZ/Novartis: `value`, `type`, `speaker_id` ✅
- AbbVie/others: `entity_name`, `entity_type`, NO `speaker_id` ❌

---

## Viewer Data Structure

```javascript
DATA[company] = {
  root: {
    id, name, type,
    leader: { name, title } | null,
    size: string | null,
    sizeMentions: [{ value, snippetIndex, source: { callDate, customerName }}],
    snippets: [{ quote, date, callId, gongUrl, customerName, internalName }],
    children: [/* recursive */]
  }
}

MANUAL_DATA[company] = {
  root: {
    id, name, type, leader,
    gongEvidence: { snippets, sizeMentions, matchedContacts, totalMentions },
    children: [/* recursive */]
  }
}
```

---

## Known Pipeline Bugs

| Issue | Cause | Status |
|-------|-------|--------|
| ~~Speaker shows as number~~ | ~~`build_true_auto_map.py` drops `speaker_id`~~ | ✅ Fixed (v5 prompt + pipeline) |
| ~~No leaders in Auto~~ | ~~Extraction doesn't capture "X leads Y"~~ | ✅ Fixed (v5 prompt extracts leaders) |
| Size shows "no source" | Size extracted but not linked to snippet | Open |

### v5 Extraction Stats (2026-01-29)
- **speakerId**: 100% coverage (1531/1531 snippets)
- **leaders**: 43 found across all companies

---

## Key Files

| Purpose | Location |
|---------|----------|
| Source transcripts | `batches_enriched/{co}/batch_*.json` |
| Raw extractions | `extractions/{co}/entities_llm_v2.json` |
| Final auto map | `output/{co}_true_auto_map.json` |
| Manual maps | `Manual Maps Jan 26 2026/{co}_rd_map.json` |
| Viewer | `public/index.html` |
| Participants CSV | Referenced in `build_true_auto_map.py` |

---

## Run Pipeline

```bash
python3 scripts/extract_entities.py --company {co}
python3 scripts/consolidate_with_hierarchy.py --company {co}
python3 scripts/build_true_auto_map.py --company {co}
python3 scripts/integrate_viewer.py --update
vercel
```

---

## Viewer Display Rules

- **Leader**: Shows `node.leader.name` or "?, ?" placeholder
- **Size**: First `sizeMentions[].value` or `node.size`. Shows "⚠ no source" if size but no mentions
- **Snippets**: Filtered by date range, shows quote + customerName + gongUrl link

---

## APIs (Vercel KV)

| Endpoint | Purpose |
|----------|---------|
| `/api/corrections` | Hierarchy overrides |
| `/api/field-edits` | Name/title edits |
| `/api/match-review` | Match decisions |
| `/api/merges` | Entity consolidation |

---

## Before Making Changes

1. Read `docs/architecture.md` for full data flow
2. Check which extraction format the company uses
3. Trace field names through each pipeline stage
4. Run `python3 -m pytest tests/ -v`
