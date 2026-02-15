// Entity CRUD: create, delete entities in Manual Map

import { currentCompany, manualMapModifications, setSelectedManualNode } from './state';
import { escapeHtml } from './utils';
import { findNodeById, findNodeParent, countNodes } from './tree-ops';
import { getFieldValue } from './kv';
import { kvApiUrl } from './state';
import { showToast } from './utils';

// Lazy imports
let _renderManualMapView: (() => void) | null = null;
export function registerCrudRenderer(fn: () => void): void { _renderManualMapView = fn; }

// --- Manage Entities Modal ---

let manageEntitiesState = {
  selectedParentId: null as string | null,
  selectedParentName: null as string | null,
  selectedDeleteId: null as string | null,
  selectedDeleteName: null as string | null,
  selectedDeleteHasChildren: false,
  allEntities: [] as Array<{ id: string; name: string; path: string }>,
};

function buildEntityList(node: any, path: string, list: Array<{ id: string; name: string; path: string }>): void {
  const currentPath = path ? `${path} / ${node.name}` : node.name;
  list.push({ id: node.id, name: getFieldValue(node, 'name'), path: currentPath });
  if (node.children) {
    node.children.forEach((child: any) => buildEntityList(child, currentPath, list));
  }
}

export function showManageEntitiesModal(): void {
  if (!MANUAL_DATA[currentCompany]) {
    alert('Manage Entities is only available in Manual Map mode.');
    return;
  }

  manageEntitiesState = {
    selectedParentId: null, selectedParentName: null,
    selectedDeleteId: null, selectedDeleteName: null, selectedDeleteHasChildren: false,
    allEntities: [],
  };

  const root = MANUAL_DATA[currentCompany].root || MANUAL_DATA[currentCompany];
  buildEntityList(root, '', manageEntitiesState.allEntities);

  // Reset form fields
  ['createEntityParentSearch', 'createEntityName', 'createEntityLeaderName', 'createEntityLeaderTitle', 'deleteEntitySearch'].forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) el.value = '';
  });
  const parentList = document.getElementById('createEntityParentList');
  if (parentList) parentList.style.display = 'none';
  const selectedParent = document.getElementById('createEntitySelectedParent');
  if (selectedParent) selectedParent.style.display = 'none';
  const deleteConfirm = document.getElementById('deleteEntityConfirm');
  if (deleteConfirm) deleteConfirm.style.display = 'none';

  switchManageEntitiesTab('create');
  document.getElementById('manageEntitiesModal')!.style.display = 'flex';
  // Disable company dropdown while modal is open
  const companySelect = document.getElementById('companySelect') as HTMLSelectElement;
  if (companySelect) companySelect.disabled = true;
}

export function closeManageEntitiesModal(): void {
  document.getElementById('manageEntitiesModal')!.style.display = 'none';
  // Re-enable company dropdown
  const companySelect = document.getElementById('companySelect') as HTMLSelectElement;
  if (companySelect) companySelect.disabled = false;
}

export function switchManageEntitiesTab(tab: string): void {
  document.getElementById('createEntityPane')!.style.display = tab === 'create' ? 'block' : 'none';
  document.getElementById('deleteEntityPane')!.style.display = tab === 'delete' ? 'block' : 'none';
  document.getElementById('mergeEntityPane')!.style.display = tab === 'merge' ? 'block' : 'none';

  document.getElementById('createEntityTab')!.style.opacity = tab === 'create' ? '1' : '0.6';
  document.getElementById('deleteEntityTab')!.style.opacity = tab === 'delete' ? '1' : '0.6';
  document.getElementById('mergeEntityTab')!.style.opacity = tab === 'merge' ? '1' : '0.6';

  if (tab === 'delete') {
    renderDeleteEntityList(manageEntitiesState.allEntities);
  }
}

export function filterCreateEntityParentList(): void {
  const search = (document.getElementById('createEntityParentSearch') as HTMLInputElement).value.toLowerCase();
  const listEl = document.getElementById('createEntityParentList')!;

  if (!search) { listEl.style.display = 'none'; return; }

  const filtered = manageEntitiesState.allEntities.filter(e => e.name.toLowerCase().includes(search) || e.path.toLowerCase().includes(search));
  listEl.style.display = 'block';
  listEl.innerHTML = '';
  filtered.forEach(entity => {
    const item = document.createElement('div');
    item.style.cssText = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee;';
    item.innerHTML = `<div style="font-weight: 500;">${escapeHtml(entity.name)}</div><div style="font-size: 11px; color: #888;">${escapeHtml(entity.path)}</div>`;
    item.addEventListener('click', () => selectCreateEntityParent(entity));
    item.addEventListener('mouseover', () => item.style.background = '#f0f9ff');
    item.addEventListener('mouseout', () => item.style.background = 'transparent');
    listEl.appendChild(item);
  });
}

function selectCreateEntityParent(entity: { id: string; name: string; path: string }): void {
  manageEntitiesState.selectedParentId = entity.id;
  manageEntitiesState.selectedParentName = entity.name;
  document.getElementById('createEntityParentList')!.style.display = 'none';
  const selected = document.getElementById('createEntitySelectedParent')!;
  selected.style.display = 'block';
  selected.innerHTML = `<strong>${escapeHtml(entity.name)}</strong> <span style="color: #888; font-size: 11px;">${escapeHtml(entity.path)}</span> <span style="cursor: pointer; margin-left: 8px; color: #dc2626;" id="clearParentBtn">✕</span>`;
  document.getElementById('clearParentBtn')?.addEventListener('click', clearCreateEntityParent);
  (document.getElementById('createEntityParentSearch') as HTMLInputElement).value = '';
}

function clearCreateEntityParent(): void {
  manageEntitiesState.selectedParentId = null;
  manageEntitiesState.selectedParentName = null;
  document.getElementById('createEntitySelectedParent')!.style.display = 'none';
}

export function createNewEntity(): void {
  if (!manageEntitiesState.selectedParentId) { alert('Please select a parent entity.'); return; }
  const name = (document.getElementById('createEntityName') as HTMLInputElement).value.trim();
  if (!name) { alert('Please enter an entity name.'); return; }

  showAddChildModal(manageEntitiesState.selectedParentId, name);
  closeManageEntitiesModal();
}

// --- Add/Delete operations ---

export function showAddChildModal(parentId: string, name?: string): void {
  const parentNode = findNodeById(MANUAL_DATA[currentCompany]?.root, parentId);
  if (!parentNode) return;

  const entityName = name || prompt(`Enter name for new entity under "${parentNode.name}":`);
  if (!entityName || !entityName.trim()) return;

  addManualMapChild(parentId, entityName.trim());
}

function addManualMapChild(parentId: string, name: string): void {
  const root = MANUAL_DATA[currentCompany]?.root;
  if (!root) return;

  const parentNode = findNodeById(root, parentId);
  if (!parentNode) return;

  const newId = `manual-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const newNode: any = {
    id: newId, name, type: 'group',
    level: (parentNode.level || 0) + 1,
    sites: [],
    notes: `Added manually on ${new Date().toISOString().split('T')[0]}`,
    gongEvidence: { status: 'unverified', totalMentions: 0, matchedContacts: [], matchedEntities: [], sizeMentions: [], teamSizes: [], snippets: [] },
    children: [],
  };

  if (!parentNode.children) parentNode.children = [];
  parentNode.children.push(newNode);

  if (!manualMapModifications[currentCompany]) manualMapModifications[currentCompany] = { added: [], deleted: [] };
  manualMapModifications[currentCompany].added.push({ id: newId, name, parentId, addedAt: new Date().toISOString() });

  saveManualMapModifications();
  _renderManualMapView?.();

  setTimeout(() => {
    const nodeEl = document.querySelector(`.node[data-id="${newId}"]`);
    if (nodeEl) (nodeEl as HTMLElement).click();
  }, 100);
}

export function confirmDeleteEntity(nodeId: string): void {
  const node = findNodeById(MANUAL_DATA[currentCompany]?.root, nodeId);
  if (!node) return;

  const childCount = countNodes(node) - 1;
  let message = `Are you sure you want to delete "${node.name}"?`;
  if (childCount > 0) message += `\n\nThis will also delete ${childCount} child ${childCount === 1 ? 'entity' : 'entities'}.`;

  if (confirm(message)) deleteManualMapNode(nodeId);
}

function deleteManualMapNode(nodeId: string): void {
  const root = MANUAL_DATA[currentCompany]?.root;
  if (!root) return;

  const parent = findNodeParent(root, nodeId);
  if (!parent || !parent.children) return;

  const nodeToDelete = findNodeById(root, nodeId);
  const deletedCount = nodeToDelete ? countNodes(nodeToDelete) : 1;

  parent.children = parent.children.filter((child: any) => child.id !== nodeId);

  if (!manualMapModifications[currentCompany]) manualMapModifications[currentCompany] = { added: [], deleted: [] };
  manualMapModifications[currentCompany].deleted.push({ id: nodeId, name: nodeToDelete?.name, parentId: parent.id, deletedAt: new Date().toISOString() });

  saveManualMapModifications();
  setSelectedManualNode(null);
  _renderManualMapView?.();
}

async function saveManualMapModifications(company?: string): Promise<void> {
  const co = company || currentCompany;
  localStorage.setItem('manualMapModifications', JSON.stringify(manualMapModifications));

  try {
    await fetch(kvApiUrl('manual-map-modifications', co), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modifications: manualMapModifications }),
    });
  } catch (e) {
    console.warn('[ManualMapMods] KV sync failed:', (e as Error).message);
  }

  if (MANUAL_DATA[co]) {
    try {
      await fetch(kvApiUrl('graduated-map', co), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map: MANUAL_DATA[co] }),
      });
    } catch (e) {
      console.warn('[ManualMap] KV sync failed:', (e as Error).message);
      showToast('Manual map sync failed - saved locally only', 'error');
    }
  }
}

// --- Delete entity list rendering ---

function renderDeleteEntityList(entities: Array<{ id: string; name: string; path: string }>): void {
  const listEl = document.getElementById('deleteEntityList')!;
  listEl.innerHTML = '';
  entities.forEach(entity => {
    const node = findNodeById(MANUAL_DATA[currentCompany]?.root, entity.id);
    const hasChildren = (node?.children?.length || 0) > 0;
    const item = document.createElement('div');
    item.style.cssText = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee;';
    item.innerHTML = `<div style="font-weight: 500;">${escapeHtml(entity.name)} ${hasChildren ? `<span style="color: #dc2626; font-size: 11px;">(+${node?.children?.length} children)</span>` : ''}</div><div style="font-size: 11px; color: #888;">${escapeHtml(entity.path)}</div>`;
    item.addEventListener('click', () => {
      manageEntitiesState.selectedDeleteId = entity.id;
      manageEntitiesState.selectedDeleteName = entity.name;
      manageEntitiesState.selectedDeleteHasChildren = hasChildren;
      const confirmDiv = document.getElementById('deleteEntityConfirm')!;
      confirmDiv.style.display = 'block';
      document.getElementById('deleteEntityName')!.textContent = entity.name;
      const warning = document.getElementById('deleteEntityChildrenWarning')!;
      warning.style.display = hasChildren ? 'inline' : 'none';
    });
    listEl.appendChild(item);
  });
}

export function filterDeleteEntityList(): void {
  const search = (document.getElementById('deleteEntitySearch') as HTMLInputElement).value.toLowerCase();
  const filtered = search ? manageEntitiesState.allEntities.filter(e => e.name.toLowerCase().includes(search)) : manageEntitiesState.allEntities;
  renderDeleteEntityList(filtered);
}

export function cancelDeleteEntity(): void {
  document.getElementById('deleteEntityConfirm')!.style.display = 'none';
  manageEntitiesState.selectedDeleteId = null;
}

export function confirmDeleteFromModal(): void {
  if (manageEntitiesState.selectedDeleteId) {
    deleteManualMapNode(manageEntitiesState.selectedDeleteId);
    closeManageEntitiesModal();
  }
}
