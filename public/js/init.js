// Initialization: async IIFE for KV loads, event binding, and startup
(async () => {
// Set currentCompany FIRST — all KV loads depend on it
currentCompany = document.getElementById('companySelect').value;

await loadManualMapsFromKV();
await Promise.all([
  loadSizeOverrides(),
  loadMatchReviewState(),
  loadFieldEdits(),
  loadEntityMerges(),
  loadResolutions()
]);
await loadManualMapOverrides();
await loadManualMapModifications();

// Load saved mode preference (auto no longer exists, default to manual)
const savedMode = localStorage.getItem('orgChartMode');
if (savedMode === 'matchReview') {
  currentMode = 'matchReview';
  document.getElementById('manualModeBtn').classList.remove('active');
  document.getElementById('matchReviewBtn').classList.add('active');
} else {
  currentMode = 'manual';
  document.getElementById('manualModeBtn').classList.add('active');
}

document.getElementById('companySelect').addEventListener('change', async e => {
  currentCompany = e.target.value;
  lastKnownVersion = null; // Reset sync version for new company
  console.log('[CompanySelect] Changed to:', currentCompany, '- reloading KV data');
  await Promise.all([
    loadMatchReviewState(),
    loadSizeOverrides(),
    loadFieldEdits(),
    loadEntityMerges(),
    loadResolutions()
  ]);
  await loadManualMapOverrides();
  await loadManualMapModifications();
  if (currentMode === 'manual') {
    renderManualMapView();
  } else if (currentMode === 'matchReview') {
    renderMatchReview(currentCompany);
  }
});
document.getElementById('treeViewBtn').addEventListener('click', () => setView('tree'));
document.getElementById('tableViewBtn').addEventListener('click', () => setView('table'));
document.getElementById('evidenceHeader').addEventListener('click', toggleEvidence);

// Master switch event listeners
document.getElementById('manualModeBtn').addEventListener('click', () => setMode('manual'));
document.getElementById('matchReviewBtn').addEventListener('click', () => setMode('matchReview'));

// Match Review filter listeners
document.getElementById('mrSearchFilter').addEventListener('input', () => {
  if (currentMode === 'matchReview') renderMatchReview(currentCompany);
});
document.getElementById('mrStatusFilter').addEventListener('change', () => {
  if (currentMode === 'matchReview') renderMatchReview(currentCompany);
});
document.getElementById('mrConfidenceFilter').addEventListener('change', () => {
  if (currentMode === 'matchReview') renderMatchReview(currentCompany);
});

document.getElementById('resetAllBtn').addEventListener('click', () => {
  if (confirm('Reset all user overrides?')) {
    overrides = {};
    saveOverrides();
    renderCompany(currentCompany);
  }
});

// Change badge click handlers
const changeSummary = document.getElementById('changeSummary');
const badges = changeSummary.querySelectorAll('.change-stat');
badges[0].addEventListener('click', function() {
  if (!this.classList.contains('disabled')) {
    showVerificationConflicts();
  }
});
badges[1].addEventListener('click', function() {
  if (!this.classList.contains('disabled')) {
    showChanges('reorgs');
  }
});
badges[2].addEventListener('click', function() {
  if (!this.classList.contains('disabled')) {
    showChanges('leadership');
  }
});
badges[3].addEventListener('click', function() {
  if (!this.classList.contains('disabled')) {
    showChanges('size');
  }
});

// Modal close handlers
document.getElementById('changesModalClose').addEventListener('click', closeChangesModal);
document.getElementById('changesModal').addEventListener('click', (e) => {
  if (e.target.id === 'changesModal') {
    closeChangesModal();
  }
});

// Timeline sliders
const startSlider = document.getElementById('startSlider');
const endSlider = document.getElementById('endSlider');

let _sliderDebounce;
function updateSliders() {
  const start = Math.min(parseInt(startSlider.value), parseInt(endSlider.value) - 5);
  const end = Math.max(parseInt(endSlider.value), parseInt(startSlider.value) + 5);
  startSlider.value = start;
  endSlider.value = end;
  dateRange = { start, end };
  // Update date labels immediately (cheap)
  const data = MANUAL_DATA[currentCompany] || DATA[currentCompany];
  if (data?.dateRange) {
    document.getElementById('startDate').textContent = formatDateShort(getDateFromPercent(start, data.dateRange));
    document.getElementById('endDate').textContent = formatDateShort(getDateFromPercent(end, data.dateRange));
  }
  // Debounce the expensive re-render
  clearTimeout(_sliderDebounce);
  _sliderDebounce = setTimeout(() => {
    if (currentMode === 'manual') {
      renderManualMapView();
    } else {
      renderCompany(currentCompany);
    }
  }, 100);
}

startSlider.addEventListener('input', updateSliders);
endSlider.addEventListener('input', updateSliders);

// Table sorting
document.querySelectorAll('.snippets-table th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (tableSortKey === key) tableSortAsc = !tableSortAsc;
    else { tableSortKey = key; tableSortAsc = true; }
    renderTable(null, null);
  });
});

// Table filters
['tableSearch', 'confidenceFilter', 'typeFilter'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    renderTable(null, null);
  });
  document.getElementById(id).addEventListener('change', () => {
    renderTable(null, null);
  });
});

// Initial render based on saved mode
console.log('[Init] currentCompany:', currentCompany, 'currentMode:', currentMode);
if (currentMode === 'matchReview') {
  setMode('matchReview');
} else {
  setMode('manual');
}

// Resolve modal listeners are registered in conflict-resolution.js (not duplicated here)

// Start autosave timer
setInterval(performAutosave, AUTOSAVE_INTERVAL);

// Save on page unload via sendBeacon
window.addEventListener('beforeunload', () => {
  const currentMRState = {};
  if (matchReviewState[currentCompany]) {
    currentMRState[currentCompany] = matchReviewState[currentCompany];
  }
  const state = {
    overrides: overrides,
    sizeOverrides: sizeOverrides,
    matchReviewState: currentMRState,
    conflictResolutions: conflictResolutions,
    fieldEdits: fieldEdits,
    entityMerges: entityMerges,
    manualMapOverrides: manualMapOverrides,
    mode: currentMode
  };
  navigator.sendBeacon(
    kvApiUrl('autosave', currentCompany),
    JSON.stringify({ state })
  );

});

console.log('[Init] Autosave enabled (every 5 minutes)');

// Start sync polling
startSyncPolling();
console.log('[Init] Sync polling started (every 10s)');
})(); // end async init
