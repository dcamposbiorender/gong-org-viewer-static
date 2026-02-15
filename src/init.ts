// App entry point — imports all modules, wires dependencies, starts the app.
// This is the single <script type="module"> entry in index.html.

import type { ValidAccount } from './types';
import {
  currentCompany, currentMode, currentView, dateRange, matchReviewState,
  overrides, sizeOverrides, conflictResolutions, fieldEdits, entityMerges,
  manualMapOverrides, selectedManualNode, setCurrentCompany, setCurrentMode, setCurrentView,
  setDateRange, setTableSortKey, setTableSortAsc, tableSortKey, tableSortAsc,
} from './state';
import { formatDateShort, getDateFromPercent, isModalOpen } from './utils';
import { kvApiUrl } from './state';
import {
  loadOverrides, loadSizeOverrides, loadMatchReviewState, loadFieldEdits,
  loadEntityMerges, loadManualMapOverrides, loadManualMapModifications,
  loadManualMapsFromKV, loadResolutions, setSizeOverride, clearSizeOverride,
} from './kv';
import { renderManualMapView, scrollToSnippet } from './tree-view';
import { registerTreeViewDeps } from './tree-view';
import { renderTable, registerTableDeps } from './table-view';
import { renderMatchReview, initMatchTableListeners, closeEntityPickerModal } from './match-table';
import { registerMatchRenderer } from './match-actions';
import { showManualNodeEvidence, getApprovedMatchesForNode, registerEvidenceDeps } from './evidence-panel';
import { startEditManualNode } from './entity-edit';
import { registerEditRenderer } from './entity-edit';
import {
  showManageEntitiesModal, closeManageEntitiesModal, switchManageEntitiesTab,
  filterCreateEntityParentList, createNewEntity, showAddChildModal,
  confirmDeleteEntity, filterDeleteEntityList, cancelDeleteEntity, confirmDeleteFromModal,
  registerCrudRenderer,
} from './entity-crud';
import {
  resetMergeTab, filterMergeEntityAList, filterMergeEntityBList,
  executeMergeFromTab, registerMergeRenderer,
} from './entity-merge';
import { initSnippetContextListeners, closeSnippetContextModal, showManualSnippetContext } from './snippet-context';
import { performAutosave, AUTOSAVE_INTERVAL, startSyncPolling, registerSyncRenderers, resetSyncVersion } from './sync';

// --- Wire lazy dependencies ---

registerTreeViewDeps({
  startEditManualNode,
  showManualNodeEvidence,
  getApprovedMatchesForNode,
});
registerEditRenderer(renderManualMapView);
registerTableDeps(getApprovedMatchesForNode);
registerMatchRenderer(renderMatchReview);
registerCrudRenderer(renderManualMapView);
registerMergeRenderer(renderManualMapView);
registerSyncRenderers(renderManualMapView, renderMatchReview);
registerEvidenceDeps({
  handleSizeChipClick,
  handleTeamSizeInputChange,
  showAddChildModal,
  confirmDeleteEntity,
  clearSizeOverride,
});

// --- Size chip + team size handlers (bridge between evidence panel and state) ---

function handleSizeChipClick(event: Event, nodeId: string, sizeIdx: number, snippetIdx: number): void {
  event.preventDefault();
  if (snippetIdx !== undefined && snippetIdx !== null) scrollToSnippet(snippetIdx);
  if (!(event as MouseEvent).shiftKey) {
    if (selectedManualNode) {
      const evidence = (selectedManualNode as any).gongEvidence || {};
      const sizeMentions = evidence.sizeMentions || [];
      const mention = sizeMentions[sizeIdx];
      if (mention) {
        const numericValue = String(mention.value || '').replace(/[^\d]/g, '');
        setSizeOverride(currentCompany, nodeId, sizeIdx, numericValue);
      }
    }
    renderManualMapView();
    setTimeout(() => {
      const nodeEl = document.querySelector(`.mm-node[data-id="${selectedManualNode?.id}"]`);
      if (nodeEl && selectedManualNode) {
        nodeEl.classList.add('selected');
        showManualNodeEvidence(selectedManualNode);
      }
    }, 0);
  }
}

function handleTeamSizeInputChange(nodeId: string, value: string): void {
  const numericValue = value.trim();
  if (numericValue === '') {
    clearSizeOverride(nodeId);
  } else {
    setSizeOverride(currentCompany, nodeId, null, numericValue);
  }
  renderManualMapView();
  setTimeout(() => {
    const nodeEl = document.querySelector(`.mm-node[data-id="${selectedManualNode?.id}"]`);
    if (nodeEl && selectedManualNode) {
      nodeEl.classList.add('selected');
      showManualNodeEvidence(selectedManualNode);
    }
  }, 0);
}

// --- View/Mode switching ---

function setView(view: 'tree' | 'table'): void {
  setCurrentView(view);
  document.getElementById('treeViewBtn')?.classList.toggle('active', view === 'tree');
  document.getElementById('tableViewBtn')?.classList.toggle('active', view === 'table');
  document.getElementById('treeContainer')?.classList.toggle('hidden', view !== 'tree');
  document.getElementById('sideBySideContainer')?.classList.remove('active');
  document.getElementById('tableContainer')?.classList.toggle('active', view === 'table');
  const evidencePanel = document.getElementById('evidencePanel');
  if (evidencePanel) evidencePanel.style.display = view === 'tree' ? 'flex' : 'none';
}

function setMode(mode: 'manual' | 'matchReview'): void {
  setCurrentMode(mode);
  document.getElementById('manualModeBtn')?.classList.toggle('active', mode === 'manual');
  document.getElementById('matchReviewBtn')?.classList.toggle('active', mode === 'matchReview');
  localStorage.setItem('orgChartMode', mode);

  // Hide everything first
  document.getElementById('treeContainer')?.classList.add('hidden');
  document.getElementById('tableContainer')?.classList.remove('active');
  document.getElementById('sideBySideContainer')?.classList.remove('active');
  document.getElementById('matchReviewContainer')?.classList.remove('active');
  const changeSummary = document.getElementById('changeSummary');
  if (changeSummary) changeSummary.style.display = 'none';
  const evidencePanel = document.getElementById('evidencePanel');
  if (evidencePanel) evidencePanel.style.display = 'none';

  const timelineContainer = document.querySelector('.timeline-container') as HTMLElement;
  const viewToggle = document.querySelector('.view-toggle') as HTMLElement;
  const manageEntitiesBtn = document.getElementById('manageEntitiesBtn');

  if (mode === 'matchReview') {
    if (timelineContainer) timelineContainer.style.display = 'none';
    if (viewToggle) viewToggle.style.display = 'none';
    if (manageEntitiesBtn) manageEntitiesBtn.style.display = 'none';
    document.getElementById('matchReviewContainer')?.classList.add('active');
    renderMatchReview(currentCompany);
  } else {
    if (timelineContainer) timelineContainer.style.display = 'flex';
    if (viewToggle) viewToggle.style.display = 'flex';
    if (manageEntitiesBtn) manageEntitiesBtn.style.display = 'inline-flex';
    renderManualMapView();
    setView(currentView);
  }
}

// --- Startup ---

(async () => {
  // Set currentCompany FIRST — all KV loads depend on it
  const companySelect = document.getElementById('companySelect') as HTMLSelectElement;
  setCurrentCompany(companySelect.value as ValidAccount);

  await loadManualMapsFromKV();
  await Promise.all([
    loadSizeOverrides(),
    loadMatchReviewState(),
    loadFieldEdits(),
    loadEntityMerges(),
    loadResolutions(),
  ]);
  await loadManualMapOverrides();
  await loadManualMapModifications();

  // Load saved mode preference
  const savedMode = localStorage.getItem('orgChartMode');
  if (savedMode === 'matchReview') setCurrentMode('matchReview');

  // --- Event listeners ---

  companySelect.addEventListener('change', async (e) => {
    setCurrentCompany((e.target as HTMLSelectElement).value as ValidAccount);
    resetSyncVersion();
    await Promise.all([loadMatchReviewState(), loadSizeOverrides(), loadFieldEdits(), loadEntityMerges(), loadResolutions()]);
    await loadManualMapOverrides();
    await loadManualMapModifications();
    if (currentMode === 'manual') renderManualMapView();
    else if (currentMode === 'matchReview') renderMatchReview(currentCompany);
  });

  document.getElementById('treeViewBtn')?.addEventListener('click', () => setView('tree'));
  document.getElementById('tableViewBtn')?.addEventListener('click', () => setView('table'));
  document.getElementById('evidenceHeader')?.addEventListener('click', () => {
    const panel = document.getElementById('evidencePanel');
    if (panel) panel.classList.toggle('expanded');
  });

  document.getElementById('manualModeBtn')?.addEventListener('click', () => setMode('manual'));
  document.getElementById('matchReviewBtn')?.addEventListener('click', () => setMode('matchReview'));

  // Match review filters
  ['mrSearchFilter', 'mrStatusFilter', 'mrConfidenceFilter'].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener('input', () => { if (currentMode === 'matchReview') renderMatchReview(currentCompany); });
    el?.addEventListener('change', () => { if (currentMode === 'matchReview') renderMatchReview(currentCompany); });
  });

  // Manage entities button
  document.getElementById('manageEntitiesBtn')?.addEventListener('click', showManageEntitiesModal);

  // Timeline sliders
  const startSlider = document.getElementById('startSlider') as HTMLInputElement;
  const endSlider = document.getElementById('endSlider') as HTMLInputElement;
  let sliderDebounce: ReturnType<typeof setTimeout>;
  function updateSliders(): void {
    const start = Math.min(parseInt(startSlider.value), parseInt(endSlider.value) - 5);
    const end = Math.max(parseInt(endSlider.value), parseInt(startSlider.value) + 5);
    startSlider.value = String(start);
    endSlider.value = String(end);
    setDateRange({ start, end });
    const data = MANUAL_DATA[currentCompany];
    if (data?.dateRange) {
      const range = { start: (data.dateRange as any).earliest || (data.dateRange as any).start, end: (data.dateRange as any).latest || (data.dateRange as any).end };
      const startDateEl = document.getElementById('startDate');
      const endDateEl = document.getElementById('endDate');
      if (startDateEl) startDateEl.textContent = formatDateShort(getDateFromPercent(start, range));
      if (endDateEl) endDateEl.textContent = formatDateShort(getDateFromPercent(end, range));
    }
    clearTimeout(sliderDebounce);
    sliderDebounce = setTimeout(() => {
      if (currentMode === 'manual') renderManualMapView();
    }, 100);
  }
  startSlider?.addEventListener('input', updateSliders);
  endSlider?.addEventListener('input', updateSliders);

  // Table sorting
  document.querySelectorAll('.snippets-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = (th as HTMLElement).dataset.sort!;
      if (tableSortKey === key) setTableSortAsc(!tableSortAsc);
      else { setTableSortKey(key); setTableSortAsc(true); }
      renderTable(undefined, undefined);
    });
  });

  // Table filters
  ['tableSearch', 'confidenceFilter', 'typeFilter'].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener('input', () => renderTable(undefined, undefined));
    el?.addEventListener('change', () => renderTable(undefined, undefined));
  });

  // Snippet context modal
  initSnippetContextListeners();
  document.getElementById('closeSnippetContextBtn')?.addEventListener('click', closeSnippetContextModal);

  // Match table listeners (entity picker)
  initMatchTableListeners();
  document.getElementById('closeEntityPickerBtn')?.addEventListener('click', closeEntityPickerModal);
  document.getElementById('cancelEntityPickerBtn')?.addEventListener('click', closeEntityPickerModal);

  // Manage entities modal
  document.getElementById('closeManageEntitiesBtn')?.addEventListener('click', closeManageEntitiesModal);
  document.getElementById('createEntityTab')?.addEventListener('click', () => switchManageEntitiesTab('create'));
  document.getElementById('deleteEntityTab')?.addEventListener('click', () => switchManageEntitiesTab('delete'));
  document.getElementById('mergeEntityTab')?.addEventListener('click', () => { switchManageEntitiesTab('merge'); resetMergeTab(); });
  document.getElementById('createEntityParentSearchInput')?.addEventListener('input', filterCreateEntityParentList);
  document.getElementById('createEntityBtn')?.addEventListener('click', createNewEntity);
  document.getElementById('deleteEntitySearchInput')?.addEventListener('input', filterDeleteEntityList);
  document.getElementById('cancelDeleteBtn')?.addEventListener('click', cancelDeleteEntity);
  document.getElementById('confirmDeleteBtn')?.addEventListener('click', confirmDeleteFromModal);
  document.getElementById('mergeEntityASearchInput')?.addEventListener('input', filterMergeEntityAList);
  document.getElementById('mergeEntityBSearchInput')?.addEventListener('input', filterMergeEntityBList);
  document.getElementById('mergeConfirmBtn')?.addEventListener('click', executeMergeFromTab);

  // --- Initial render ---
  if (currentMode === 'matchReview') setMode('matchReview');
  else setMode('manual');

  // Autosave
  setInterval(performAutosave, AUTOSAVE_INTERVAL);

  // Save on unload
  window.addEventListener('beforeunload', () => {
    const currentMRState: Record<string, any> = {};
    if (matchReviewState[currentCompany]) currentMRState[currentCompany] = matchReviewState[currentCompany];
    navigator.sendBeacon(
      kvApiUrl('autosave', currentCompany),
      JSON.stringify({
        state: { overrides, sizeOverrides, matchReviewState: currentMRState, conflictResolutions, fieldEdits, entityMerges, manualMapOverrides, mode: currentMode },
      }),
    );
  });

  // Start sync polling
  startSyncPolling();

  if (import.meta.env.DEV) {
    console.log('[Init] App started. Company:', currentCompany, 'Mode:', currentMode);
  }
})();
