---
title: "Cross-Company localStorage Contamination"
category: ui-bugs
tags: [localStorage, entityMerges, company-scoping, contamination]
module: viewer
date: 2026-02-12
severity: high
symptoms:
  - Entity hidden in wrong company
  - "oncology" entity disappears when switching from AbbVie to Novartis
  - Merges from one company affect another company's tree
---

# Cross-Company localStorage Contamination

## Problem

When a user merges entities in Company A, then switches to Company B, entities in Company B with the same slugified ID (e.g., `"oncology"`) are incorrectly hidden.

## Root Cause

`entityMerges` was a flat dict stored in localStorage under a single key `'entityMerges'`. On company switch, `loadEntityMerges()` loaded ALL companies' merges from localStorage, then overlaid current company's KV data on top:

```javascript
// BUG: loads ALL companies, not just current
const stored = localStorage.getItem('entityMerges');
if (stored) entityMerges = JSON.parse(stored);

// Overlay current company from KV
entityMerges = { ...entityMerges, ...kvData };
```

`isEntityAbsorbed()` then iterated ALL entries, including other companies' merges.

## Solution

1. Clear `entityMerges = {}` before loading from KV
2. Scope localStorage key by company: `'entityMerges:' + company.toLowerCase()`

```javascript
async function loadEntityMerges() {
  entityMerges = {};  // Clear previous company's data
  try {
    const response = await fetch(kvApiUrl('merges', currentCompany));
    if (response.ok) {
      const kvData = await response.json();
      if (kvData && Object.keys(kvData).length > 0) {
        entityMerges = kvData;
      }
    }
  } catch (e) {
    console.log('Using empty merges (KV not available)');
  }
  localStorage.setItem('entityMerges:' + currentCompany.toLowerCase(), JSON.stringify(entityMerges));
}
```

## Prevention

**All entity-keyed state in this viewer must be company-scoped:**
- `overrides` (corrections)
- `fieldEdits`
- `sizeOverrides`
- `entityMerges`

When adding new state: always scope the localStorage key by company and clear on switch.

Pattern: `localStorage.setItem('featureName:' + company.toLowerCase(), data)`
