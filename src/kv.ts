// KV API: load/save/delete operations for all Vercel KV endpoints.
// Plain functions — toast on failure, one retry.

import {
  currentCompany, overrides, sizeOverrides, fieldEdits, matchReviewState,
  entityMerges, manualMapOverrides, manualMapModifications,
  kvApiUrl, getSizeOverrideKey,
  setOverrides, setSizeOverrides, setFieldEdits, setMatchReviewState,
  setEntityMerges, setManualMapOverrides, setManualMapModifications,
} from './state';
import { safeJsonParse, showToast } from './utils';
import { findNodeById } from './tree-ops';

// --- Generic KV helpers ---

export async function kvSave(endpoint: string, data: unknown): Promise<boolean> {
  try {
    const res = await fetch(kvApiUrl(endpoint, currentCompany), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return true;
  } catch {
    showToast('Save failed. Please try again.', 'error');
    return false;
  }
}

// --- Corrections (hierarchy overrides) ---

export async function loadOverrides(): Promise<void> {
  const stored = localStorage.getItem('orgChartOverrides');
  if (stored) setOverrides(safeJsonParse(stored, {}));

  try {
    const response = await fetch(`/api/corrections?account=${currentCompany.toLowerCase()}`);
    if (response.ok) {
      const kvData = await response.json();
      if (kvData && Object.keys(kvData).length > 0) {
        setOverrides({ ...overrides, ...kvData });
        localStorage.setItem('orgChartOverrides', JSON.stringify(overrides));
      }
    }
  } catch {
    console.log('Using localStorage for overrides (KV not available)');
  }
}

export function saveOverrides(): void {
  localStorage.setItem('orgChartOverrides', JSON.stringify(overrides));
}

export async function saveOverrideToKV(account: string, entityId: string, override: any, isRetry = false): Promise<void> {
  try {
    const response = await fetch(kvApiUrl('corrections', account), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId, override }),
    });
    if (!response.ok) {
      if (!isRetry) setTimeout(() => saveOverrideToKV(account, entityId, override, true), 2000);
      else showToast('Correction save failed - data saved locally only', 'error');
    }
  } catch {
    if (!isRetry) setTimeout(() => saveOverrideToKV(account, entityId, override, true), 2000);
    else showToast('Correction save failed - data saved locally only', 'error');
  }
}

export async function deleteOverrideFromKV(account: string, entityId: string, isRetry = false): Promise<void> {
  try {
    const response = await fetch(kvApiUrl('corrections', account), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId }),
    });
    if (!response.ok) {
      if (!isRetry) setTimeout(() => deleteOverrideFromKV(account, entityId, true), 2000);
      else showToast('Correction delete failed - reverted locally only', 'error');
    }
  } catch {
    if (!isRetry) setTimeout(() => deleteOverrideFromKV(account, entityId, true), 2000);
    else showToast('Correction delete failed - reverted locally only', 'error');
  }
}

// --- Size overrides ---

export async function loadSizeOverrides(): Promise<void> {
  const stored = localStorage.getItem('sizeOverrides');
  if (stored) setSizeOverrides(safeJsonParse(stored, {}));

  try {
    const response = await fetch(`/api/sizes?account=${currentCompany.toLowerCase()}`);
    if (response.ok) {
      const kvData = await response.json();
      if (kvData && Object.keys(kvData).length > 0) {
        setSizeOverrides({ ...sizeOverrides, ...kvData });
        localStorage.setItem('sizeOverrides', JSON.stringify(sizeOverrides));
      }
    }
  } catch {
    console.log('Using localStorage for size overrides (KV not available)');
  }
}

export function saveSizeOverrides(): void {
  localStorage.setItem('sizeOverrides', JSON.stringify(sizeOverrides));
}

export async function saveSizeOverrideToKV(account: string, key: string, override: any, isRetry = false): Promise<void> {
  try {
    const response = await fetch(kvApiUrl('sizes', account), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, override }),
    });
    if (!response.ok) {
      if (!isRetry) setTimeout(() => saveSizeOverrideToKV(account, key, override, true), 2000);
      else showToast('Size save failed - data saved locally only', 'error');
    }
  } catch {
    if (!isRetry) setTimeout(() => saveSizeOverrideToKV(account, key, override, true), 2000);
    else showToast('Size save failed - data saved locally only', 'error');
  }
}

export function setSizeOverride(company: string, nodeId: string, selectedIndex: number | null, customValue: string | null = null): void {
  const key = getSizeOverrideKey(company, nodeId);
  const override = {
    selectedSizeIndex: selectedIndex,
    customValue: customValue,
    updatedAt: new Date().toISOString(),
  };
  sizeOverrides[key] = override;
  saveSizeOverrides();
  saveSizeOverrideToKV(company, key, override);
}

export function clearSizeOverride(nodeId: string, company?: string): void {
  const acct = company || currentCompany;
  const key = getSizeOverrideKey(acct, nodeId);
  delete sizeOverrides[key];
  saveSizeOverrides();
  deleteSizeOverrideFromKV(acct, key);
}

export async function deleteSizeOverrideFromKV(account: string, key: string, isRetry = false): Promise<void> {
  try {
    const response = await fetch(kvApiUrl('sizes', account), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (!response.ok) {
      if (!isRetry) setTimeout(() => deleteSizeOverrideFromKV(account, key, true), 2000);
      else showToast('Size delete failed - reverted locally only', 'error');
    }
  } catch {
    if (!isRetry) setTimeout(() => deleteSizeOverrideFromKV(account, key, true), 2000);
    else showToast('Size delete failed - reverted locally only', 'error');
  }
}

// --- Field edits ---

export async function loadFieldEdits(): Promise<void> {
  const stored = localStorage.getItem('fieldEdits');
  if (stored) setFieldEdits(safeJsonParse(stored, {}));

  try {
    const response = await fetch(`/api/field-edits?account=${currentCompany.toLowerCase()}`);
    if (response.ok) {
      const kvData = await response.json();
      if (kvData && Object.keys(kvData).length > 0) {
        setFieldEdits({ ...fieldEdits, ...kvData });
        localStorage.setItem('fieldEdits', JSON.stringify(fieldEdits));
      }
    }
  } catch {
    console.log('Using localStorage for field edits (KV not available)');
  }
}

export async function saveFieldEditToKV(account: string, entityId: string, edit: any, isRetry = false): Promise<void> {
  try {
    const response = await fetch(kvApiUrl('field-edits', account), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId, edit }),
    });
    if (!response.ok) {
      if (!isRetry) setTimeout(() => saveFieldEditToKV(account, entityId, edit, true), 2000);
      else showToast('Field edit save failed - data saved locally only', 'error');
    }
  } catch {
    if (!isRetry) setTimeout(() => saveFieldEditToKV(account, entityId, edit, true), 2000);
    else showToast('Field edit save failed - data saved locally only', 'error');
  }
}

export async function deleteFieldEditFromKV(account: string, entityId: string, isRetry = false): Promise<void> {
  try {
    const response = await fetch(kvApiUrl('field-edits', account), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId }),
    });
    if (!response.ok) {
      if (!isRetry) setTimeout(() => deleteFieldEditFromKV(account, entityId, true), 2000);
      else showToast('Field edit delete failed - reverted locally only', 'error');
    }
  } catch {
    if (!isRetry) setTimeout(() => deleteFieldEditFromKV(account, entityId, true), 2000);
    else showToast('Field edit delete failed - reverted locally only', 'error');
  }
}

/** Get edited value for a field, or original if not edited. */
export function getFieldValue(node: any, fieldName: string): string {
  const edit = fieldEdits[node.id];
  if (edit && edit[fieldName]?.edited !== undefined) {
    return edit[fieldName].edited;
  }
  if (fieldName === 'name') return node.name || '';
  if (fieldName === 'leaderName') {
    if (node.leader?.name) return node.leader.name;
    const dm = node.gongEvidence?.matchedContacts?.find((c: any) => c.isDecisionMaker);
    return dm?.name || '';
  }
  if (fieldName === 'leaderTitle') {
    if (node.leader?.title) return node.leader.title;
    const dm = node.gongEvidence?.matchedContacts?.find((c: any) => c.isDecisionMaker);
    return dm?.title || '';
  }
  return '';
}

// --- Manual maps (graduated maps from KV) ---

export async function loadManualMapsFromKV(onlyCompany?: string): Promise<void> {
  const companies = onlyCompany ? [onlyCompany] : Object.keys(MANUAL_DATA);
  await Promise.all(companies.map(async (company) => {
    try {
      const response = await fetch(kvApiUrl('graduated-map', company));
      if (response.ok) {
        const data = await response.json();
        if (data && data.root) {
          MANUAL_DATA[company] = data;
          console.log(`[ManualMaps] Loaded ${company} from KV`);
        }
      }
    } catch (e) {
      console.warn(`[ManualMaps] KV fetch failed for ${company}:`, (e as Error).message);
    }
  }));
}

// --- Manual map modifications (add/delete) ---

export async function loadManualMapModifications(): Promise<void> {
  const stored = localStorage.getItem('manualMapModifications');
  if (stored) setManualMapModifications(safeJsonParse(stored, {}));

  try {
    const response = await fetch(kvApiUrl('manual-map-modifications', currentCompany));
    if (response.ok) {
      const kvData = await response.json();
      if (kvData && typeof kvData === 'object' && Object.keys(kvData).length > 0) {
        setManualMapModifications(kvData);
        localStorage.setItem('manualMapModifications', JSON.stringify(manualMapModifications));
      }
    }
  } catch {
    // Use localStorage cache
  }
}

// --- Manual map overrides (drag-drop reparenting) ---

export function buildManualMapWorkingTree(node: any, parent: any = null): any {
  const clone = { ...node, originalParent: parent?.id || null, children: [] as any[] };
  const override = manualMapOverrides[node.id];
  if (override) clone.override = override;

  if (node.children) {
    node.children.forEach((child: any) => {
      if (!manualMapOverrides[child.id] || manualMapOverrides[child.id].newParent === node.id) {
        clone.children.push(buildManualMapWorkingTree(child, node));
      }
    });
  }

  Object.entries(manualMapOverrides).forEach(([nodeId, ov]: [string, any]) => {
    if (ov.newParent === node.id && nodeId !== node.id) {
      const movedNode = findNodeById(MANUAL_DATA[currentCompany]?.root, nodeId);
      if (movedNode) {
        const movedClone = buildManualMapWorkingTree(movedNode, node);
        movedClone.override = ov;
        clone.children.push(movedClone);
      }
    }
  });

  return clone;
}

export function isManualMapDescendant(parentId: string, childId: string, tree: any): boolean {
  const parent = findNodeById(tree, parentId);
  if (!parent) return false;
  function check(node: any): boolean {
    if (node.id === childId) return true;
    return node.children?.some(check) || false;
  }
  return check(parent);
}

export function getManualMapOriginalParentName(nodeId: string): string {
  function findParent(node: any, targetId: string, parent: any = null): any {
    if (node.id === targetId) return parent;
    if (node.children) {
      for (const child of node.children) {
        const found = findParent(child, targetId, node);
        if (found) return found;
      }
    }
    return null;
  }
  const parent = findParent(MANUAL_DATA[currentCompany]?.root, nodeId);
  return parent?.name || 'root';
}

export function saveManualMapOverrides(): void {
  localStorage.setItem('manualMapOverrides', JSON.stringify(manualMapOverrides));
}

export async function saveManualMapOverrideToKV(account: string, nodeId: string, override: any): Promise<void> {
  try {
    await fetch(kvApiUrl('manual-map-overrides', account), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, override }),
    });
  } catch (e) {
    console.warn('[ManualMapOverrides] KV save failed:', (e as Error).message);
  }
}

export async function loadManualMapOverrides(): Promise<void> {
  const stored = localStorage.getItem('manualMapOverrides');
  if (stored) setManualMapOverrides(safeJsonParse(stored, {}));

  try {
    const response = await fetch(kvApiUrl('manual-map-overrides', currentCompany));
    if (response.ok) {
      const kvData = await response.json();
      if (kvData && typeof kvData === 'object') {
        setManualMapOverrides({ ...manualMapOverrides, ...kvData });
        localStorage.setItem('manualMapOverrides', JSON.stringify(manualMapOverrides));
      }
    }
  } catch {
    // Use localStorage cache
  }
}

// --- Entity merges ---

export async function loadEntityMerges(): Promise<void> {
  setEntityMerges({});
  const stored = localStorage.getItem('entityMerges:' + currentCompany.toLowerCase());
  if (stored) setEntityMerges(safeJsonParse(stored, {}));

  try {
    const response = await fetch(kvApiUrl('merges', currentCompany));
    if (response.ok) {
      const kvData = await response.json();
      if (kvData && Object.keys(kvData).length > 0) {
        setEntityMerges(kvData);
      }
    }
  } catch {
    console.log('Using localStorage for entity merges (KV not available)');
  }
  localStorage.setItem('entityMerges:' + currentCompany.toLowerCase(), JSON.stringify(entityMerges));
}

export async function saveEntityMergeToKV(account: string, canonicalId: string, merge: any, isRetry = false): Promise<void> {
  try {
    const response = await fetch(kvApiUrl('merges', account), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canonicalId, merge }),
    });
    if (!response.ok) {
      if (!isRetry) setTimeout(() => saveEntityMergeToKV(account, canonicalId, merge, true), 2000);
      else showToast('Merge save failed - data saved locally only', 'error');
    }
  } catch {
    if (!isRetry) setTimeout(() => saveEntityMergeToKV(account, canonicalId, merge, true), 2000);
    else showToast('Merge save failed - data saved locally only', 'error');
  }
}

export async function deleteEntityMergeFromKV(account: string, canonicalId: string, isRetry = false): Promise<void> {
  try {
    const response = await fetch(kvApiUrl('merges', account), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canonicalId }),
    });
    if (!response.ok) {
      if (!isRetry) setTimeout(() => deleteEntityMergeFromKV(account, canonicalId, true), 2000);
      else showToast('Merge delete failed - reverted locally only', 'error');
    }
  } catch {
    if (!isRetry) setTimeout(() => deleteEntityMergeFromKV(account, canonicalId, true), 2000);
    else showToast('Merge delete failed - reverted locally only', 'error');
  }
}

// --- Match review ---

export async function loadMatchReviewState(): Promise<void> {
  const stored = localStorage.getItem('matchReviewState');
  if (stored) setMatchReviewState(safeJsonParse(stored, {}));

  try {
    const response = await fetch(`/api/match-review?account=${currentCompany.toLowerCase()}`);
    if (response.ok) {
      const kvData = await response.json();
      if (kvData && (kvData.approved || kvData.rejected || kvData.manual)) {
        matchReviewState[currentCompany] = {
          approved: kvData.approved || {},
          rejected: kvData.rejected || {},
          manual: kvData.manual || {},
        };
        localStorage.setItem('matchReviewState', JSON.stringify(matchReviewState));
      }
    }
  } catch {
    console.log('Using localStorage for match review state (KV not available)');
  }
}

export function saveMatchReviewState(_company: string): void {
  localStorage.setItem('matchReviewState', JSON.stringify(matchReviewState));
}

export async function saveMatchReviewItemToKV(account: string, itemId: string, decision: any, category: string, isRetry = false): Promise<void> {
  try {
    const response = await fetch(kvApiUrl('match-review', account), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, decision, category }),
    });
    if (!response.ok) {
      if (!isRetry) setTimeout(() => saveMatchReviewItemToKV(account, itemId, decision, category, true), 2000);
      else showToast('Match review save failed - data saved locally only', 'error');
    }
  } catch {
    if (!isRetry) setTimeout(() => saveMatchReviewItemToKV(account, itemId, decision, category, true), 2000);
    else showToast('Match review save failed - data saved locally only', 'error');
  }
}

export async function deleteMatchReviewItemFromKV(account: string, itemId: string, isRetry = false): Promise<void> {
  try {
    const response = await fetch(kvApiUrl('match-review', account), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    });
    if (!response.ok) {
      if (!isRetry) setTimeout(() => deleteMatchReviewItemFromKV(account, itemId, true), 2000);
      else showToast('Match review reset failed - reverted locally only', 'error');
    }
  } catch {
    if (!isRetry) setTimeout(() => deleteMatchReviewItemFromKV(account, itemId, true), 2000);
    else showToast('Match review reset failed - reverted locally only', 'error');
  }
}

export function initMatchReviewState(company: string): void {
  if (!matchReviewState[company]) {
    matchReviewState[company] = { approved: {}, rejected: {}, manual: {} };
  }
}

export function hasMatchReviewData(companyKey: string): boolean {
  return typeof MATCH_REVIEW_DATA !== 'undefined' &&
    !!MATCH_REVIEW_DATA?.companies &&
    !!MATCH_REVIEW_DATA.companies[companyKey];
}

export function getItemStatus(company: string, itemId: string): string {
  if (!matchReviewState[company]) return 'pending';
  if (matchReviewState[company].approved[itemId]) return 'approved';
  if (matchReviewState[company].rejected[itemId]) return 'rejected';
  if (matchReviewState[company].manual[itemId]) return 'manual';
  return 'pending';
}

export function getManualMapOptions(company: string): Array<{ id: string; name: string; path: string }> {
  if (!MANUAL_DATA[company]?.root) return [];
  const options: Array<{ id: string; name: string; path: string }> = [];
  function traverse(node: any, path = '') {
    const currentPath = path ? `${path}/${node.name}` : node.name;
    options.push({ id: node.id, name: node.name, path: currentPath });
    if (node.children) {
      node.children.forEach((child: any) => traverse(child, currentPath));
    }
  }
  traverse(MANUAL_DATA[company].root);
  return options;
}

// --- Conflict resolutions ---

export async function loadResolutions(): Promise<void> {
  try {
    const response = await fetch(kvApiUrl('resolutions', currentCompany));
    if (response.ok) {
      const data = await response.json();
      if (data && typeof data === 'object') {
        const { setConflictResolutions } = await import('./state');
        setConflictResolutions(data);
      }
    }
  } catch {
    // Use localStorage cache
  }
}
