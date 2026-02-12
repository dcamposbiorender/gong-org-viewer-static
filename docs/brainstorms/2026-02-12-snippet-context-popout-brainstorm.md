# Snippet Context Popout

**Date:** 2026-02-12
**Status:** Brainstorm

---

## What We're Building

Replace the current short snippet quotes with an expandable context view. When a user clicks an expand button on a snippet, a modal overlay shows ~1000 characters of surrounding transcript text with the snippet highlighted and speaker IDs resolved to real names (similar to WikiGong's Evidence Viewer). This gives users enough context to understand the conversation flow without leaving the tool.

---

## Why This Approach

**Current pain points:**
1. Snippets are too short to understand context — you see "we have three bioscience departments" but not what came before/after
2. Gong URLs (`app.gong.io/call?id=HASH`) are broken — users can't click through to the original call
3. No way to verify if a snippet was correctly attributed to an entity

**Context windows (1000 chars each side) solve this because:**
- They're **embeddable** — ~2.6MB total for 1,297 snippets (adds ~60% to current 4.4MB HTML, ~7MB total, ~2MB gzipped)
- They're **pre-computed** during pipeline build — no API calls needed at runtime
- They provide **6-8 paragraphs** of surrounding conversation — enough to understand the full flow
- The snippet can be **highlighted** in the context text, matching the WikiGong UX
- **Speaker IDs resolved to real names** using participant data from batch files

**Full transcript lazy-load deferred** — can add later if 1000 chars isn't enough. Would require static files in `public/transcripts/` fetched on demand.

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage | Embedded in HTML (in snippet data) | ~2.6MB extra. No API needed. |
| Context size | 1000 chars before + 1000 chars after | ~2KB per snippet. 6-8 paragraphs. Generous context. |
| UX trigger | Click/button to expand | Keeps current snippet display, adds expand icon |
| Popout style | Modal overlay | Centered popout with backdrop. Clean, dismissible. |
| Speaker names | Resolve IDs to real names | Use participant data from batch files. Much more readable. |
| Full transcript | Deferred (not in scope) | Ship context windows first, add lazy-load later |
| Gong URL fix | Separate concern | URLs need Gong auth; context windows reduce dependency on them |

---

## Data Validation

| Metric | Value |
|--------|-------|
| Total unique snippets in viewer | 1,382 |
| Snippets with transcript match (94%) | 1,297 |
| Snippets not found in transcripts (6%) | 85 |
| Total context window data (1000 chars) | ~2.6MB |
| Avg context per snippet | ~2.0KB |
| Current index.html | 4.4MB |
| Projected index.html | ~7.0MB |
| Gzipped total | ~2MB (text compresses well) |

The 85 unmatched snippets are likely due to quote truncation or normalization during extraction. These would show "Context not available" in the popout.

---

## Proposed UX

### Current (before)
```
"we have three bioscience departments now merged into one"
📅 2025-07-10  👤 John Smith  🔗 [Gong] (broken link)
```

### Proposed (after — collapsed, same as current)
```
"we have three bioscience departments now merged into one"
📅 2025-07-10  👤 John Smith  🔗 [Gong]  [📄 Context]  ← NEW button
```

### Proposed (after — expanded popout)
```
┌─────────────────────────────────────────────────────────┐
│ Call: BioRender & Roche Follow Up  📅 2025-07-10   [✕]  │
│─────────────────────────────────────────────────────────│
│ [Speaker A]: ...and so what happened last year is that  │
│ the leadership decided to consolidate. You know, the    │
│ restructuring affected a lot of teams.                  │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [Speaker B]: Yeah, we have three bioscience         │ │
│ │ departments now merged into one. It's been a big    │ │
│ │ transition for everyone involved.                   │ │  ← HIGHLIGHTED
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [Speaker A]: Right, and how has that affected your      │
│ team's workflow? Are you still using the same tools?     │
│                                                         │
│ [Speaker B]: Well, that's actually why we're looking    │
│ at BioRender more seriously now...                      │
└─────────────────────────────────────────────────────────┘
```

---

## Pipeline Integration

### Where context extraction happens

New step in `integrate_viewer.py` (the final pipeline step that builds index.html):

1. Load all transcripts from `batches_enriched/{company}/batch_*.json`
2. For each snippet in the entity data, find its quote in the transcript
3. Extract 1000 chars before + 1000 chars after
4. Store as `contextBefore` and `contextAfter` fields on each snippet object
5. Embed into the DATA structure in index.html

### Data model change (snippet object)

```javascript
// Current
{
  quote: "we have three bioscience departments now merged into one",
  date: "2025-07-10",
  callId: "2025-07-10_abc123",
  gongUrl: "https://app.gong.io/call?id=...",
  customerName: "John Smith",
  internalName: "Jane Doe"
}

// Proposed — add 3 fields
{
  quote: "we have three bioscience departments now merged into one",
  date: "2025-07-10",
  callId: "2025-07-10_abc123",
  gongUrl: "https://app.gong.io/call?id=...",
  customerName: "John Smith",
  internalName: "Jane Doe",
  contextBefore: "...the leadership decided to consolidate. You know, the restructuring affected a lot of teams.\n\n",  // NEW
  contextAfter: "\n\n[Speaker A]: Right, and how has that affected your team's workflow?...",  // NEW
  callTitle: "BioRender & Roche Follow Up"  // NEW (already in batch data)
}
```

### Quote matching strategy

```python
def find_quote_in_transcript(quote: str, transcript: str, context_chars=1000) -> dict:
    """Find snippet quote in transcript and extract surrounding context."""
    # Normalize for matching (lowercase, collapse whitespace)
    norm_transcript = re.sub(r'\s+', ' ', transcript.lower())
    norm_quote = re.sub(r'\s+', ' ', quote.lower().strip())

    # Try exact match first
    idx = norm_transcript.find(norm_quote[:40])  # First 40 chars

    if idx < 0:
        return None  # "Context not available"

    # Map normalized index back to original transcript position
    # Extract context
    start = max(0, idx - context_chars)
    end = min(len(transcript), idx + len(quote) + context_chars)

    return {
        'contextBefore': transcript[start:idx],
        'contextAfter': transcript[idx + len(quote):end],
        'callTitle': call_title
    }
```

---

## Resolved Questions

1. **Speaker labels** — YES, resolve to real names using participant data from batch files. Map `[Speaker ID]` to customer/BioRender names.
2. **Popout style** — Modal overlay (centered, with backdrop, dismissible via X or click-outside).
3. **Context size** — 1000 chars each side (bumped from 500 for more generous context).

## Open Questions

1. **6% unmatched snippets** — 85 snippets can't be found in transcripts (likely due to extraction normalization). Show "Context not available" or try fuzzy matching?

2. **Multiple snippets from same call** — If an entity has 3 snippets from call X, and user expands all 3, should they share one transcript view with 3 highlights? Or independent popouts?

3. **Speaker ID resolution** — The transcript uses numeric speaker IDs (e.g., `7618157350863529944`). Batch data has `participants.biorender_names` and `participants.customer_names` but not a mapping of which ID is which person. May need to infer from speaker patterns or use a best-effort heuristic.

---

## Affected Files

| File | Change |
|------|--------|
| `scripts/integrate_viewer.py` | Add context extraction during build step |
| `public/index.html` | Add expand button, popout UI, highlight rendering |
| `scripts/build_true_auto_map.py` | Possibly — if context needs to be added at map-build stage |

---

## Not In Scope

- Full transcript lazy-load (deferred — add later if 1000 chars isn't enough)
- Fixing broken Gong URLs (separate issue — needs Gong API investigation)
- Transcript search/full-text search across all calls
- Audio playback from transcripts

---

## Next Steps

Run `/workflows:plan` when ready to implement.
