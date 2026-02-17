// Table view rendering with search, sort, and filter

import { currentCompany, currentMode, tableSortKey, tableSortAsc } from './state';
import { escapeHtml, sanitizeUrl, isInDateRange } from './utils';

// Lazy import to avoid circular deps
let _getApprovedMatchesForNode: ((company: string, name: string) => any[]) | null = null;
export function registerTableDeps(fn: (company: string, name: string) => any[]): void {
  _getApprovedMatchesForNode = fn;
}

/** Collect snippets from Manual Map nodes (gongEvidence structure) */
function collectManualMapSnippets(node: any, results: any[] = [], rangeStart?: string, rangeEnd?: string, company?: string): any[] {
  const evidence = node.gongEvidence || {};

  (evidence.snippets || []).filter((s: any) => isInDateRange(s.date, rangeStart, rangeEnd)).forEach((s: any) => {
    results.push({
      entityId: node.id,
      entityName: node.name,
      type: node.type || 'manual',
      confidence: evidence.confidence || 'medium',
      hasOverride: false,
      quote: s.quote || s.text || '',
      date: s.date || s.callDate,
      ae: s.internalName || '',
      bd: '',
      gongUrl: s.gongUrl || '#',
      callId: s.callId,
    });
  });

  // Collect snippets from approved Match Review items
  if (_getApprovedMatchesForNode && company) {
    const approvedMatches = _getApprovedMatchesForNode(company, node.name);
    approvedMatches.forEach((match: any) => {
      if (isInDateRange(match.snippet_date, rangeStart, rangeEnd)) {
        results.push({
          entityId: node.id,
          entityName: node.name,
          type: node.type || 'manual',
          confidence: match.confidence || 'medium',
          hasOverride: false,
          quote: match.snippet_quote || '',
          date: match.snippet_date,
          ae: match.person_name || '',
          bd: '',
          gongUrl: match.gong_url || '#',
          callId: match.call_id,
          isApprovedMatch: true,
        });
      }
    });
  }

  node.children?.forEach((child: any) => collectManualMapSnippets(child, results, rangeStart, rangeEnd, company));
  return results;
}

export function renderTable(rangeStart?: string, rangeEnd?: string): void {
  let snippets: any[];

  if (currentMode === 'manual' && MANUAL_DATA[currentCompany]?.root) {
    snippets = collectManualMapSnippets(MANUAL_DATA[currentCompany].root, [], rangeStart, rangeEnd, currentCompany);
  } else {
    snippets = [];
  }

  const searchTerm = (document.getElementById('tableSearch') as HTMLInputElement)?.value.toLowerCase() ?? '';
  const confFilter = (document.getElementById('confidenceFilter') as HTMLSelectElement)?.value ?? '';
  const typeFilter = (document.getElementById('typeFilter') as HTMLSelectElement)?.value ?? '';

  snippets = snippets.filter(s => {
    if (searchTerm && !`${s.entityName} ${s.quote} ${s.ae || ''} ${s.bd || ''}`.toLowerCase().includes(searchTerm)) return false;
    if (confFilter && s.confidence !== confFilter) return false;
    if (typeFilter && s.type !== typeFilter) return false;
    return true;
  });

  snippets.sort((a, b) => {
    const aVal = tableSortKey === 'entity' ? a.entityName : (a[tableSortKey] || '');
    const bVal = tableSortKey === 'entity' ? b.entityName : (b[tableSortKey] || '');
    if (aVal < bVal) return tableSortAsc ? -1 : 1;
    if (aVal > bVal) return tableSortAsc ? 1 : -1;
    return 0;
  });

  const tableBody = document.getElementById('tableBody');
  if (!tableBody) return;

  if (snippets.length === 0) {
    tableBody.innerHTML = `
      <tr><td colspan="7" style="text-align: center; padding: 40px; color: #888; font-style: italic;">
        No snippets found. Use Match Review to approve entities and add evidence to manual nodes.
      </td></tr>`;
  } else {
    tableBody.innerHTML = snippets.map(s => `
      <tr${s.isApprovedMatch ? ' class="approved-match-row"' : ''}>
        <td><span class="table-entity">${escapeHtml(s.entityName)}</span>${s.isApprovedMatch ? '<span class="table-approved-badge" title="Approved via Match Review">✓</span>' : ''}</td>
        <td class="table-meta">${escapeHtml((s.type || '').replace('_', ' '))}</td>
        <td class="table-quote">"${escapeHtml(s.quote)}"</td>
        <td class="table-meta">${escapeHtml(s.date || '—')}</td>
        <td class="table-meta">${escapeHtml([s.ae, s.bd].filter(Boolean).join(' / ') || '—')}</td>
        <td><span class="table-confidence ${s.confidence}">${escapeHtml(s.confidence)}</span></td>
        <td><a href="${sanitizeUrl(s.gongUrl)}" class="table-link" target="_blank">↗</a></td>
      </tr>`).join('');
  }

  // Update sort indicators
  document.querySelectorAll('.snippets-table th.sortable').forEach(th => {
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = (th as HTMLElement).dataset.sort === tableSortKey ? (tableSortAsc ? '▲' : '▼') : '';
  });
}
