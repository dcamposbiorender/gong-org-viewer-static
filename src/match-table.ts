// Match review table rendering with filters

import { currentCompany, matchReviewState } from './state';
import { escapeHtml, mrTruncateSnippet } from './utils';
import { getManualMapOptions, initMatchReviewState, hasMatchReviewData, getItemStatus } from './kv';
import { approveMatch, rejectMatch, resetMatchItem, manualMatch } from './match-actions';

// Entity picker state
let entityPickerContext: { company: string | null; itemId: string | null } = { company: null, itemId: null };

function showEntityPickerModal(company: string, itemId: string): void {
  entityPickerContext = { company, itemId };
  const modal = document.getElementById('entityPickerModal');
  const list = document.getElementById('entityPickerList');
  const search = document.getElementById('entityPickerSearch') as HTMLInputElement;

  search.value = '';
  const options = getManualMapOptions(company);

  if (options.length === 0) {
    list!.innerHTML = `<div style="padding: 20px; text-align: center; color: #999;">No Manual Map available for ${escapeHtml(company)}.</div>`;
  } else {
    renderEntityPickerList(options);
  }

  modal!.style.display = 'flex';
  search.focus();
}

function renderEntityPickerList(options: Array<{ id: string; name: string; path: string }>): void {
  const list = document.getElementById('entityPickerList')!;
  list.innerHTML = '';
  options.forEach(opt => {
    const item = document.createElement('div');
    item.className = 'entity-picker-item';
    item.style.cssText = 'padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #eee;';
    item.innerHTML = `<div style="font-weight: 500;">${escapeHtml(opt.name)}</div><div style="font-size: 11px; color: #888; margin-top: 2px;">${escapeHtml(opt.path)}</div>`;
    item.addEventListener('click', () => selectEntityForMatch(opt.name, opt.path));
    item.addEventListener('mouseover', () => item.style.background = '#f0f9ff');
    item.addEventListener('mouseout', () => item.style.background = 'transparent');
    list.appendChild(item);
  });
}

function filterEntityPickerList(): void {
  const search = (document.getElementById('entityPickerSearch') as HTMLInputElement).value.toLowerCase();
  const options = getManualMapOptions(entityPickerContext.company || '');
  const filtered = options.filter(opt => opt.name.toLowerCase().includes(search) || opt.path.toLowerCase().includes(search));
  if (filtered.length === 0) {
    document.getElementById('entityPickerList')!.innerHTML = `<div style="padding: 20px; text-align: center; color: #999;">No entities match "${escapeHtml(search)}"</div>`;
  } else {
    renderEntityPickerList(filtered);
  }
}

function selectEntityForMatch(manualNode: string, manualPath: string): void {
  const { company, itemId } = entityPickerContext;
  if (!company || !itemId) return;
  manualMatch(company, itemId, manualNode, manualPath);
  closeEntityPickerModal();
  renderMatchReview(company);
}

export function closeEntityPickerModal(): void {
  document.getElementById('entityPickerModal')!.style.display = 'none';
  entityPickerContext = { company: null, itemId: null };
}

export function renderMatchReview(company?: string): void {
  const targetCompany = company || currentCompany;

  const mrTotalCount = document.getElementById('mrTotalCount');
  const mrWithSuggestions = document.getElementById('mrWithSuggestions');
  const mrApprovedCount = document.getElementById('mrApprovedCount');
  const mrRejectedCount = document.getElementById('mrRejectedCount');
  const tbody = document.getElementById('matchReviewBody');

  if (!mrTotalCount || !tbody) return;

  if (!hasMatchReviewData(targetCompany)) {
    mrTotalCount.textContent = '0';
    mrWithSuggestions!.textContent = '0';
    mrApprovedCount!.textContent = '0';
    mrRejectedCount!.textContent = '0';
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">No match review data available for ${escapeHtml(targetCompany)}</td></tr>`;
    return;
  }

  initMatchReviewState(targetCompany);
  const data = MATCH_REVIEW_DATA!.companies[targetCompany];
  const items = data.items || [];

  const searchFilter = (document.getElementById('mrSearchFilter') as HTMLInputElement)?.value.toLowerCase() ?? '';
  const statusFilter = (document.getElementById('mrStatusFilter') as HTMLSelectElement)?.value ?? '';
  const confidenceFilter = (document.getElementById('mrConfidenceFilter') as HTMLSelectElement)?.value ?? '';

  const filteredItems = items.filter((item: any) => {
    if (searchFilter) {
      const searchText = [item.gong_entity, item.gong_parent, item.snippet, item.person_name, item.llm_suggested_match?.manual_node_name].filter(Boolean).join(' ').toLowerCase();
      if (!searchText.includes(searchFilter)) return false;
    }
    const status = getItemStatus(targetCompany, item.id);
    if (statusFilter && status !== statusFilter) return false;
    if (confidenceFilter) {
      const confidence = item.llm_suggested_match?.confidence || null;
      if (confidenceFilter === 'none') { if (item.llm_suggested_match) return false; }
      else { if (confidence !== confidenceFilter) return false; }
    }
    return true;
  });

  const approved = Object.keys(matchReviewState[targetCompany]?.approved || {}).length;
  const rejected = Object.keys(matchReviewState[targetCompany]?.rejected || {}).length;
  const manual = Object.keys(matchReviewState[targetCompany]?.manual || {}).length;

  mrTotalCount.textContent = String(items.length);
  mrWithSuggestions!.textContent = String((data as any).total_with_suggestions || 0);
  mrApprovedCount!.textContent = String(approved + manual);
  mrRejectedCount!.textContent = String(rejected);

  if (filteredItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">No items match the current filters</td></tr>`;
    return;
  }

  // Render rows with addEventListener instead of inline onclick
  tbody.innerHTML = '';
  filteredItems.forEach((item: any) => {
    const status = getItemStatus(targetCompany, item.id);
    const suggestion = item.llm_suggested_match;
    const stateData = matchReviewState[targetCompany]?.approved[item.id] || matchReviewState[targetCompany]?.manual[item.id] || {};
    const displayedMatch = (status === 'approved' || status === 'manual')
      ? { manual_node_name: stateData.manualNode, manual_node_path: stateData.manualPath }
      : suggestion;

    const tr = document.createElement('tr');
    tr.className = `status-${status}`;
    tr.dataset.itemId = item.id;
    tr.innerHTML = `
      <td><div class="mr-snippet" title="${escapeHtml(item.snippet || '')}">"${escapeHtml(mrTruncateSnippet(item.snippet))}"</div>${item.snippet_date ? `<div class="mr-gong-size">${escapeHtml(item.snippet_date)}</div>` : ''}</td>
      <td><div class="mr-person"><div class="mr-person-name">${escapeHtml(item.person_name || 'Unknown')}</div>${item.person_email ? `<div class="mr-person-email">${escapeHtml(item.person_email)}</div>` : ''}</div></td>
      <td><div class="mr-gong-entity">${escapeHtml(item.gong_entity || '')}</div>${item.gong_parent ? `<div class="mr-gong-parent">Parent: ${escapeHtml(item.gong_parent)}</div>` : ''}${item.team_size ? `<div class="mr-gong-size">Size: ${escapeHtml(item.team_size)}</div>` : ''}</td>
      <td>${displayedMatch?.manual_node_name ? `<div class="mr-suggestion">${escapeHtml(displayedMatch.manual_node_name)}</div><div class="mr-suggestion-path">${escapeHtml(displayedMatch.manual_node_path || '')}</div>${suggestion?.confidence ? `<span class="mr-confidence ${suggestion.confidence}">${escapeHtml(suggestion.confidence)}</span>` : ''}` : '<div class="mr-no-suggestion">No suggestion</div>'}</td>
      <td><div class="mr-reasoning">${escapeHtml(suggestion?.reasoning || '')}</div></td>
      <td><div class="mr-actions"></div></td>`;

    // Build action buttons with addEventListener
    const actionsDiv = tr.querySelector('.mr-actions')!;
    if (status === 'pending') {
      if (suggestion?.manual_node_name) {
        const approveBtn = document.createElement('button');
        approveBtn.className = 'mr-btn mr-btn-approve';
        approveBtn.textContent = 'Approve';
        approveBtn.addEventListener('click', () => approveMatch(targetCompany, item.id, suggestion.manual_node_name, suggestion.manual_node_path || ''));
        actionsDiv.appendChild(approveBtn);

        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'mr-btn mr-btn-reject';
        rejectBtn.textContent = 'Reject';
        rejectBtn.addEventListener('click', () => rejectMatch(targetCompany, item.id));
        actionsDiv.appendChild(rejectBtn);
      }
      const pickBtn = document.createElement('button');
      pickBtn.className = 'mr-btn';
      pickBtn.textContent = 'Pick Entity';
      pickBtn.title = 'Pick a different entity';
      pickBtn.style.marginTop = '4px';
      pickBtn.addEventListener('click', () => showEntityPickerModal(targetCompany, item.id));
      actionsDiv.appendChild(pickBtn);
    } else {
      const badge = document.createElement('span');
      badge.className = `mr-status-badge ${status}`;
      badge.textContent = status;
      actionsDiv.appendChild(badge);

      const resetBtn = document.createElement('button');
      resetBtn.className = 'mr-btn';
      resetBtn.textContent = 'Reset';
      resetBtn.addEventListener('click', () => resetMatchItem(targetCompany, item.id));
      actionsDiv.appendChild(resetBtn);

      const pickBtn = document.createElement('button');
      pickBtn.className = 'mr-btn';
      pickBtn.textContent = 'Pick Entity';
      pickBtn.title = 'Change entity';
      pickBtn.style.marginTop = '4px';
      pickBtn.addEventListener('click', () => showEntityPickerModal(targetCompany, item.id));
      actionsDiv.appendChild(pickBtn);
    }

    tbody.appendChild(tr);
  });
}

/** Initialize event listeners for entity picker (call once). */
export function initMatchTableListeners(): void {
  document.getElementById('entityPickerSearch')?.addEventListener('input', filterEntityPickerList);
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.mr-manual-input-wrap')) {
      document.querySelectorAll('.mr-manual-dropdown.show').forEach(d => d.classList.remove('show'));
    }
  });
}
