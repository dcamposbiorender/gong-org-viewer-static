---
title: Snippet Context Popout
type: feat
date: 2026-02-12
revised: 2026-02-12 (post-review)
---

# Snippet Context Popout

## Overview

Add an expand button to each snippet that opens a modal overlay showing ~1000 characters of surrounding transcript text with the snippet quote highlighted. Context windows are pre-computed during the pipeline build and embedded in the viewer data — no API calls at runtime.

## Problem Statement

1. **Snippets are too short** — Users see "we have three bioscience departments" but can't understand the conversation flow
2. **Gong URLs are broken** — All 596 `app.gong.io/call?id=HASH` links don't work
3. **No way to verify attribution** — Can't tell if a snippet was correctly attributed to an entity

---

## Data Validation

| Metric | Value |
|--------|-------|
| Total unique snippets in viewer | 1,382 |
| Snippets found in transcripts (94%) | 1,297 |
| Not found (6%) | 85 |
| Total context window data (1000 chars/side) | ~2.6MB |
| Current index.html | 4.4MB |
| Projected index.html | ~7.0MB |
| Gzipped total | ~2MB (acceptable) |

---

## Review Findings Applied

| Finding | Source | Action |
|---------|--------|--------|
| Drop speaker resolution heuristic | Simplicity | Done — replace with `re.sub(r'\[Speaker \d+\]', '[Speaker]', text)` |
| Use full quote match, not 40-char prefix | Data Integrity | Done — match up to 1000 chars of normalized quote |
| Add `...` to truncated context boundaries | Data Integrity | Done |
| Log context extraction failures | Data Integrity | Done — write `{company}_context_failures.json` |
| Simplify to ~30 lines of core Python | Simplicity | Done |
| 4 tests, not 10+ | Simplicity | Done |
| Add Escape key to close modal | Architecture | Done |
| textContent for all transcript text (XSS) | Architecture | Done |

---

## Implementation Phases

### Phase 1: Pipeline — Context Extraction (`scripts/integrate_viewer.py`)

**1a. Load transcripts**

```python
def load_transcripts(company: str) -> dict:
    """Load all transcripts for a company from batches_enriched/.
    Returns: { call_id: { 'text': str, 'title': str } }
    """
    transcripts = {}
    batch_dir = Path(f"batches_enriched/{company}")
    if not batch_dir.exists():
        print(f"  Warning: No batches_enriched/{company} directory")
        return transcripts

    for batch_file in sorted(batch_dir.glob("batch_*.json")):
        with open(batch_file) as f:
            batch = json.load(f)
        for call in batch.get('calls', []):
            transcripts[call['call_id']] = {
                'text': call.get('transcript_text', ''),
                'title': call.get('call_title', '')
            }
    return transcripts
```

**1b. Find context with full quote match**

```python
def find_context(quote: str, transcript_data: dict, context_chars: int = 1000) -> dict | None:
    """Find snippet quote in transcript and extract surrounding context.
    Uses full normalized quote match (up to 1000 chars), not prefix.
    """
    text = transcript_data['text']
    if not text or not quote:
        return None

    norm_text = re.sub(r'\s+', ' ', text.lower())
    norm_quote = re.sub(r'\s+', ' ', quote.lower().strip())

    # Try full quote match first (up to 1000 chars)
    search_key = norm_quote[:1000]
    idx = norm_text.find(search_key)

    if idx < 0:
        return None

    # Strip speaker IDs for readability
    start = max(0, idx - context_chars)
    end = min(len(text), idx + len(search_key) + context_chars)

    before = re.sub(r'\[Speaker \d+\]', '[Speaker]', text[start:idx])
    after = re.sub(r'\[Speaker \d+\]', '[Speaker]', text[idx + len(search_key):end])

    # Add ellipsis if truncated
    if start > 0:
        before = '...' + before
    if end < len(text):
        after = after + '...'

    return {
        'contextBefore': before,
        'contextAfter': after,
        'callTitle': transcript_data.get('title', '')
    }
```

**1c. Integrate into convert_node_for_viewer()**

After building each snippet object (~line 387 in integrate_viewer.py):

```python
# After building viewer_snippet dict:
if transcripts and snippet.get('callId') in transcripts:
    context = find_context(viewer_snippet['quote'], transcripts[snippet['callId']])
    if context:
        viewer_snippet['contextBefore'] = context['contextBefore']
        viewer_snippet['contextAfter'] = context['contextAfter']
        viewer_snippet['callTitle'] = context['callTitle']
    else:
        failed_snippets.append({
            'company': company,
            'callId': snippet.get('callId', ''),
            'quote': viewer_snippet['quote'][:60]
        })
```

**1d. Write failure report**

After processing all snippets for a company:

```python
if failed_snippets:
    failures_path = output_dir / company / "context_failures.json"
    failures_path.parent.mkdir(parents=True, exist_ok=True)
    with open(failures_path, 'w') as f:
        json.dump(failed_snippets, f, indent=2)
    print(f"  Context failures: {len(failed_snippets)} (see {failures_path})")

print(f"  Context added to {matched_count} of {total_count} snippets ({100*matched_count//max(total_count,1)}%)")
```

**Acceptance criteria:**
- [ ] `load_transcripts()` loads all calls from `batches_enriched/{company}/`
- [ ] `find_context()` uses full normalized quote (up to 1000 chars), not prefix
- [ ] Context windows are 1000 chars each side
- [ ] Speaker IDs stripped to `[Speaker]` (no name heuristic)
- [ ] Truncated context has `...` prefix/suffix
- [ ] Unmatched snippets logged to `{company}/context_failures.json`
- [ ] Pipeline prints stats: "Context added to X of Y snippets (N%)"
- [ ] 94%+ match rate maintained

**Test: `tests/test_snippet_context.py`**
```python
def test_find_context_found():
    """Finds full quote in transcript and returns surrounding context"""

def test_find_context_not_found():
    """Returns None for quotes not in transcript"""

def test_speaker_ids_stripped():
    """[Speaker 123456] replaced with [Speaker] in context"""

def test_ellipsis_added():
    """Context has ... prefix when truncated at start, ... suffix when truncated at end"""
```

---

### Phase 2: Viewer — Context Popout UI (`public/index.html`)

**2a. Add Context button to snippet card (~line 98817)**

After the Gong link in the snippet-attribution div:

```javascript
${s.contextBefore !== undefined ? `
  <button class="snippet-context-btn" data-snippet-idx="${sortedIdx}">📄 Context</button>
` : ''}
```

Attach click handler via event delegation after `content.innerHTML = html`:

```javascript
content.querySelectorAll('.snippet-context-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    showSnippetContext(parseInt(btn.dataset.snippetIdx));
  });
});
```

**2b. Add snippet context modal HTML (near line 2000)**

```html
<div class="resolve-modal" id="snippetContextModal">
  <div class="resolve-modal-content" style="max-width: 700px;">
    <div class="resolve-modal-header">
      <div>
        <h3 id="snippetContextTitle" style="margin: 0;">Call Context</h3>
        <div id="snippetContextMeta" style="font-size: 12px; color: #666; margin-top: 4px;"></div>
      </div>
      <button class="changes-modal-close" onclick="closeSnippetContextModal()">&times;</button>
    </div>
    <div class="resolve-modal-body" id="snippetContextBody"
      style="font-family: 'Georgia', serif; line-height: 1.7; font-size: 14px; max-height: 60vh; overflow-y: auto;">
    </div>
  </div>
</div>
```

**2c. CSS**

```css
.snippet-context-btn {
  background: none;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  color: #4b5563;
  margin-left: 8px;
}
.snippet-context-btn:hover { background: #f3f4f6; border-color: #9ca3af; }
.snippet-context-highlight {
  background: #fef3c7;
  border-left: 3px solid #f59e0b;
  padding: 8px 12px;
  margin: 8px 0;
  border-radius: 0 4px 4px 0;
}
.snippet-context-text { color: #374151; white-space: pre-wrap; }
```

**2d. JavaScript — all text via textContent (XSS safe)**

```javascript
function showSnippetContext(snippetIdx) {
  const node = selectedNode;
  if (!node) return;
  const snippets = typeof getNodeSnippets === 'function'
    ? getNodeSnippets(node) : (node.snippets || []);
  const s = snippets[snippetIdx];
  if (!s || s.contextBefore === undefined) {
    showToast('Context not available for this snippet', 'info');
    return;
  }

  document.getElementById('snippetContextTitle').textContent = s.callTitle || 'Call Context';
  document.getElementById('snippetContextMeta').textContent =
    `${s.date || ''}  •  ${s.customerName || ''} ${s.internalName ? '/ ' + s.internalName : ''}`;

  const body = document.getElementById('snippetContextBody');
  body.innerHTML = '';

  if (s.contextBefore) {
    const el = document.createElement('div');
    el.className = 'snippet-context-text';
    el.textContent = s.contextBefore;
    body.appendChild(el);
  }

  const highlight = document.createElement('div');
  highlight.className = 'snippet-context-highlight';
  highlight.textContent = s.quote;
  body.appendChild(highlight);

  if (s.contextAfter) {
    const el = document.createElement('div');
    el.className = 'snippet-context-text';
    el.textContent = s.contextAfter;
    body.appendChild(el);
  }

  document.getElementById('snippetContextModal').classList.add('active');
}

function closeSnippetContextModal() {
  document.getElementById('snippetContextModal').classList.remove('active');
}

// Close on backdrop click + Escape key
document.getElementById('snippetContextModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'snippetContextModal') closeSnippetContextModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSnippetContextModal();
});
```

**Acceptance criteria:**
- [ ] "📄 Context" button on snippets with context data
- [ ] No button on snippets without context (6% unmatched)
- [ ] Modal shows context before + highlighted quote + context after
- [ ] Call title and date in header
- [ ] Dismissible via X, backdrop click, Escape key
- [ ] Speaker labels show `[Speaker]` (numeric IDs stripped)
- [ ] All text via `textContent` (XSS safe)
- [ ] Follows `.resolve-modal` pattern

---

## Affected Files

| File | Change | Lines (approx) |
|------|--------|----------------|
| `scripts/integrate_viewer.py` | `load_transcripts()`, `find_context()`, integration, failure logging | +80 |
| `public/index.html` | Context button, modal HTML, CSS, JS | +80 |
| `tests/test_snippet_context.py` | **New** — 4 tests | +40 |

---

## Not In Scope

- Full transcript lazy-load (deferred)
- Fixing broken Gong URLs (separate issue)
- Speaker name resolution (would need Gong API speaker mapping)
- Transcript search / full-text search
- Smart boundary snapping (sentence/speaker turn boundaries)

---

## Success Metrics

- [ ] 94%+ of snippets have context available
- [ ] Context modal shows readable transcript with highlighted quote
- [ ] No XSS vulnerabilities
- [ ] Pipeline completes in reasonable time
- [ ] index.html grows by ~2.6MB (acceptable)
