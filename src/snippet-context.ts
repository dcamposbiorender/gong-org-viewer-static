// Snippet context modal with speaker ID resolution

import { showToast } from './utils';

// Stored snippets for manual evidence context lookups
let manualEvidenceSnippets: any[] = [];
export function setManualEvidenceSnippets(snippets: any[]): void { manualEvidenceSnippets = snippets; }

/** Resolve speaker IDs to names using the speaker map. */
function buildSpeakerMap(fullContext: string, snippet: any): Record<string, string> {
  const speakerIdSet = [...new Set((fullContext.match(/\[Speaker (\d+)\]/g) || []).map(m => m.match(/\d+/)![0]))];
  const speakerMap: Record<string, string> = {};

  if (snippet.speakerId && speakerIdSet.length === 2 && speakerIdSet.includes(snippet.speakerId)) {
    const quoteIdx = fullContext.toLowerCase().indexOf(snippet.quote.toLowerCase().substring(0, 40));
    let quoteSpeakerId = snippet.speakerId;
    if (quoteIdx > 0) {
      const before = fullContext.substring(0, quoteIdx);
      const nearestMatch = before.match(/\[Speaker (\d+)\][^[]*$/);
      if (nearestMatch && speakerIdSet.includes(nearestMatch[1])) quoteSpeakerId = nearestMatch[1];
    }
    const otherSpeakerId = speakerIdSet.find(id => id !== quoteSpeakerId);
    const customerFirst = (snippet.customerName || 'Customer').split(';')[0].trim();
    const biorenderFirst = (snippet.internalName || 'BioRender Rep').split(';')[0].trim();
    speakerMap[quoteSpeakerId] = customerFirst;
    if (otherSpeakerId) speakerMap[otherSpeakerId] = biorenderFirst;
  }
  return speakerMap;
}

function resolveSpeakers(text: string, speakerMap: Record<string, string>): string {
  for (const [id, name] of Object.entries(speakerMap)) {
    text = text.replace(new RegExp('\\[Speaker ' + id + '\\]', 'g'), '[' + name + ']');
  }
  const remaining = [...new Set((text.match(/\[Speaker (\d+)\]/g) || []).map(m => m.match(/\d+/)![0]))];
  const labels = 'ABCDEFGH';
  remaining.forEach((id, i) => {
    text = text.replace(new RegExp('\\[Speaker ' + id + '\\]', 'g'), '[Speaker ' + labels[i] + ']');
  });
  return text;
}

function renderContextInModal(s: any): void {
  document.getElementById('snippetContextTitle')!.textContent = s.callTitle || 'Call Context';
  document.getElementById('snippetContextMeta')!.textContent =
    `${s.date || ''}  \u2022  ${s.customerName || ''} ${s.internalName ? '/ ' + s.internalName : ''}`;

  const gongLink = document.getElementById('snippetContextGongLink') as HTMLAnchorElement;
  if (s.gongUrl) { gongLink.href = s.gongUrl; gongLink.style.display = 'inline'; }
  else { gongLink.style.display = 'none'; }

  const fullContext = (s.contextBefore || '') + s.quote + (s.contextAfter || '');
  const speakerMap = buildSpeakerMap(fullContext, s);

  const body = document.getElementById('snippetContextBody')!;
  body.innerHTML = '';

  if (s.contextBefore) {
    const el = document.createElement('div');
    el.className = 'snippet-context-text';
    el.textContent = resolveSpeakers(s.contextBefore, speakerMap);
    body.appendChild(el);
  }

  const highlight = document.createElement('div');
  highlight.className = 'snippet-context-highlight';
  highlight.textContent = s.quote;
  body.appendChild(highlight);

  if (s.contextAfter) {
    const el = document.createElement('div');
    el.className = 'snippet-context-text';
    el.textContent = resolveSpeakers(s.contextAfter, speakerMap);
    body.appendChild(el);
  }

  document.getElementById('snippetContextModal')!.classList.add('active');
}

/** Show context for auto-mode snippet (by sorted index). */
export function showSnippetContext(snippetIdx: number, snippets: any[]): void {
  const sortedSnippets = [...snippets].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const s = sortedSnippets[snippetIdx];
  if (!s || s.contextBefore === undefined) {
    showToast('Context not available for this snippet', 'info');
    return;
  }
  renderContextInModal(s);
}

/** Show context for manual map evidence snippet (by index into manualEvidenceSnippets). */
export function showManualSnippetContext(idx: number): void {
  const s = manualEvidenceSnippets[idx];
  if (!s) return;
  if (s.contextBefore === undefined) {
    showToast('Context not available for this snippet', 'info');
    return;
  }
  renderContextInModal(s);
}

export function closeSnippetContextModal(): void {
  document.getElementById('snippetContextModal')?.classList.remove('active');
}

/** Initialize modal event listeners (call once on startup). */
export function initSnippetContextListeners(): void {
  document.getElementById('snippetContextModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'snippetContextModal') closeSnippetContextModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('snippetContextModal')?.classList.contains('active')) {
      closeSnippetContextModal();
    }
  });
}
