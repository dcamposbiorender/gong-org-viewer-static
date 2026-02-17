# Extraction & Integration Pipeline Flow

## Full Pipeline (batches → viewer JSON)

```mermaid
sequenceDiagram
    participant B as batches_enriched/
    participant E as extract_entities.py
    participant C as Claude API
    participant EX as extractions/
    participant CO as consolidate_with_hierarchy.py
    participant BM as build_true_auto_map.py
    participant IV as integrate_viewer.py
    participant J as public/data/{co}/

    Note over B,J: Pipeline: extract → consolidate → build_map → integrate

    B->>E: Load batch_*.json (transcripts)
    E->>C: Send transcript + v5 prompt
    C-->>E: JSON {entities[], contacts[]}
    E->>EX: Save entities_llm_v2.json

    EX->>CO: Load raw extractions
    CO->>C: Infer hierarchy relationships
    C-->>CO: Parent-child mappings
    CO->>CO: Deduplicate & aggregate sources
    CO-->>EX: Save consolidated_with_hierarchy.json

    EX->>BM: Load consolidated data
    BM->>BM: Build tree + snippets + speakerId + leader
    BM-->>EX: Save {co}_true_auto_map.json

    EX->>IV: Load auto maps + manual maps
    B->>IV: Load transcripts for context extraction
    IV->>IV: find_context_with_fallbacks() per snippet
    IV->>IV: Replace paraphrased quotes with exact text
    IV->>J: Write manual.json (org chart + context)
    IV->>J: Write match-review.json (unmatched + context)
```

## Context Extraction (integrate_viewer.py)

```mermaid
flowchart TB
    Q[Snippet quote] --> S1{Standard match?}
    S1 -->|Yes| CTX[Extract 1000-char before/after]
    S1 -->|No| S2{Speaker-tag stripped?}
    S2 -->|Yes| CTX
    S2 -->|No| S3{Shorter prefix 100/50/30?}
    S3 -->|Yes| REPLACE[Replace quote with exact text]
    S3 -->|No| S4{Ellipsis stripped?}
    S4 -->|Yes| REPLACE
    S4 -->|No| S5{Entity name in transcript?}
    S5 -->|Yes| REPLACE
    S5 -->|No| S6{Fuzzy variant? R&D→r and d}
    S6 -->|Yes| REPLACE
    S6 -->|No| S7{Multi-word phrase from quote?}
    S7 -->|Yes| REPLACE
    S7 -->|No| FAIL[Context failure logged]
    REPLACE --> CTX
```

## Match Review Generation

```mermaid
sequenceDiagram
    participant AM as Auto Map
    participant MM as Manual Map
    participant IV as integrate_viewer.py
    participant TX as Transcripts
    participant MR as match-review.json

    IV->>AM: Walk all entities
    IV->>MM: Build manual name set
    IV->>IV: Filter: entities NOT in manual map
    loop Each unmatched entity
        IV->>TX: find_context_with_fallbacks(quote, transcript, entity_name)
        TX-->>IV: {contextBefore, contextAfter, exactQuote}
        IV->>IV: Replace paraphrased quote if fallback used
    end
    IV->>IV: Load LLM match suggestions
    IV->>MR: Write items with all_snippets + context
```

## Key Data Transformations

| Stage | Input | Output | Key Fields Added |
|-------|-------|--------|------------------|
| Extract | transcript | entities_llm_v2.json | entity_name, entity_type, speaker_id, raw_quote |
| Consolidate | entities_llm_v2.json | consolidated_with_hierarchy.json | parent_id, leader, leader_title, all_sources |
| Build Map | consolidated_with_hierarchy.json | {co}_true_auto_map.json | speakerId, gongUrl, customerName, tree structure |
| Integrate | *_true_auto_map.json + transcripts | manual.json, match-review.json | contextBefore, contextAfter, callTitle, exact quotes |

## Coverage (2026-02-16)

| Company | Org Chart Snippets | Match Review Snippets | Total | Context Coverage |
|---------|-------------------|----------------------|-------|-----------------|
| abbvie | 14 | 210 | 224 | 100% |
| astrazeneca | 27 | 434 | 461 | 100% |
| gsk | 5 | 250 | 255 | 100% |
| lilly | 2 | 92 | 94 | 100% |
| novartis | 29 | 238 | 267 | 100% |
| regeneron | 1 | 34 | 35 | 100% |
| roche | 3 | 197 | 200 | 100% |
| **TOTAL** | **81** | **1455** | **1536** | **100%** |
