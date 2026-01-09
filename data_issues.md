# Data Pipeline Issues

**Date:** 2025-01-08
**Data Version:** 78K line version (production)

## Issue Summary

The Gong extraction pipeline has inconsistencies in how team sizes are tracked.

## Specific Problems

### 1. teamSizes vs sizeMentions Mismatch
- `gongEvidence.teamSizes` gets populated with summary values (e.g., `"~30 people"`)
- `gongEvidence.sizeMentions` (traceable source array) often stays **empty**
- UI shows "no source" for sizes that actually have snippet evidence

**Example - Bioanalytics:**
```json
"teamSizes": ["~30 people"],    // Has value
"sizeMentions": [],              // Empty - should link to snippet
"snippets": [{ "quote": "gonna be like 30. People" }]  // Source exists!
```

### 2. Snippets Assigned to Wrong Entities
- Structural Biology card shows call mentioning "tumor biology group"
- There's a separate "Tumor Bio" entity that should have this snippet

### 3. Multiple Size Values Without Sources
- Pfizer Metabolism: shows 100, snippet has both 24 and 100
- BioMedicine Design: shows options for 300 and 25, only 25 has a card
- Protein Engineering: shows "10 people no source" with no snippet at all

## Root Cause

The consolidator/extractor puts extracted sizes in `teamSizes` (summary field) but doesn't populate `sizeMentions` (traceable field) with snippet references.

## Fix Required

In Phase 2 (Workflow DevKit pipeline):
1. Ensure `sizeMentions` is populated with snippet index/reference
2. Validate entity-snippet assignment
3. Extract ALL numbers from quotes, not just first match
4. Add deduplication for same snippet assigned to multiple entities

## Data Stores in Viewer

| Store | Lines | Purpose |
|-------|-------|---------|
| `DATA` | 2090-50344 | Auto mode - has these issues |
| `MANUAL_DATA` | 50345-67879 | CSV import - cleaner |
| `MATCH_REVIEW_DATA` | 67880-75828 | Matching suggestions |
