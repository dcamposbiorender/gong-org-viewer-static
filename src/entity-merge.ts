// Entity merge + alias management

import { currentCompany, entityMerges } from './state';
import { escapeHtml, showToast } from './utils';
import { findNodeById, isEntityAbsorbed } from './tree-ops';
import { getFieldValue, saveEntityMergeToKV } from './kv';
import { closeManageEntitiesModal } from './entity-crud';

// Lazy imports
let _renderManualMapView: (() => void) | null = null;
export function registerMergeRenderer(fn: () => void): void { _renderManualMapView = fn; }

// All entities list (shared with entity-crud via manage entities modal)
let allEntities: Array<{ id: string; name: string; path: string }> = [];
export function setAllEntities(entities: Array<{ id: string; name: string; path: string }>): void { allEntities = entities; }

let mergeTabState: { entityA: any; entityB: any } = { entityA: null, entityB: null };

export function resetMergeTab(): void {
  mergeTabState = { entityA: null, entityB: null };
  ['mergeEntityASearch', 'mergeEntityBSearch'].forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) el.value = '';
  });
  ['mergeEntityAList', 'mergeEntityBList', 'mergeEntityASelected', 'mergeEntityBSelected', 'mergePreviewPanel', 'mergeValidationError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const btn = document.getElementById('mergeConfirmBtn') as HTMLButtonElement;
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
}

function buildMergeEntityInfo(entity: { id: string; name: string; path: string }): any {
  const node = findNodeById(MANUAL_DATA[currentCompany]?.root, entity.id);
  if (!node) return entity;
  return {
    ...entity,
    type: node.type || 'unknown',
    childCount: node.children?.length || 0,
    snippetCount: node.gongEvidence?.snippets?.length || 0,
    leaderName: getFieldValue(node, 'leaderName') || '',
  };
}

function renderMergeEntityList(listElId: string, entities: any[], onSelect: (entity: any) => void): void {
  const listEl = document.getElementById(listElId)!;
  listEl.style.display = 'block';
  listEl.innerHTML = '';
  entities.forEach(entity => {
    const item = document.createElement('div');
    item.style.cssText = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee;';
    item.innerHTML = `<div style="font-weight: 500;">${escapeHtml(entity.name)}</div><div style="font-size: 11px; color: #888;">${escapeHtml(entity.path)}</div>`;
    item.addEventListener('click', () => onSelect(entity));
    item.addEventListener('mouseover', () => item.style.background = '#f0f9ff');
    item.addEventListener('mouseout', () => item.style.background = 'transparent');
    listEl.appendChild(item);
  });
}

export function filterMergeEntityAList(): void {
  const search = (document.getElementById('mergeEntityASearch') as HTMLInputElement).value.toLowerCase().trim();
  if (!search) { document.getElementById('mergeEntityAList')!.style.display = 'none'; return; }
  const filtered = allEntities.filter(e => e.name.toLowerCase().includes(search) || e.path.toLowerCase().includes(search));
  renderMergeEntityList('mergeEntityAList', filtered, selectMergeEntityA);
}

export function filterMergeEntityBList(): void {
  const search = (document.getElementById('mergeEntityBSearch') as HTMLInputElement).value.toLowerCase().trim();
  if (!search) { document.getElementById('mergeEntityBList')!.style.display = 'none'; return; }
  const filtered = allEntities.filter(e => e.name.toLowerCase().includes(search) || e.path.toLowerCase().includes(search));
  renderMergeEntityList('mergeEntityBList', filtered, selectMergeEntityB);
}

function selectMergeEntityA(entity: any): void {
  mergeTabState.entityA = buildMergeEntityInfo(entity);
  document.getElementById('mergeEntityAList')!.style.display = 'none';
  const selected = document.getElementById('mergeEntityASelected')!;
  selected.style.display = 'block';
  selected.innerHTML = `<strong>${escapeHtml(entity.name)}</strong> <span style="font-size: 11px; color: #888;">${escapeHtml(entity.path)}</span>`;
  (document.getElementById('mergeEntityASearch') as HTMLInputElement).value = '';
  updateMergePreview();
}

function selectMergeEntityB(entity: any): void {
  mergeTabState.entityB = buildMergeEntityInfo(entity);
  document.getElementById('mergeEntityBList')!.style.display = 'none';
  const selected = document.getElementById('mergeEntityBSelected')!;
  selected.style.display = 'block';
  selected.innerHTML = `<strong>${escapeHtml(entity.name)}</strong> <span style="font-size: 11px; color: #888;">${escapeHtml(entity.path)}</span>`;
  (document.getElementById('mergeEntityBSearch') as HTMLInputElement).value = '';
  updateMergePreview();
}

function updateMergePreview(): void {
  const errorEl = document.getElementById('mergeValidationError')!;
  const previewEl = document.getElementById('mergePreviewPanel')!;
  const confirmBtn = document.getElementById('mergeConfirmBtn') as HTMLButtonElement;

  if (!mergeTabState.entityA || !mergeTabState.entityB) {
    previewEl.style.display = 'none';
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';
    return;
  }

  // Validation
  const a = mergeTabState.entityA;
  const b = mergeTabState.entityB;

  if (a.id === b.id) {
    errorEl.style.display = 'block';
    errorEl.textContent = 'Cannot merge an entity with itself.';
    previewEl.style.display = 'none';
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';
    return;
  }

  if (isEntityAbsorbed(a.id)) {
    errorEl.style.display = 'block';
    errorEl.textContent = `${a.name} is already absorbed by another entity.`;
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';
    return;
  }

  if (isEntityAbsorbed(b.id)) {
    errorEl.style.display = 'block';
    errorEl.textContent = `${b.name} is already absorbed by another entity.`;
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';
    return;
  }

  errorEl.style.display = 'none';
  previewEl.style.display = 'block';
  document.getElementById('mergePreviewContent')!.innerHTML = `
    <div style="margin-bottom: 8px;"><strong>${escapeHtml(a.name)}</strong> will be absorbed into <strong>${escapeHtml(b.name)}</strong></div>
    <div style="font-size: 12px; color: #666;">
      <div>Children of ${escapeHtml(a.name)} (${a.childCount}) will be moved to ${escapeHtml(b.name)}</div>
      <div>Snippets from ${escapeHtml(a.name)} (${a.snippetCount}) will be combined</div>
    </div>`;

  confirmBtn.disabled = false;
  confirmBtn.style.opacity = '1';
}

export function executeMergeFromTab(): void {
  if (!mergeTabState.entityA || !mergeTabState.entityB) return;

  const a = mergeTabState.entityA;
  const b = mergeTabState.entityB;

  const merge = entityMerges[b.id] || { absorbed: [], aliases: [], mergedAt: null };
  merge.absorbed = [...(merge.absorbed || []), a.id];
  merge.mergedAt = new Date().toISOString();
  entityMerges[b.id] = merge;

  localStorage.setItem('entityMerges:' + currentCompany.toLowerCase(), JSON.stringify(entityMerges));
  saveEntityMergeToKV(currentCompany, b.id, merge);

  showToast(`Merged "${a.name}" into "${b.name}"`, 'success');
  closeManageEntitiesModal();
  _renderManualMapView?.();
}

// --- Alias management ---

export function addAlias(canonicalId: string, aliasName: string): void {
  if (!aliasName?.trim()) return;

  const merge = entityMerges[canonicalId] || { absorbed: [], aliases: [] };
  if (!merge.aliases) merge.aliases = [];

  if (merge.aliases.includes(aliasName.trim())) {
    showToast('Alias already exists', 'error');
    return;
  }

  merge.aliases.push(aliasName.trim());
  entityMerges[canonicalId] = merge;
  localStorage.setItem('entityMerges:' + currentCompany.toLowerCase(), JSON.stringify(entityMerges));
  saveEntityMergeToKV(currentCompany, canonicalId, merge);
  showToast(`Added alias "${aliasName}"`, 'success');
}

export function removeAlias(canonicalId: string, aliasName: string): void {
  const merge = entityMerges[canonicalId];
  if (!merge?.aliases) return;

  merge.aliases = merge.aliases.filter((a: string) => a !== aliasName);
  localStorage.setItem('entityMerges:' + currentCompany.toLowerCase(), JSON.stringify(entityMerges));
  saveEntityMergeToKV(currentCompany, canonicalId, merge);
  showToast(`Removed alias "${aliasName}"`);
}

export function showAddAliasInput(canonicalId: string): void {
  const name = prompt('Enter alias name:');
  if (name) addAlias(canonicalId, name);
}
