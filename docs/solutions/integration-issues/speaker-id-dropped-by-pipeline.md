---
title: "speakerId Dropped by integrate_viewer.py"
category: integration-issues
tags: [speakerId, pipeline, integrate_viewer, speaker-resolution]
module: pipeline
date: 2026-02-12
severity: medium
symptoms:
  - Speaker shows as [Speaker] in context popout
  - No way to identify who said what in transcript context
  - Word-count heuristic for speaker resolution is unreliable
---

# speakerId Dropped by integrate_viewer.py

## Problem

The context popout modal showed `[Speaker]` on every line because there was no way to map numeric speaker IDs to participant names. A word-count heuristic was attempted (more words = BioRender rep) but was unreliable.

## Root Cause

`build_true_auto_map.py` correctly includes `speakerId` on each snippet (267/267 for Novartis, etc.). But `integrate_viewer.py`'s `build_viewer_snippet()` function only copied a subset of fields — `speakerId` was silently dropped.

The data existed in the pipeline; it just wasn't passed through to the viewer.

## Solution

One-line fix in `integrate_viewer.py`:

```python
def build_viewer_snippet(snippet):
    viewer_snippet = {
        "quote": snippet.get("quote", ""),
        "date": snippet.get("date"),
        "gongUrl": snippet.get("gongUrl"),
        "callId": snippet.get("callId"),
        "customerName": snippet.get("customerName"),
        "internalName": snippet.get("internalName"),
        "speakerId": snippet.get("speakerId"),  # THIS WAS MISSING
        "sizeMentions": snippet.get("sizeMentions", [])
    }
```

Then in the viewer JS, use `speakerId` to identify which transcript speaker said the quote. Combined with `customerName`/`internalName`, this maps both speakers on 2-person calls. Multi-person calls fall back to `[Speaker A]`, `[Speaker B]` labels.

## Prevention

When adding new fields to the pipeline, trace the full path:
```
extraction → consolidation → build_auto_map → integrate_viewer → viewer JS
```

If a field exists in the auto map JSON but not in the viewer, check `build_viewer_snippet()` in `integrate_viewer.py` — it explicitly lists which fields to include.

**Field mapping reference** (from CLAUDE.md):

| Concept | Auto Map | Viewer |
|---------|----------|--------|
| Speaker ID | `speakerId` | `speakerId` (was missing) |
| Quote | `quote` | `quote` |
| Call ID | `callId` | `callId` |
| Gong URL | `gongUrl` | `gongUrl` |
