// Match Review: rendering and user actions

// State for entity picker
let entityPickerContext = { company: null, itemId: null };

// Show entity picker modal
function showEntityPickerModal(company, itemId) {
  entityPickerContext = { company, itemId };

  const modal = document.getElementById('entityPickerModal');
  const list = document.getElementById('entityPickerList');
  const search = document.getElementById('entityPickerSearch');

  // Clear search
  search.value = '';

  // Get manual map options
  const options = getManualMapOptions(company);

  if (options.length === 0) {
    list.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #999;">
        No Manual Map available for ${escapeHtml(company)}.<br>
        <small>Use "Graduate" in Auto mode to create one.</small>
      </div>
    `;
  } else {
    renderEntityPickerList(options);
  }

  modal.style.display = 'flex';
  search.focus();
}

// Render the entity picker list
function renderEntityPickerList(options) {
  const list = document.getElementById('entityPickerList');
  list.innerHTML = options.map(opt => `
    <div class="entity-picker-item" onclick="selectEntityForMatch('${opt.name.replace(/'/g, "\\'")}', '${opt.path.replace(/'/g, "\\'")}')"
         style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;"
         onmouseover="this.style.background='#f0f9ff'" onmouseout="this.style.background='transparent'">
      <div style="font-weight: 500;">${escapeHtml(opt.name)}</div>
      <div style="font-size: 11px; color: #888; margin-top: 2px;">${escapeHtml(opt.path)}</div>
    </div>
  `).join('');
}

// Filter entity picker list
function filterEntityPickerList() {
  const search = document.getElementById('entityPickerSearch').value.toLowerCase();
  const options = getManualMapOptions(entityPickerContext.company);

  const filtered = options.filter(opt =>
    opt.name.toLowerCase().includes(search) ||
    opt.path.toLowerCase().includes(search)
  );

  if (filtered.length === 0) {
    document.getElementById('entityPickerList').innerHTML = `
      <div style="padding: 20px; text-align: center; color: #999;">
        No entities match "${escapeHtml(search)}"
      </div>
    `;
  } else {
    renderEntityPickerList(filtered);
  }
}

// Select an entity and create a manual match
function selectEntityForMatch(manualNode, manualPath) {
  const { company, itemId } = entityPickerContext;

  // Create manual match (similar to approve but tracks as manual selection)
  initMatchReviewState(company);
  delete matchReviewState[company].rejected[itemId];
  delete matchReviewState[company].approved[itemId];
  const decision = { manualNode, manualPath, manuallySelectedAt: new Date().toISOString() };
  matchReviewState[company].manual[itemId] = decision;
  saveMatchReviewState(company);
  saveMatchReviewItemToKV(company, itemId, decision, 'manual');

  closeEntityPickerModal();
  renderMatchReview(company);
}

// Close entity picker modal
function closeEntityPickerModal() {
  document.getElementById('entityPickerModal').style.display = 'none';
  entityPickerContext = { company: null, itemId: null };
}

// ===== END ENTITY PICKER =====

// ===== MANAGE ENTITIES MODAL =====


function approveMatch(company, itemId, manualNode, manualPath) {
  initMatchReviewState(company);
  delete matchReviewState[company].rejected[itemId];
  delete matchReviewState[company].manual[itemId];
  const decision = { manualNode, manualPath, approvedAt: new Date().toISOString() };
  matchReviewState[company].approved[itemId] = decision;
  saveMatchReviewState(company);
  saveMatchReviewItemToKV(company, itemId, decision, 'approved');
  renderMatchReview(company);
}

// Reject a match suggestion
function rejectMatch(company, itemId) {
  initMatchReviewState(company);
  delete matchReviewState[company].approved[itemId];
  delete matchReviewState[company].manual[itemId];
  const decision = { rejectedAt: new Date().toISOString() };
  matchReviewState[company].rejected[itemId] = decision;
  saveMatchReviewState(company);
  saveMatchReviewItemToKV(company, itemId, decision, 'rejected');
  renderMatchReview(company);
}

// Manually assign a match
function manualMatch(company, itemId, manualNode, manualPath) {
  initMatchReviewState(company);
  delete matchReviewState[company].approved[itemId];
  delete matchReviewState[company].rejected[itemId];
  const decision = { manualNode, manualPath, matchedAt: new Date().toISOString() };
  matchReviewState[company].manual[itemId] = decision;
  saveMatchReviewState(company);
  saveMatchReviewItemToKV(company, itemId, decision, 'manual');
  renderMatchReview(company);
}

// Reset item to pending
function resetMatchItem(company, itemId) {
  initMatchReviewState(company);
  delete matchReviewState[company].approved[itemId];
  delete matchReviewState[company].rejected[itemId];
  delete matchReviewState[company].manual[itemId];
  saveMatchReviewState(company);
  deleteMatchReviewItemFromKV(company, itemId);
  renderMatchReview(company);
}

// Manual match dropdown functions
function showManualMatchDropdown(input) {
  const itemId = input.dataset.itemId;
  const dropdown = document.getElementById(`mr-dropdown-${itemId}`);
  if (dropdown) {
    document.querySelectorAll('.mr-manual-dropdown.show').forEach(d => d.classList.remove('show'));
    dropdown.classList.add('show');
    dropdown.querySelectorAll('.mr-manual-option').forEach(opt => opt.style.display = 'block');
  }
}

function filterManualMatchDropdown(input) {
  const itemId = input.dataset.itemId;
  const dropdown = document.getElementById(`mr-dropdown-${itemId}`);
  const filter = input.value.toLowerCase();
  if (dropdown) {
    dropdown.querySelectorAll('.mr-manual-option').forEach(opt => {
      const name = opt.dataset.name.toLowerCase();
      const path = opt.dataset.path.toLowerCase();
      opt.style.display = (name.includes(filter) || path.includes(filter)) ? 'block' : 'none';
    });
  }
}

function selectManualMatch(company, itemId, nodeName, nodePath) {
  const dropdown = document.getElementById(`mr-dropdown-${itemId}`);
  if (dropdown) dropdown.classList.remove('show');
  manualMatch(company, itemId, nodeName, nodePath);
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.mr-manual-input-wrap')) {
    document.querySelectorAll('.mr-manual-dropdown.show').forEach(d => d.classList.remove('show'));
  }
});

// Main render function - ALWAYS pass company explicitly

function renderMatchReview(company) {
  // Fallback to currentCompany if not provided (for backward compat with event handlers)
  const targetCompany = company || currentCompany;

  const mrTotalCount = document.getElementById('mrTotalCount');
  const mrWithSuggestions = document.getElementById('mrWithSuggestions');
  const mrApprovedCount = document.getElementById('mrApprovedCount');
  const mrRejectedCount = document.getElementById('mrRejectedCount');
  const tbody = document.getElementById('matchReviewBody');

  // Check if data exists for this company
  if (!hasMatchReviewData(targetCompany)) {
    // No match review data for this company
    mrTotalCount.textContent = '0';
    mrWithSuggestions.textContent = '0';
    mrApprovedCount.textContent = '0';
    mrRejectedCount.textContent = '0';
    tbody.innerHTML = `
      <tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">
        No match review data available for ${escapeHtml(targetCompany)}
      </td></tr>
    `;
    return;
  }

  // Initialize state for this company
  initMatchReviewState(targetCompany);

  // Get data
  const data = MATCH_REVIEW_DATA.companies[targetCompany];
  const items = data.items || [];

  // Get filter values
  const searchFilter = document.getElementById('mrSearchFilter').value.toLowerCase();
  const statusFilter = document.getElementById('mrStatusFilter').value;
  const confidenceFilter = document.getElementById('mrConfidenceFilter').value;

  // Filter items
  const filteredItems = items.filter(item => {
    // Search filter
    if (searchFilter) {
      const searchText = [
        item.gong_entity,
        item.gong_parent,
        item.snippet,
        item.person_name,
        item.llm_suggested_match?.manual_node_name
      ].filter(Boolean).join(' ').toLowerCase();
      if (!searchText.includes(searchFilter)) return false;
    }
    // Status filter
    const status = getItemStatus(targetCompany, item.id);
    if (statusFilter && status !== statusFilter) return false;
    // Confidence filter
    if (confidenceFilter) {
      const confidence = item.llm_suggested_match?.confidence || null;
      if (confidenceFilter === 'none') {
        if (item.llm_suggested_match) return false;
      } else {
        if (confidence !== confidenceFilter) return false;
      }
    }
    return true;
  });

  // Update stats
  const approved = Object.keys(matchReviewState[targetCompany]?.approved || {}).length;
  const rejected = Object.keys(matchReviewState[targetCompany]?.rejected || {}).length;
  const manual = Object.keys(matchReviewState[targetCompany]?.manual || {}).length;

  mrTotalCount.textContent = items.length;
  mrWithSuggestions.textContent = data.total_with_suggestions || 0;
  mrApprovedCount.textContent = approved + manual;
  mrRejectedCount.textContent = rejected;

  // Get manual map options
  const manualOptions = getManualMapOptions(targetCompany);

  // Render empty state
  if (filteredItems.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">
        No items match the current filters
      </td></tr>
    `;
    return;
  }

  // Render table rows
  tbody.innerHTML = filteredItems.map(item => {
    const status = getItemStatus(targetCompany, item.id);
    const suggestion = item.llm_suggested_match;
    const stateData = matchReviewState[targetCompany]?.approved[item.id] ||
                      matchReviewState[targetCompany]?.manual[item.id] || {};

    const displayedMatch = (status === 'approved' || status === 'manual')
      ? { manual_node_name: stateData.manualNode, manual_node_path: stateData.manualPath }
      : suggestion;

    return `
      <tr class="status-${status}" data-item-id="${item.id}">
        <td>
          <div class="mr-snippet" title="${escapeHtml(item.snippet || '')}">
            "${escapeHtml(mrTruncateSnippet(item.snippet))}"
          </div>
          ${item.snippet_date ? `<div class="mr-gong-size">${escapeHtml(item.snippet_date)}</div>` : ''}
        </td>
        <td>
          <div class="mr-person">
            <div class="mr-person-name">${escapeHtml(item.person_name || 'Unknown')}</div>
            ${item.person_email ? `<div class="mr-person-email">${escapeHtml(item.person_email)}</div>` : ''}
          </div>
        </td>
        <td>
          <div class="mr-gong-entity">${escapeHtml(item.gong_entity || '')}</div>
          ${item.gong_parent ? `<div class="mr-gong-parent">Parent: ${escapeHtml(item.gong_parent)}</div>` : ''}
          ${item.team_size ? `<div class="mr-gong-size">Size: ${escapeHtml(item.team_size)}</div>` : ''}
        </td>
        <td>
          ${displayedMatch?.manual_node_name ? `
            <div class="mr-suggestion">${escapeHtml(displayedMatch.manual_node_name)}</div>
            <div class="mr-suggestion-path">${escapeHtml(displayedMatch.manual_node_path || '')}</div>
            ${suggestion?.confidence ? `<span class="mr-confidence ${suggestion.confidence}">${escapeHtml(suggestion.confidence)}</span>` : ''}
          ` : `
            <div class="mr-no-suggestion">No suggestion</div>
          `}
        </td>
        <td>
          <div class="mr-reasoning">${escapeHtml(suggestion?.reasoning || '')}</div>
        </td>
        <td>
          ${status === 'pending' ? `
            <div class="mr-actions">
              ${suggestion?.manual_node_name ? `
                <button class="mr-btn mr-btn-approve" onclick="approveMatch('${targetCompany}', '${item.id}', '${(suggestion.manual_node_name || '').replace(/'/g, "\\'")}', '${(suggestion.manual_node_path || '').replace(/'/g, "\\'")}')">Approve</button>
                <button class="mr-btn mr-btn-reject" onclick="rejectMatch('${targetCompany}', '${item.id}')">Reject</button>
              ` : ''}
              <button class="mr-btn" onclick="showEntityPickerModal('${targetCompany}', '${item.id}')" title="Pick a different entity" style="margin-top: 4px;">Pick Entity</button>
            </div>
          ` : `
            <div class="mr-actions">
              <span class="mr-status-badge ${status}">${status}</span>
              <button class="mr-btn" onclick="resetMatchItem('${targetCompany}', '${item.id}')">Reset</button>
              <button class="mr-btn" onclick="showEntityPickerModal('${targetCompany}', '${item.id}')" title="Change entity" style="margin-top: 4px;">Pick Entity</button>
            </div>
          `}
        </td>
      </tr>
    `;
  }).join('');

}

// Render manual map tree (horizontal layout matching Auto mode)
