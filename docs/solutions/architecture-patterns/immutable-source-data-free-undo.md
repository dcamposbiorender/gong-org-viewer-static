---
title: "Immutable Source Data = Free Undo"
category: architecture-patterns
tags: [merge, unmerge, overlay, immutability, YAGNI]
module: viewer
date: 2026-02-12
severity: high
symptoms:
  - Over-engineered undo tracking
  - MergedSnippet/ReparentedChild interfaces adding complexity
  - Phase dedicated to unmerge rewrite
---

# Immutable Source Data = Free Undo

## Problem

When planning the entity merge feature, the initial design included:
- `MergedSnippet` interface tracking `originalEntityId` per snippet
- `ReparentedChild` interface tracking `originalParentId` per child
- A PATCH endpoint for alias-only updates
- An entire Phase 4 dedicated to rewriting the unmerge function
- `hashQuote()` function for snippet identity keys

This added ~235 lines (~29% of planned code) for undo support.

## Root Cause

Failed to recognize that `DATA[company].root` is **never mutated**. All user changes (merges, corrections, field-edits, size overrides) are stored as overlay data in Vercel KV and localStorage, applied at render time by `buildWorkingTree()`.

## Solution

**Unmerge = delete the merge overlay record.** Everything reverts automatically:
- Absorbed entity reappears (no longer hidden by `isEntityAbsorbed()`)
- Children return to original parent (source tree has them there)
- Snippets return to original entity (`getNodeSnippets()` stops combining)

The existing 5-line `unmergeEntity()` function already worked:
```javascript
function unmergeEntity(canonicalId) {
  delete entityMerges[canonicalId];
  localStorage.setItem('entityMerges:' + currentCompany.toLowerCase(), JSON.stringify(entityMerges));
  deleteEntityMergeFromKV(currentCompany, canonicalId);
  renderCompany(currentCompany);
}
```

No tracking, no interfaces, no PATCH endpoint needed.

## Prevention

Before designing undo/restore logic, always ask: **"Is the source data mutated, or is it an overlay?"**

If overlays:
- Delete overlay = revert
- No origin tracking needed
- No migration/compatibility concerns
- Test by: apply overlay → delete overlay → verify state matches original

This pattern applies to all KV-backed features in this viewer: corrections, field-edits, sizes, merges.

## Impact

- ~235 LOC eliminated before writing any code
- 5 phases collapsed to 3
- No API changes needed (existing POST handles everything)
- No schema migration for `mergedSnippets: string[]` → `MergedSnippet[]`
