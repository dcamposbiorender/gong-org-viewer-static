---
title: "Parallel Review Workflow Catches Real Bugs"
category: architecture-patterns
tags: [review, workflow, simplicity, architecture, data-integrity]
module: process
date: 2026-02-12
severity: low
symptoms:
  - Bugs discovered after implementation
  - Over-engineered solutions shipped
  - Data integrity issues missed during planning
---

# Parallel Review Workflow Catches Real Bugs

## Pattern

After writing a plan but before implementing, run 3 reviewers in parallel:
1. **Simplicity reviewer** — finds YAGNI violations, unnecessary complexity
2. **Architecture reviewer** — finds structural issues, XSS, CORS, normalization bugs
3. **Data integrity reviewer** — finds corruption scenarios, race conditions, orphaned references

## Evidence from This Session

### Entity Merge Plan — 3 reviewers found:

| Finding | Reviewer | Impact |
|---------|----------|--------|
| Drop MergedSnippet/ReparentedChild (~235 LOC) | Simplicity | 29% code reduction |
| Drop PATCH endpoint — POST already works | Simplicity | No API changes needed |
| Cross-company merge contamination | Data Integrity | Would hide wrong entities |
| Transitive orphan prevention (canonical-as-source) | Data Integrity | Entities could vanish from tree |
| XSS via inline onclick with single quotes | Architecture | Security vulnerability |
| Normalization regex anchoring to end-of-string | Architecture | False alias matches |
| CORS header missing PATCH | Architecture | Feature would 100% fail |

### Snippet Context Plan — 3 reviewers found:

| Finding | Reviewer | Impact |
|---------|----------|--------|
| Drop speaker resolution heuristic (~120 LOC) | Simplicity | 46% code reduction |
| Index drift between normalized and original text | Data Integrity | Wrong context displayed |
| Multiple occurrence risk (duplicate 40-char prefixes) | Data Integrity | Wrong conversation shown |
| Add Escape key to close modal | Architecture | Consistency |

## How to Use

```
/workflows:plan → write plan
/plan_review (or manually launch 3 Task agents) → 3 parallel reviewers
Consolidate findings → update plan
/workflows:work → implement revised plan
```

Total review time: ~3-5 minutes (parallel). Bugs caught: 11 across 2 plans. Worth it every time.
