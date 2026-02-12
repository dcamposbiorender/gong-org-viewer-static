---
title: "Context Windows Over Full Transcripts"
category: architecture-patterns
tags: [snippets, transcripts, context, performance, data-size]
module: pipeline, viewer
date: 2026-02-12
severity: low
symptoms:
  - Snippets too short to understand conversation flow
  - Gong URLs broken, can't access original call
  - Need transcript context without massive data payload
---

# Context Windows Over Full Transcripts

## Problem

Users needed to see surrounding conversation context for snippets, but:
- Full transcripts = 14.8MB for 596 calls (would triple HTML size)
- API-based lazy-load requires serverless functions and runtime cost
- Current index.html is already 4.4MB

## Solution

Pre-compute 1000-char context windows (before + after each snippet quote) during pipeline build:

| Approach | Data Size | Runtime Cost | Match Rate |
|----------|-----------|-------------|------------|
| Full transcripts | 14.8MB | 0 | 100% |
| **Context windows (1000 chars)** | **2.6MB** | **0** | **97%** |
| API lazy-load | 0 (initial) | Per-request | 100% |

The 1000-char window provides 6-8 paragraphs of surrounding conversation — enough to understand flow.

## Implementation

```python
def find_context(quote, transcript_data, context_chars=1000):
    norm_text = re.sub(r'\s+', ' ', text.lower())
    norm_quote = re.sub(r'\s+', ' ', quote.lower().strip())
    idx = norm_text.find(norm_quote[:1000])
    if idx < 0: return None

    start = max(0, idx - context_chars)
    end = min(len(text), idx + len(search_key) + context_chars)
    before = text[start:idx]
    after = text[idx + len(search_key):end]

    if start > 0: before = '...' + before
    if end < len(text): after = after + '...'

    return {'contextBefore': before, 'contextAfter': after, 'callTitle': title}
```

Key details:
- Match using full normalized quote (up to 1000 chars), not prefix
- Keep original `[Speaker ID]` tags (resolved at display time in JS)
- Add `...` ellipsis at truncated boundaries
- Log failures to `{company}/context_failures.json`
- 97% match rate across 1,531 snippets

## Prevention / Reuse

When facing "embed full data vs. API" decisions:
1. Calculate the **window** size needed (what % of full data gives the UX?)
2. Pre-compute windows at build time if possible
3. Add lazy-load for full data as a future enhancement
4. Always log what couldn't be matched for debugging
