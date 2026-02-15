// Autosave and Multi-User Sync Polling

const AUTOSAVE_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function performAutosave() {
  let failed = false;
  try {
    // Only include current company's matchReviewState to prevent cross-contamination
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

    const autosaveResp = await fetch(kvApiUrl('autosave', currentCompany), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
    if (!autosaveResp.ok) {
      console.error('[Autosave] KV save failed:', autosaveResp.status);
      failed = true;
    }

    if (failed) {
      showToast('Autosave partially failed - some data saved locally only', 'error');
    } else {
      console.log('[Autosave] State saved to KV at', new Date().toISOString());
    }
  } catch (e) {
    console.error('[Autosave] Failed (will retry):', e.message);
    showToast('Autosave failed - data saved locally only', 'error');
  }
}

let lastKnownVersion = null;
let syncPollTimer = null;

async function checkForUpdates() {
  if (document.hidden) return;
  if (isModalOpen()) return;
  try {
    const response = await fetch(kvApiUrl('sync-version', currentCompany.toLowerCase()));
    if (!response.ok) return;
    const { version } = await response.json();
    if (lastKnownVersion !== null && version !== lastKnownVersion) {
      console.log('[Sync] Version changed from', lastKnownVersion, 'to', version, '- reloading KV data...');
      await Promise.all([
        loadManualMapsFromKV(currentCompany),
        loadSizeOverrides(),
        loadMatchReviewState(),
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
    }
    lastKnownVersion = version;
  } catch (e) {
    console.log('[Sync] Poll failed:', e.message);
  }
}

function startSyncPolling() {
  if (syncPollTimer) clearInterval(syncPollTimer);
  checkForUpdates();
  syncPollTimer = setInterval(checkForUpdates, 10000);
}
