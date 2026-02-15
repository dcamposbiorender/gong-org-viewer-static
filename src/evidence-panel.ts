// Evidence panel for Manual Map nodes — shows snippets, contacts, size chips

import { currentCompany, sizeOverrides, matchReviewState } from './state';
import { escapeHtml, sanitizeUrl, boldSizeMentions } from './utils';
import { getDisplaySize, findNodeParent } from './tree-ops';
import { getSizeOverrideKey } from './state';
import { getFieldValue, hasMatchReviewData } from './kv';
import { setManualEvidenceSnippets, showManualSnippetContext } from './snippet-context';

/** Get approved match review items for a manual node. */
export function getApprovedMatchesForNode(company: string, nodeName: string): any[] {
  if (!hasMatchReviewData(company)) return [];
  if (!matchReviewState[company]?.approved) return [];

  const approvedItems: any[] = [];
  const items = MATCH_REVIEW_DATA?.companies[company]?.items || [];

  Object.entries(matchReviewState[company].approved).forEach(([itemId, approval]: [string, any]) => {
    if (approval.manualNode === nodeName) {
      const item = items.find((i: any) => i.id === itemId);
      if (item) approvedItems.push(item);
    }
  });

  return approvedItems;
}

// Lazy imports for functions used in innerHTML onclick handlers
// These will be registered from init.ts
let _handleSizeChipClick: ((event: Event, nodeId: string, sizeIdx: number, snippetIdx: number) => void) | null = null;
let _handleTeamSizeInputChange: ((nodeId: string, value: string) => void) | null = null;
let _showAddChildModal: ((parentId: string) => void) | null = null;
let _confirmDeleteEntity: ((nodeId: string) => void) | null = null;
let _clearSizeOverride: ((nodeId: string, company?: string) => void) | null = null;

export function registerEvidenceDeps(deps: {
  handleSizeChipClick: (event: Event, nodeId: string, sizeIdx: number, snippetIdx: number) => void;
  handleTeamSizeInputChange: (nodeId: string, value: string) => void;
  showAddChildModal: (parentId: string) => void;
  confirmDeleteEntity: (nodeId: string) => void;
  clearSizeOverride: (nodeId: string, company?: string) => void;
}): void {
  _handleSizeChipClick = deps.handleSizeChipClick;
  _handleTeamSizeInputChange = deps.handleTeamSizeInputChange;
  _showAddChildModal = deps.showAddChildModal;
  _confirmDeleteEntity = deps.confirmDeleteEntity;
  _clearSizeOverride = deps.clearSizeOverride;
}

export function showManualNodeEvidence(node: any): void {
  const evidence = node.gongEvidence || {};
  const snippets = [...(evidence.snippets || [])];
  const matchedContacts = evidence.matchedContacts || [];
  let sizeMentions = [...(evidence.sizeMentions || [])];

  // Add evidence from approved matches
  const approvedMatches = getApprovedMatchesForNode(currentCompany, node.name);
  approvedMatches.forEach((match: any) => {
    if (match.snippet) {
      snippets.push({
        date: match.snippet_date,
        quote: match.snippet,
        internalName: match.person_name,
        customerName: null,
        gongUrl: null,
        entityName: match.gong_entity + ' (approved match)',
      });
    }
    if (match.team_size) {
      sizeMentions.push({
        value: String(match.team_size),
        source: { callDate: match.snippet_date, customerName: match.person_name },
        snippetIndex: snippets.length - 1,
      });
    }
  });

  document.getElementById('evidenceTitleText')!.textContent = `Evidence: ${node.name}`;
  const content = document.getElementById('evidenceContent')!;

  // Size chips
  const sizeOverrideKey = getSizeOverrideKey(currentCompany, node.id);
  const currentSizeOverride = sizeOverrides[sizeOverrideKey];
  let sizeMentionsHtml = '';
  if (sizeMentions.length > 0 || evidence.teamSizes?.length > 0) {
    sizeMentionsHtml = '<div class="size-mentions-row">';
    if (sizeMentions.length > 0) {
      sizeMentions.forEach((m: any, idx: number) => {
        const dateStr = m.source?.callDate ? m.source.callDate.substring(0, 10) : '';
        const customerShort = m.source?.customerName?.split(';')[0]?.split(' ')[0] || '';
        const isSelected = currentSizeOverride?.selectedSizeIndex === idx;
        const selectedClass = isSelected ? ' selected' : '';
        const checkmark = isSelected ? '<span class="size-chip-check">✓</span> ' : '';
        sizeMentionsHtml += `
          <a class="size-chip${selectedClass}" href="#" data-snippet-idx="${m.snippetIndex}" data-size-idx="${idx}"
             title="${isSelected ? '✓ Selected. ' : ''}Click to select. Shift+click to view snippet.">
            ${checkmark}${m.value}
            <span class="size-chip-source">${dateStr}${customerShort ? ' · ' + customerShort : ''}</span>
          </a>`;
      });
    } else if (evidence.teamSizes?.length > 0) {
      evidence.teamSizes.forEach((size: string) => {
        sizeMentionsHtml += `<span class="size-chip untraceable" title="No traceable source">${size}<span class="size-chip-warning">⚠ no source</span></span>`;
      });
    }
    sizeMentionsHtml += '</div>';
  }

  // Team size input
  const currentDisplayedSize = getDisplaySize(node, currentCompany) || '';
  const currentSizeNumber = currentSizeOverride?.customValue ||
    (currentDisplayedSize ? String(currentDisplayedSize).replace(/[^\d]/g, '') : '');

  const teamSizeInputHtml = `
    <div class="team-size-override">
      <span class="team-size-override-label">Team size</span>
      <input type="text" class="team-size-override-input" id="teamSizeInput-${node.id}"
             value="${currentSizeNumber}" placeholder="—"
             title="Enter team size or click a mention below to populate">
      <span class="team-size-override-hint">Enter or click below</span>
    </div>`;

  const isRoot = !findNodeParent(MANUAL_DATA[currentCompany]?.root, node.id);

  let html = `
    <div class="evidence-entity-info">
      <h4>${escapeHtml(node.name)}</h4>
      <div class="evidence-info-row"><span class="evidence-info-label">Type</span><span>${escapeHtml(node.type || 'unknown')}</span></div>
      <div class="evidence-info-row"><span class="evidence-info-label">Status</span>
        <span style="color: ${evidence.status === 'supported' ? '#059669' : evidence.status === 'conflicting' ? '#dc2626' : '#888'}">
          ${escapeHtml(evidence.status || 'unverified')}${approvedMatches.length > 0 ? ` (+${approvedMatches.length} approved)` : ''}
        </span></div>
      <div class="evidence-info-row"><span class="evidence-info-label">Mentions</span><span>${(evidence.totalMentions || 0) + snippets.length - (evidence.snippets?.length || 0)}</span></div>
      ${teamSizeInputHtml}
      ${sizeMentionsHtml}
      ${node.sites?.length > 0 ? `<div class="evidence-info-row"><span class="evidence-info-label">Sites</span><span>${node.sites.map((s: string) => escapeHtml(s)).join(', ')}</span></div>` : ''}
      <div class="entity-crud-buttons" style="margin-top: 12px; display: flex; gap: 8px;">
        <button class="add-child-btn" data-parent-id="${node.id}" style="flex: 1; padding: 6px 12px; font-size: 12px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer;">+ Add Child</button>
        ${!isRoot ? `<button class="delete-entity-btn" data-node-id="${node.id}" style="flex: 1; padding: 6px 12px; font-size: 12px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer;">Delete</button>` : ''}
      </div>
    </div>`;

  // Contacts
  if (matchedContacts.length > 0) {
    html += '<div class="evidence-contacts" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e0e0e0;"><h5 style="margin: 0 0 8px; font-size: 12px; color: #666;">People</h5>';
    matchedContacts.forEach((c: any) => {
      html += `<div style="padding: 6px 0; border-bottom: 1px solid #eee; font-size: 12px;">
        <strong>${escapeHtml(c.name || '')}</strong>${c.title ? `<span style="color: #666;"> - ${escapeHtml(c.title)}</span>` : ''}
        ${c.isDecisionMaker ? '<span style="color: #059669; font-size: 10px; margin-left: 6px;">(Decision Maker)</span>' : ''}
      </div>`;
    });
    html += '</div>';
  }

  // Snippets
  html += '<div class="evidence-snippets">';
  if (snippets.length === 0) {
    html += '<div class="evidence-empty">No Gong snippets for this entity</div>';
  } else {
    snippets.forEach((s: any, idx: number) => {
      html += `
        <div class="snippet-card" data-snippet-orig-idx="${idx}">
          <div class="snippet-date">
            ${s.gongUrl ? `<a href="${sanitizeUrl(s.gongUrl)}" target="_blank" class="snippet-link" style="color: #2563eb; text-decoration: none;">${escapeHtml(s.date || '')} ↗</a>` : escapeHtml(s.date || '')}
          </div>
          <div class="snippet-quote">"${boldSizeMentions(escapeHtml(s.quote))}"</div>
          <div class="snippet-attribution">
            <span>
              ${s.internalName ? `Internal: ${escapeHtml(s.internalName)}` : ''}
              ${s.internalName && s.customerName ? ' | ' : ''}
              ${s.customerName ? `Customer: ${escapeHtml(s.customerName)}` : ''}
              ${!s.internalName && !s.customerName ? '—' : ''}
            </span>
            ${s.gongUrl ? `<a href="${sanitizeUrl(s.gongUrl)}" class="snippet-link" target="_blank">↗ Gong</a>` : ''}
          </div>
          ${s.entityName ? `<div class="snippet-entity" style="font-size: 11px; color: #888; margin-top: 4px;">from: ${escapeHtml(s.entityName)}</div>` : ''}
          ${s.contextBefore !== undefined ? `<button class="snippet-context-btn" data-idx="${idx}">📄 Context</button>` : ''}
        </div>`;
    });
    setManualEvidenceSnippets(snippets);
  }
  html += '</div>';
  content.innerHTML = html;

  // Attach event listeners (no inline onclick)
  content.querySelectorAll('.snippet-context-btn').forEach(btn => {
    btn.addEventListener('click', () => showManualSnippetContext(parseInt((btn as HTMLElement).dataset.idx!)));
  });
  content.querySelectorAll('.size-chip[data-size-idx]').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const sizeIdx = parseInt((chip as HTMLElement).dataset.sizeIdx!);
      const snippetIdx = parseInt((chip as HTMLElement).dataset.snippetIdx!);
      _handleSizeChipClick?.(e, node.id, sizeIdx, snippetIdx);
    });
  });
  content.querySelector('.add-child-btn')?.addEventListener('click', () => _showAddChildModal?.(node.id));
  content.querySelector('.delete-entity-btn')?.addEventListener('click', () => _confirmDeleteEntity?.(node.id));

  // Team size input
  const sizeInput = content.querySelector(`#teamSizeInput-${node.id}`) as HTMLInputElement;
  if (sizeInput) {
    sizeInput.addEventListener('change', () => _handleTeamSizeInputChange?.(node.id, sizeInput.value));
    sizeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sizeInput.blur(); });
  }
}
