---
title: "XSS via Inline onclick with Single Quotes in Data"
category: ui-bugs
tags: [XSS, security, onclick, addEventListener, escapeHtml]
module: viewer
date: 2026-02-12
severity: high
symptoms:
  - Alias names with apostrophes break onclick handlers
  - Potential script injection via entity names
---

# XSS via Inline onclick with Single Quotes in Data

## Problem

Alias chip rendering used inline `onclick` with `escapeHtml()`:

```javascript
// VULNERABLE: escapeHtml doesn't escape single quotes
chip.innerHTML = `
  <span onclick="removeAlias('${node.id}', '${escapeHtml(alias)}')">×</span>
`;
```

If alias = `O'Brien Group`, this produces:
```html
<span onclick="removeAlias('nodeId', 'O'Brien Group')">×</span>
```
— a syntax error at best, script injection at worst.

## Root Cause

`escapeHtml()` (which uses `textContent`/`innerHTML` swap) escapes `<`, `>`, `&`, `"` but **not single quotes** (`'`). Inline `onclick` attributes delimited by single quotes are vulnerable.

## Solution

Use `addEventListener` instead of inline handlers:

```javascript
const removeBtn = document.createElement('span');
removeBtn.style.cssText = 'cursor: pointer; margin-left: 4px; color: #666;';
removeBtn.textContent = '\u00d7';
removeBtn.addEventListener('click', () => removeAlias(node.id, alias));
chip.appendChild(removeBtn);
```

For all transcript/context text, use `textContent` (not `innerHTML`):

```javascript
const el = document.createElement('div');
el.textContent = s.contextBefore;  // Safe: renders as literal string
body.appendChild(el);
```

## Prevention

**Rules for this codebase:**
1. Never use inline `onclick` with user-controlled data
2. Always use `addEventListener` for click handlers on dynamic content
3. Use `textContent` for all transcript/quote/alias text
4. Reserve `innerHTML` for static HTML templates only (no user data interpolation)

**Grep check:**
```bash
# Should return 0 results for user-controlled data in onclick
grep -n "onclick=.*entityMerges\|onclick=.*alias\|onclick=.*quote" public/index.html
```
