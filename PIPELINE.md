# Gong Org Intelligence Pipeline

## Overview

This pipeline extracts organizational intelligence from Gong call transcripts and matches it against manually-created org charts. The output is an enriched org viewer with evidence from actual sales calls.

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INPUT SOURCES                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Manual Maps (JSON)              │  Gong Call Transcripts                   │
│  "Manual Maps Jan 26 2026/"      │  (via VercelGong batches)                │
│  - abbvie_rd_map.json            │  batches/{company}/batch_*.json          │
│  - roche_rd_map.json             │                                          │
│  - etc.                          │                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                │                                      │
                │                                      ▼
                │                    ┌─────────────────────────────────────────┐
                │                    │  PHASE 0-4: Entity Extraction           │
                │                    │  scripts/extract_entities.py            │
                │                    │  (LLM-based extraction from transcripts)│
                │                    └─────────────────────────────────────────┘
                │                                      │
                │                                      ▼
                │                    ┌─────────────────────────────────────────┐
                │                    │  extractions/{company}/                 │
                │                    │    entities_llm_v2.json                 │
                │                    │  (raw extractions with snippets)        │
                │                    └─────────────────────────────────────────┘
                │                                      │
                ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 5a: Cleanup & Matching                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. cleanup_and_consolidate.py   │  Dedupe, resolve context, filter noise   │
│  2. create_cleaned_match_batches │  Prepare batches for LLM matching        │
│  3. llm_auto_matcher.py          │  Match entities to manual map nodes      │
│  4. generate_match_review.py     │  Create review data structure            │
│  5. generate_auto_map.py         │  Create enriched org chart               │
└─────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
                          ┌─────────────────────────────────────────┐
                          │  output/{company}_cleaned_*.json        │
                          │  - _cleaned_entities.json               │
                          │  - _cleaned_llm_matches.json            │
                          │  - _cleaned_match_review_data.json      │
                          │  - _cleaned_auto_map.json               │
                          └─────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 5b: Snippet Enrichment                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  scripts/enrich_snippets.py                                                  │
│  - Builds snippet lookup from original extractions                           │
│  - Maps canonical names → original names → snippets                          │
│  - Adds quote, date, callId, gongUrl to all entities                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
                          ┌─────────────────────────────────────────┐
                          │  output/{company}_enriched_*.json       │
                          │  - _enriched_match_review_data.json     │
                          │  - _enriched_auto_map.json              │
                          └─────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 6: Integration & Deploy                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  scripts/integrate_viewer.py                                                 │
│  --preview      Show what would be updated                                   │
│  --export-json  Export viewer_data.json and viewer_match_review.json        │
│  --update       Replace DATA and MATCH_REVIEW_DATA in index.html            │
│                                                                              │
│  Then: vercel deploy                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
GongOrgViewerStatic/
├── Manual Maps Jan 26 2026/     # INPUT: Manual org charts (ground truth)
│   ├── abbvie_rd_map.json
│   ├── astrazeneca_rd_map.json
│   ├── gsk-rd-org-map.json
│   ├── lilly-rd-org-map.json
│   ├── novartis_rd_map (2).json
│   ├── regeneron_rd_map.json
│   └── roche_rd_map.json
│
├── batches/                      # INPUT: Gong call transcripts (from VercelGong)
│   └── {company}/batch_*.json
│
├── extractions/                  # INTERMEDIATE: Raw LLM extractions
│   └── {company}/
│       └── entities_llm_v2.json  # Has raw_quote, call_id, entity_name
│
├── output/                       # OUTPUT: All generated files
│   ├── {company}_cleaned_*.json  # Phase 5a outputs (deprecated)
│   └── {company}_enriched_*.json # Phase 5b outputs (CURRENT)
│
├── scripts/                      # Pipeline scripts (see below)
│
├── public/
│   └── index.html                # Viewer (single HTML with embedded data)
│
├── api/                          # Vercel serverless functions
│
├── CLAUDE.md                     # Project instructions for Claude
├── PIPELINE.md                   # This file
└── vercel.json                   # Deployment config
```

## Companies Supported

| Company | Manual Map | Extractions | Status |
|---------|-----------|-------------|--------|
| AbbVie | abbvie_rd_map.json | ✅ | Active |
| AstraZeneca | astrazeneca_rd_map.json | ✅ | Active |
| GSK | gsk-rd-org-map.json | ✅ | Active |
| Lilly | lilly-rd-org-map.json | ✅ | Active |
| Novartis | novartis_rd_map (2).json | ✅ | Active |
| Regeneron | regeneron_rd_map.json | ✅ | Active |
| Roche | roche_rd_map.json | ✅ | Active |

## Scripts Reference

### Core Pipeline Scripts (in execution order)

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `extract_entities.py` | Extract org entities from Gong transcripts | batches/{company}/*.json | extractions/{company}/entities_llm_v2.json |
| `cleanup_and_consolidate.py` | Dedupe & filter entities | extractions/{company}/entities_llm_v2.json | output/{company}_cleaned_entities.json |
| `create_cleaned_match_batches.py` | Prepare matching batches | output/{company}_cleaned_entities.json | output/{company}_cleaned_match_batches.json |
| `llm_auto_matcher.py` | Match entities to manual map | cleaned_entities + manual_map | output/{company}_cleaned_llm_matches.json |
| `generate_match_review.py` | Create review data | cleaned_llm_matches | output/{company}_cleaned_match_review_data.json |
| `generate_auto_map.py` | Create enriched org chart | manual_map + llm_matches | output/{company}_cleaned_auto_map.json |
| `enrich_snippets.py` | Add snippets to all outputs | cleaned_* + entities_llm_v2 | output/{company}_enriched_*.json |
| `integrate_viewer.py` | Convert to viewer format & update HTML | enriched_* | output/viewer_*.json, public/index.html |

### Utility Scripts

| Script | Purpose |
|--------|---------|
| `compare_maps.py` | Compare manual vs auto maps |
| `compare_llm_maps.py` | Compare LLM match results |
| `index_missing_companies.py` | Find companies without extractions |

### Legacy/Archive Scripts

Scripts in root directory (not `scripts/`) are legacy extraction attempts and can be archived.

## Adding a New Company

### Prerequisites

1. Manual org chart JSON file
2. Gong call transcripts for the company (via VercelGong pipeline)

### Step-by-Step Process

```bash
# 1. Add manual map
cp /path/to/newcompany_rd_map.json "Manual Maps Jan 26 2026/"

# 2. Add company to COMPANIES list in scripts
# Edit: scripts/cleanup_and_consolidate.py, llm_auto_matcher.py,
#       generate_match_review.py, generate_auto_map.py, enrich_snippets.py
# Add "newcompany" to the COMPANIES list

# 3. Get Gong transcripts (from VercelGong)
# Copy batches to: batches/newcompany/

# 4. Run entity extraction
python3 scripts/extract_entities.py --company newcompany

# 5. Run cleanup and consolidation
python3 scripts/cleanup_and_consolidate.py --company newcompany

# 6. Create match batches
python3 scripts/create_cleaned_match_batches.py --company newcompany

# 7. Run LLM auto-matching
python3 scripts/llm_auto_matcher.py --company newcompany

# 8. Generate match review data
python3 scripts/generate_match_review.py --company newcompany

# 9. Generate auto map
python3 scripts/generate_auto_map.py --company newcompany

# 10. Enrich with snippets
python3 scripts/enrich_snippets.py  # Runs all companies

# 11. Integrate into viewer
python3 scripts/integrate_viewer.py --preview  # Check what will change
python3 scripts/integrate_viewer.py --update   # Update index.html

# 12. Deploy
vercel
```

### Quick Command (All Steps)

```bash
COMPANY=newcompany

# Run extraction and processing pipeline
python3 scripts/extract_entities.py --company $COMPANY && \
python3 scripts/cleanup_and_consolidate.py --company $COMPANY && \
python3 scripts/create_cleaned_match_batches.py --company $COMPANY && \
python3 scripts/llm_auto_matcher.py --company $COMPANY && \
python3 scripts/generate_match_review.py --company $COMPANY && \
python3 scripts/generate_auto_map.py --company $COMPANY && \
python3 scripts/enrich_snippets.py

# Integrate into viewer
python3 scripts/integrate_viewer.py --preview
python3 scripts/integrate_viewer.py --update

# Deploy
vercel
```

## Data Formats

### Manual Map (Input)

```json
{
  "root": {
    "id": "company-rd",
    "name": "Company R&D",
    "type": "company",
    "leader": { "name": "John Doe", "title": "CEO" },
    "children": [
      {
        "id": "division-1",
        "name": "Research Division",
        "type": "division",
        "children": [...]
      }
    ]
  }
}
```

### Extraction Output (entities_llm_v2.json)

```json
{
  "organization": "company",
  "entities": [
    {
      "entity_name": "Research Team",
      "entity_type": "team",
      "raw_quote": "Our research team is working on...",
      "call_id": "2025-01-15_abc123def456",
      "call_date": "2025-01-15",
      "speaker_id": "123456789",
      "confidence": "high"
    }
  ]
}
```

### Enriched Match Review Data (Final Output)

```json
{
  "company": "company",
  "review_items": {
    "auto_approved": [
      {
        "id": "research-team",
        "gong_entity": "Research Team",
        "entity_type": "team",
        "snippet": "Our research team is working on...",
        "snippet_date": "2025-01-15",
        "call_id": "2025-01-15_abc123def456",
        "gong_url": "https://app.gong.io/call?id=abc123def456",
        "call_count": 5,
        "llm_suggested_match": {
          "manual_node_id": "research-division",
          "manual_node_name": "Research Division",
          "confidence": "high",
          "reasoning": "Exact match..."
        },
        "status": "auto_approved"
      }
    ],
    "pending_review": [...],
    "no_match": [...]
  }
}
```

### Enriched Auto Map (Final Output)

```json
{
  "company": "company",
  "root": {
    "id": "company-rd",
    "name": "Company R&D",
    "children": [
      {
        "id": "research-division",
        "name": "Research Division",
        "gong_evidence": {
          "matched_entities": ["Research Team"],
          "total_mentions": 5,
          "call_count": 3,
          "snippets": [
            {
              "gong_entity": "Research Team",
              "quote": "Our research team is working on...",
              "date": "2025-01-15",
              "callId": "2025-01-15_abc123def456",
              "gongUrl": "https://app.gong.io/call?id=abc123def456"
            }
          ],
          "evidence_strength": "strong"
        }
      }
    ]
  }
}
```

## Environment Setup

### Required Environment Variables

```bash
# In .env.shared (workspace root) or environment
ANTHROPIC_API_KEY=sk-ant-...
```

### Python Dependencies

```bash
pip3 install anthropic --break-system-packages
```

## Verification

### Integrity Checks

After running the pipeline, verify with:

```bash
python3 -c "
import json
companies = ['abbvie', 'astrazeneca', 'gsk', 'lilly', 'novartis', 'regeneron', 'roche']
print('Company         Review Items   With Snippets')
for c in companies:
    with open(f'output/{c}_enriched_match_review_data.json') as f:
        d = json.load(f)
    stats = d.get('enrichment_stats', {})
    print(f'{c:<15} {stats.get(\"total_items\", 0):>12} {stats.get(\"enriched_with_snippets\", 0):>14}')
"
```

### Sample Output Check

```bash
python3 -c "
import json
with open('output/roche_enriched_match_review_data.json') as f:
    d = json.load(f)
item = d['review_items']['auto_approved'][0]
print(f'Entity: {item[\"gong_entity\"]}')
print(f'Snippet: {item[\"snippet\"][:80]}...')
print(f'Gong URL: {item[\"gong_url\"]}')
"
```

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Empty snippets | Cleanup lost raw_quote | Run `enrich_snippets.py` |
| Missing company | Not in COMPANIES list | Add to all scripts |
| API rate limit | Too many requests | Increase RATE_LIMIT_DELAY |
| No extractions | Batches not available | Get from VercelGong |

### Log Files

- `output/cleanup_run.log` - Cleanup/consolidation logs

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-27 | 5b | Added snippet enrichment |
| 2026-01-27 | 5a | Added cleanup + LLM matching |
| 2026-01-26 | 4 | Initial extraction pipeline |
