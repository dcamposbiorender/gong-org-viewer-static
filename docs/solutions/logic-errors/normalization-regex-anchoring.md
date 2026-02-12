---
title: "Normalization Regex Must Anchor to End-of-String"
category: logic-errors
tags: [regex, normalization, alias-matching, suffix-stripping]
module: pipeline, viewer
date: 2026-02-12
severity: medium
symptoms:
  - "Group Therapeutics" normalized to "therapeutics" (wrong)
  - "Workgroup Alpha" normalized to "work alpha" (wrong)
  - False alias matches in pipeline
---

# Normalization Regex Must Anchor to End-of-String

## Problem

Entity name normalization stripped suffixes like "Group", "Inc", "Ltd" from **anywhere** in the name, not just the end. This caused false matches:
- "Group Therapeutics" → "therapeutics" (stripped "Group" from the beginning)
- "Workgroup Alpha" → "work alpha" (stripped "group" from the middle)

## Root Cause

The regex used `\b` word boundaries without end-of-string anchoring:

```python
# WRONG: strips "group" from anywhere
name = re.sub(r'\b(group|inc|ltd|llc|corp|corporation|limited)\b', '', name)
```

## Solution

Anchor to end of string with `\s*$`:

```python
# CORRECT: only strips suffixes at the end
name = re.sub(r'\b(group|inc|ltd|llc|corp|corporation|limited)\s*$', '', name)
```

```javascript
// JS version must match Python exactly
name.replace(/\b(group|inc|ltd|llc|corp|corporation|limited)\s*$/g, '')
```

## Test Cases

```python
assert normalize("Discovery Sciences Group") == "discovery sciences"  # strips end
assert normalize("Group Therapeutics") == "group therapeutics"         # preserves start
assert normalize("Workgroup Alpha") == "workgroup alpha"              # preserves middle
assert normalize("ABCD Inc.") == "abcd"                              # strips end + punctuation
```

## Prevention

When writing regex for suffix stripping:
1. Always anchor to `$` (end of string) or `\s*$`
2. Test with the suffix at start, middle, AND end of string
3. Maintain a parity test between Python and JS versions
