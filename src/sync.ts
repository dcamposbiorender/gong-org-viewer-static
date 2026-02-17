// Autosave and multi-user sync polling — plain functions, no class.

import {
  currentCompany, currentMode, overrides, sizeOverrides, matchReviewState,
  conflictResolutions, fieldEdits, entityMerges, manualMapOverrides,
  kvApiUrl, selectedManualNode,
} from './state';
import { showToast, isModalOpen } from './utils';
import {
  loadManualMapsFromKV, loadSizeOverrides, loadMatchReviewState,
  loadFieldEdits, loadEntityMerges, loadManualMapOverrides,
  loadManualMapModifications, loadResolutions,
} from './kv';
import { findNodeById } from './tree-ops';

export const AUTOSAVE_INTERVAL = 5 * 60 * 1000; // 5 minutes

export async function performAutosave(): Promise<void> {
  try {
    const currentMRState: Record<string, any> = {};
    if (matchReviewState[currentCompany]) {
      currentMRState[currentCompany] = matchReviewState[currentCompany];
    }
    const state = {
      overrides, sizeOverrides,
      matchReviewState: currentMRState,
      conflictResolutions, fieldEdits, entityMerges, manualMapOverrides,
      mode: currentMode,
    };
    const resp = await fetch(kvApiUrl('autosave', currentCompany), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
    if (!resp.ok) {
      showToast('Autosave failed - some data saved locally only', 'error');
    } else {
      console.log('[Autosave] State saved to KV at', new Date().toISOString());
    }
  } catch {
    showToast('Autosave failed - data saved locally only', 'error');
  }
}

// --- Sync polling ---

let lastKnownVersion: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// Lazy imports to avoid circular dependency with rendering modules
// (sync needs to call renderManualMapView/renderMatchReview after reload)
let _renderManualMapView: (() => void) | null = null;
let _renderMatchReview: ((company: string) => void) | null = null;

export function registerSyncRenderers(
  renderManualMapView: () => void,
  renderMatchReview: (company: string) => void,
): void {
  _renderManualMapView = renderManualMapView;
  _renderMatchReview = renderMatchReview;
}

export function resetSyncVersion(): void {
  lastKnownVersion = null;
}

async function checkForUpdates(): Promise<void> {
  if (document.hidden) return;
  if (isModalOpen()) return;

  try {
    const response = await fetch(kvApiUrl('sync-version', currentCompany.toLowerCase()));
    if (!response.ok) return;
    const { version } = await response.json();

    if (lastKnownVersion !== null && version !== lastKnownVersion) {
      console.log('[Sync] Version changed from', lastKnownVersion, 'to', version, '- reloading KV data...');

      // Preserve selected node across re-render
      const selectedId = selectedManualNode?.id ?? null;

      await Promise.all([
        loadManualMapsFromKV(currentCompany),
        loadSizeOverrides(),
        loadMatchReviewState(),
        loadFieldEdits(),
        loadEntityMerges(),
        loadResolutions(),
      ]);
      await loadManualMapOverrides();
      await loadManualMapModifications();

      if (currentMode === 'manual' && _renderManualMapView) {
        _renderManualMapView();
        // Re-select node if it was selected before
        if (selectedId) {
          const node = findNodeById(MANUAL_DATA[currentCompany]?.root, selectedId);
          if (node) {
            // Re-selection will be handled by the rendering module
          }
        }
      } else if (currentMode === 'matchReview' && _renderMatchReview) {
        _renderMatchReview(currentCompany);
      }
    }
    lastKnownVersion = version;
  } catch (e) {
    console.log('[Sync] Poll failed:', (e as Error).message);
  }
}

export function startSyncPolling(): void {
  stopPolling();
  checkForUpdates();
  pollTimer = setInterval(checkForUpdates, 10_000);
}

export function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
