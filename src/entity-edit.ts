// Inline field editing for Manual Map nodes

import { currentCompany, fieldEdits, editingNodeId, setEditingNodeId } from './state';
import { escapeHtml } from './utils';
import { findNodeById } from './tree-ops';
import { getFieldValue, saveFieldEditToKV } from './kv';

// Lazy import to avoid circular dep with tree-view
let _renderManualMapView: (() => void) | null = null;
export function registerEditRenderer(fn: () => void): void { _renderManualMapView = fn; }

export function startEditManualNode(nodeId: string, nodeEl: HTMLElement): void {
  if (editingNodeId) cancelEditManualNode();
  setEditingNodeId(nodeId);
  nodeEl.classList.add('editing');

  const node = findNodeById(MANUAL_DATA[currentCompany]?.root, nodeId);
  if (!node) return;

  const currentName = getFieldValue(node, 'name');
  const currentLeaderName = getFieldValue(node, 'leaderName');
  const currentLeaderTitle = getFieldValue(node, 'leaderTitle');

  nodeEl.dataset.originalHtml = nodeEl.innerHTML;

  nodeEl.innerHTML = `
    <div class="edit-form" style="text-align: left; padding: 8px;">
      <label style="font-size: 10px; color: #666; display: block; margin-bottom: 2px;">Entity Name</label>
      <input type="text" class="edit-field" id="edit-mm-name" value="${escapeHtml(currentName)}" placeholder="Entity name">
      <label style="font-size: 10px; color: #666; display: block; margin-top: 8px; margin-bottom: 2px;">Leader Name</label>
      <input type="text" class="edit-field" id="edit-mm-leaderName" value="${escapeHtml(currentLeaderName)}" placeholder="Leader name">
      <label style="font-size: 10px; color: #666; display: block; margin-top: 8px; margin-bottom: 2px;">Leader Title</label>
      <input type="text" class="edit-field" id="edit-mm-leaderTitle" value="${escapeHtml(currentLeaderTitle)}" placeholder="Leader title">
      <div class="edit-actions" style="margin-top: 8px; display: flex; gap: 8px;">
        <button class="edit-save-btn" id="edit-mm-save" style="background: #4CAF50; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer;">Save</button>
        <button class="edit-cancel-btn" id="edit-mm-cancel" style="background: #666; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer;">Cancel</button>
      </div>
    </div>
  `;

  // Attach event listeners (no inline onclick)
  document.getElementById('edit-mm-save')?.addEventListener('click', (e) => {
    e.stopPropagation();
    saveEditManualNode(nodeId);
  });
  document.getElementById('edit-mm-cancel')?.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelEditManualNode();
  });
  // Stop propagation on inputs so clicking doesn't trigger node select
  nodeEl.querySelectorAll('input').forEach(input => {
    input.addEventListener('click', (e) => e.stopPropagation());
  });

  document.getElementById('edit-mm-name')?.focus();
}

export function saveEditManualNode(nodeId: string): void {
  const node = findNodeById(MANUAL_DATA[currentCompany]?.root, nodeId);
  if (!node) return;

  const newName = (document.getElementById('edit-mm-name') as HTMLInputElement)?.value.trim() ?? '';
  const newLeaderName = (document.getElementById('edit-mm-leaderName') as HTMLInputElement)?.value.trim() ?? '';
  const newLeaderTitle = (document.getElementById('edit-mm-leaderTitle') as HTMLInputElement)?.value.trim() ?? '';

  const originalName = node.name || '';
  const dm = node.gongEvidence?.matchedContacts?.find((c: any) => c.isDecisionMaker);
  const originalLeaderName = node.leader?.name || dm?.name || '';
  const originalLeaderTitle = node.leader?.title || dm?.title || '';

  const edit: Record<string, any> = {};
  let hasChanges = false;

  if (newName !== originalName) { edit.name = { original: originalName, edited: newName }; hasChanges = true; }
  if (newLeaderName !== originalLeaderName) { edit.leaderName = { original: originalLeaderName, edited: newLeaderName }; hasChanges = true; }
  if (newLeaderTitle !== originalLeaderTitle) { edit.leaderTitle = { original: originalLeaderTitle, edited: newLeaderTitle }; hasChanges = true; }

  if (hasChanges) {
    fieldEdits[nodeId] = { ...fieldEdits[nodeId], ...edit, editedAt: new Date().toISOString() };
    localStorage.setItem('fieldEdits', JSON.stringify(fieldEdits));
    saveFieldEditToKV(currentCompany, nodeId, fieldEdits[nodeId]);
  }

  setEditingNodeId(null);
  _renderManualMapView?.();
}

export function cancelEditManualNode(): void {
  if (!editingNodeId) return;
  setEditingNodeId(null);
  _renderManualMapView?.();
}
