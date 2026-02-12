# Entity Merge & Alias Persistence

**Date:** 2026-02-12
**Status:** Brainstorm

---

## What We're Building

Two connected capabilities for GongOrgViewerStatic:

1. **Merge tab in Manage Entities** — Let users arbitrarily merge any two (or more) entities (e.g., "ABCD" into "ABCD Group") from a searchable list, not just auto-detected duplicates. Aliases are editable after merge.

2. **Alias-aware pipeline** — When the extract/consolidate pipeline re-runs, it checks existing merges+aliases from Vercel KV and **flags** potential alias matches for human review (not auto-apply).

---

## Why This Approach

Today, merges only work from the Duplicates modal (same-leader detection). If entities have different leaders but are the same org ("ABCD" vs "ABCD Group"), there's no way to merge them. Worse, re-running the pipeline recreates the duplicates because it never consults prior merge decisions.

The "flag for review" approach for the pipeline is safer than auto-apply — it avoids silently collapsing entities that happen to share a name but are legitimately different (e.g., "IT" in two different business units).

---

## Key Decisions

### 1. UI: Merge Tab in Manage Entities Modal

**Placement:** Third tab alongside Create / Delete in existing Manage Entities modal.

**Flow:**
1. User searches for **Entity A** (the one being absorbed) via search box
2. User searches for **Entity B** (the canonical / surviving entity)
3. Preview shows: Entity A's name becomes an alias on Entity B, Entity A's snippets/children transfer to Entity B
4. User confirms merge
5. Entity A disappears from tree, its name is stored as an alias on Entity B

**Post-merge alias editing:**
- On the canonical entity's detail panel (or a dedicated section in the merge tab), show current aliases as editable chips
- User can add new aliases manually (e.g., "ABCD Therapeutics") or remove stale ones
- Alias edits save to the same KV merges endpoint

**Data model change:** The existing `EntityMerge` interface in `/api/merges.ts` already has `aliases: string[]` — no schema change needed. We just need to support updating aliases independently of the merge operation (a PATCH-like update to add/remove aliases on an existing merge).

### 2. Pipeline: Alias-Aware Consolidation

**Where it plugs in:** `consolidate_with_hierarchy.py`, between Step 3 (quality filter) and Step 4 (LLM consolidation).

**New step — "Check Known Aliases":**
1. Fetch merges from KV: `GET /api/merges?account={company}`
2. Build alias lookup: `{ "abcd": "abcd-group", "abcd therapeutics": "abcd-group", ... }`
3. For each entity in quality_entities, check if `normalize(entity.name)` matches any alias
4. If match found, **don't auto-merge** — instead, write a flag to an `alias_matches.json` report file:
   ```json
   {
     "flagged": [
       {
         "extracted_entity": "ABCD",
         "matched_alias": "abcd",
         "canonical_entity_id": "abcd-group",
         "canonical_entity_name": "ABCD Group",
         "action": "review_needed"
       }
     ]
   }
   ```
5. Print a summary: `"  Alias matches found: 3 (see output/{co}/alias_matches.json)"`
6. Human reviews the file and either confirms (entities get merged in next integrate step) or dismisses

**Normalization:** lowercase, strip "group", "inc", "ltd", trailing punctuation, collapse whitespace. Keep it simple — exact + normalized match only, no fuzzy.

### 3. What We're NOT Building (YAGNI)

- No fuzzy/ML alias matching in the pipeline — exact normalized match only
- No auto-apply of merges during pipeline runs
- No alias history/versioning — last write wins
- No cross-company alias sharing — merges are per-account
- No bulk merge UI — one merge at a time is fine

---

## Open Questions

1. **Children transfer:** When Entity A is absorbed into Entity B, should A's children become B's children? The current `executeMerge()` doesn't handle this — absorbed entities are just hidden. Do we need to reparent children?

2. **Snippet consolidation:** Should merged entity show combined snippets from both entities, or just the canonical's? Current code stores `mergedSnippets` but it's unclear if the renderer uses them.

3. **Pipeline fetch auth:** The Python pipeline scripts run locally. Can they hit the Vercel KV API directly, or do they need the bypass secret? Need to verify the `/api/merges` endpoint is accessible from local dev.

4. **Graduated map:** When a merge happens and the user has already graduated an auto map to manual, should the manual map also reflect the merge? Or is that a separate concern?

---

## Affected Files

| File | Change |
|------|--------|
| `public/index.html` | Add Merge tab UI, alias editing on entity detail, alias display |
| `api/merges.ts` | Add PATCH support for alias-only updates |
| `scripts/consolidate_with_hierarchy.py` | Add alias-check step before LLM consolidation |
| `scripts/fetch_kv_merges.py` (new) | Helper to fetch merges from KV for pipeline use |

---

## Next Steps

Run `/workflows:plan` when ready to implement.
