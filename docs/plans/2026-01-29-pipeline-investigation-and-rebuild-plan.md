---
title: "Pipeline Investigation and Rebuild"
type: investigation
date: 2026-01-29
priority: P0
status: ready_to_execute
phases_complete: [1, 2, 3, 4]
next_action: "Execute Wave 1 tasks in parallel"
---

## Quick Links
- **Phase 1-2 Data Analysis**: `docs/plans/phase1-data-comparison.md`
- **Phase 4 Fix Design**: `docs/plans/phase4-comprehensive-fix.md`
- **Architecture Reference**: `docs/architecture.md`

# Pipeline Investigation and Rebuild

## Problem Statement

The current pipeline is fundamentally broken. Despite multiple "fixes", the viewer still shows:
- No leaders in Auto mode
- No team sizes (or sizes with "no source")
- Speaker IDs as numbers instead of names
- Groups with no supporting snippets
- Extracted values not properly linked to their sources

## Observed Issues (Jan 29, 2026)

### Issue 1: Speaker IDs Not Resolved
- **Example**: AbbVie compliance snippet shows `"...00308906015]: Perfect. Do you, do you typically share those with the compliance team..."`
- **Expected**: Human-readable name (e.g., "John Smith")
- **Actual**: Numeric speaker ID embedded in quote

### Issue 2: Auto Map Has No Leaders
- Contradicts test output claiming leaders were merged
- No leaders visible in any company's Auto mode
- Leader merging from manual map is not working

### Issue 3: Team Sizes Show "No Source"
- AbbVie Immunology Group shows "10" for team size
- But displays "10 ⚠ no source" - the link to supporting snippet is broken
- The snippet DOES mention "10 people" but the connection isn't made

### Issue 4: Groups Have No Supporting Snippets
- Auto map shows group names but unclear where they came from
- Did they come from metadata? Extraction? Manual map copy?
- No evidence trail for why groups exist

### Issue 5: Manual Map Matching Issues
- GSK Cell Line Development has snippet saying "60"
- But team size is not populated
- Extracted values not being stored/linked properly

### Issue 6: Fundamental Extraction Gap
- Leaders are not being extracted from transcripts
- Hierarchy mentions not captured
- Team sizes extracted but not linked to entities
- The entire extraction → storage → display pipeline is broken

---

## Investigation Plan

### Phase 1: Understand V1 Architecture

**Goal**: Document how the original working version was built

#### 1.1 Trace V1 Data Flow
- [ ] Find the original V1 extraction scripts
- [ ] Document: How did V1 create snippets?
- [ ] Document: How did V1 link snippets to entities?
- [ ] Document: How did V1 resolve speaker IDs to names?
- [ ] Document: How did V1 extract and store team sizes?
- [ ] Document: How did V1 extract and store leaders?

#### 1.2 Compare V1 vs Current Data Structures
- [ ] Export V1 data structure for one company
- [ ] Export current data structure for same company
- [ ] Side-by-side comparison of fields
- [ ] Identify what V1 had that current version lacks

### Phase 2: Trace Current Pipeline

**Goal**: Understand exactly what each script does and where data gets lost

#### 2.1 Extraction Phase
- [ ] What does `extract_entities.py` actually extract?
- [ ] What fields are in the raw extraction output?
- [ ] Does it capture: speaker names? team sizes? leaders? hierarchy?
- [ ] Where does speaker ID → name mapping happen (if at all)?

#### 2.2 Consolidation Phase
- [ ] What does `consolidate_with_hierarchy.py` receive?
- [ ] What does it output?
- [ ] What fields are preserved vs dropped?
- [ ] How does LLM consolidation affect the data?

#### 2.3 Auto Map Build Phase
- [ ] What does `build_true_auto_map.py` receive?
- [ ] How does it build the tree structure?
- [ ] What fields are copied to nodes?
- [ ] How are snippets attached?

#### 2.4 Integration Phase
- [ ] What does `integrate_viewer.py` receive?
- [ ] How does it transform data for the viewer?
- [ ] What field name transformations occur?
- [ ] How is leader/size data supposed to flow?

### Phase 3: Identify Root Causes

Based on investigation, answer:

1. **Speaker ID Resolution**
   - Is there a speaker lookup table?
   - When/where should resolution happen?
   - Why isn't it happening?

2. **Team Size Linkage**
   - How should sizes link to their source snippets?
   - Where is this linkage created?
   - Why does "no source" appear?

3. **Leader Extraction**
   - Are leaders extracted at all?
   - If yes, where do they go?
   - If no, what would extract them?

4. **Snippet Provenance**
   - How do we trace a snippet back to its source call?
   - How do we link entity → snippet → call → speaker?

### Phase 4: Design Fix

Based on root causes, design a proper fix:

1. **Data Model**: What should the data look like at each stage?
2. **Extraction**: What needs to be extracted and how?
3. **Storage**: How should extracted data be stored?
4. **Linkage**: How should entities link to their evidence?
5. **Display**: How should the viewer consume this data?

---

## Key Questions to Answer

1. Where is the speaker ID → name mapping table?
2. How did V1 attach snippets to entities?
3. What is the source of truth for entity names?
4. How should team sizes be linked to their evidence?
5. What extraction prompt should be used for leaders/hierarchy?
6. How does the TRUE auto map differ from enriched auto map?

---

## Files to Investigate

### Scripts
- `scripts/extract_entities.py` - Current extraction
- `scripts/consolidate_with_hierarchy.py` - LLM consolidation
- `scripts/build_true_auto_map.py` - Tree building
- `scripts/integrate_viewer.py` - Viewer integration
- `scripts/enrich_snippets.py` - Snippet enrichment (V1?)

### Data Files
- `extractions/{company}/entities_llm_v2.json` - Raw extractions
- `output/{company}/consolidated_with_hierarchy.json` - Consolidated
- `output/{company}_true_auto_map.json` - Auto map
- `output/{company}_enriched_auto_map.json` - Legacy enriched map
- `batches_enriched/{company}/` - Source transcripts with metadata

### Reference
- `batches/extractor_prompt_v4.md` - Extraction prompt (is it being used?)
- `PIPELINE.md` - Pipeline documentation
- `CLAUDE.md` - Field name cheatsheet

---

## Success Criteria

A properly working pipeline should:

1. **Extract** leaders, team sizes, hierarchy from transcripts
2. **Resolve** speaker IDs to human names
3. **Link** every piece of data to its source snippet
4. **Display** entities with their evidence and metadata
5. **Show** team sizes with the quote that mentioned them
6. **Show** leaders with the quote that identified them

---

## Notes

- Previous "fixes" only addressed symptoms, not root causes
- Need to understand V1 architecture before attempting more fixes
- The extraction prompt v4 may not be actually used by scripts
- Data flow is unclear - need to trace end-to-end
