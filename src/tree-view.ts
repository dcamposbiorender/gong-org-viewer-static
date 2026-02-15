// Manual Map tree rendering and view management

import {
  currentCompany, selectedManualNode, setSelectedManualNode,
  draggedNodeId, setDraggedNodeId, _cachedDragTree, setCachedDragTree,
  manualMapOverrides,
} from './state';
import { escapeHtml, showToast, flushConnectorMeasurements } from './utils';
import { getDisplaySize, countNodes } from './tree-ops';
import {
  getFieldValue, buildManualMapWorkingTree, isManualMapDescendant,
  getManualMapOriginalParentName, saveManualMapOverrides, saveManualMapOverrideToKV,
} from './kv';
import { renderTable } from './table-view';

// Lazy imports to avoid circular deps
let _startEditManualNode: ((nodeId: string, nodeEl: HTMLElement) => void) | null = null;
let _showManualNodeEvidence: ((node: any) => void) | null = null;
let _getApprovedMatchesForNode: ((company: string, name: string) => any[]) | null = null;

export function registerTreeViewDeps(deps: {
  startEditManualNode: (nodeId: string, nodeEl: HTMLElement) => void;
  showManualNodeEvidence: (node: any) => void;
  getApprovedMatchesForNode: (company: string, name: string) => any[];
}): void {
  _startEditManualNode = deps.startEditManualNode;
  _showManualNodeEvidence = deps.showManualNodeEvidence;
  _getApprovedMatchesForNode = deps.getApprovedMatchesForNode;
}

function renderManualMapTree(node: any, level = 0): HTMLElement {
  const div = document.createElement('div');
  div.className = `child-branch level-${level}`;

  const evidence = node.gongEvidence || {};
  let status = evidence.status || 'unverified';

  const approvedMatches = _getApprovedMatchesForNode?.(currentCompany, node.name) ?? [];
  if (approvedMatches.length > 0 && status === 'unverified') {
    status = 'supported';
  }

  const nodeEl = document.createElement('div');
  nodeEl.className = 'node manual-map-node mm-node';
  nodeEl.dataset.id = node.id;
  nodeEl.dataset.status = status;
  nodeEl.dataset.nodeName = node.name;

  if (manualMapOverrides[node.id]) nodeEl.classList.add('user-override');
  nodeEl.draggable = level > 0;

  // Status indicator
  if (status !== 'unverified') {
    nodeEl.classList.add('has-changes');
    const indicators = document.createElement('div');
    indicators.className = 'node-change-indicators';
    const dot = document.createElement('div');
    dot.className = `node-change-dot ${status === 'supported' ? 'size' : 'reorg'}`;
    dot.title = status === 'supported' ? 'Supported by Gong data' : 'Conflicts with Gong data';
    if (approvedMatches.length > 0) dot.title += ` (+${approvedMatches.length} approved match${approvedMatches.length > 1 ? 'es' : ''})`;
    indicators.appendChild(dot);
    nodeEl.appendChild(indicators);
  }

  // Edit button
  const editBtn = document.createElement('span');
  editBtn.className = 'edit-btn';
  editBtn.innerHTML = '✎';
  editBtn.title = 'Edit entity';
  editBtn.style.cssText = 'cursor: pointer; font-size: 11px; color: #8b7355; position: absolute; top: 2px; left: 2px;';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    _startEditManualNode?.(node.id, nodeEl);
  });
  nodeEl.appendChild(editBtn);

  // Node name
  const nameEl = document.createElement('div');
  nameEl.className = 'node-name';
  nameEl.textContent = getFieldValue(node, 'name');
  nodeEl.appendChild(nameEl);

  // Leader
  const leader = node.leader || evidence.matchedContacts?.find((c: any) => c.isDecisionMaker);
  if (leader?.name) {
    const leaderEl = document.createElement('div');
    leaderEl.className = 'node-leader';
    leaderEl.textContent = leader.title ? `${leader.name}, ${leader.title}` : leader.name;
    nodeEl.appendChild(leaderEl);
  }

  // Meta
  const metaParts: string[] = [];
  const displayedSize = getDisplaySize(node, currentCompany);
  if (displayedSize) {
    metaParts.push(`<strong>${displayedSize}</strong>`);
  } else if (evidence.teamSizes?.length > 0) {
    metaParts.push(`<strong>${evidence.teamSizes[0]}</strong>`);
  } else if (approvedMatches.length > 0) {
    const firstMatchWithSize = approvedMatches.find((m: any) => m.team_size);
    if (firstMatchWithSize) metaParts.push(`<strong>${firstMatchWithSize.team_size}</strong>`);
  }
  const totalMentions = (evidence.totalMentions || 0) + approvedMatches.length;
  if (totalMentions > 0) metaParts.push(`${totalMentions} mentions`);
  if (node.sites?.length > 0) metaParts.push(node.sites[0]);

  if (metaParts.length > 0) {
    const metaEl = document.createElement('div');
    metaEl.className = 'node-meta';
    metaEl.innerHTML = metaParts.join(' · ');
    nodeEl.appendChild(metaEl);
  }

  // Click handler
  nodeEl.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.node.selected').forEach(el => el.classList.remove('selected'));
    nodeEl.classList.add('selected');
    setSelectedManualNode(node);
    _showManualNodeEvidence?.(node);
  });

  // Drag events
  nodeEl.addEventListener('dragstart', (e) => {
    setDraggedNodeId(node.id);
    setCachedDragTree(buildManualMapWorkingTree(MANUAL_DATA[currentCompany].root));
    nodeEl.classList.add('dragging');
    e.dataTransfer!.effectAllowed = 'move';
  });

  nodeEl.addEventListener('dragend', () => {
    setDraggedNodeId(null);
    setCachedDragTree(null);
    nodeEl.classList.remove('dragging');
    document.querySelectorAll('.drag-over, .drag-invalid').forEach(el => el.classList.remove('drag-over', 'drag-invalid'));
  });

  nodeEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!draggedNodeId || draggedNodeId === node.id) return;
    const tree = _cachedDragTree || buildManualMapWorkingTree(MANUAL_DATA[currentCompany].root);
    if (isManualMapDescendant(draggedNodeId, node.id, tree)) {
      nodeEl.classList.add('drag-invalid');
      nodeEl.classList.remove('drag-over');
    } else {
      nodeEl.classList.add('drag-over');
      nodeEl.classList.remove('drag-invalid');
    }
  });

  nodeEl.addEventListener('dragleave', () => nodeEl.classList.remove('drag-over', 'drag-invalid'));

  nodeEl.addEventListener('drop', (e) => {
    e.preventDefault();
    nodeEl.classList.remove('drag-over', 'drag-invalid');
    if (!draggedNodeId || draggedNodeId === node.id) return;
    const tree = _cachedDragTree || buildManualMapWorkingTree(MANUAL_DATA[currentCompany].root);
    if (isManualMapDescendant(draggedNodeId, node.id, tree)) return;

    const newOverride = {
      originalParent: getManualMapOriginalParentName(draggedNodeId),
      newParent: node.id,
      newParentName: node.name,
      movedAt: new Date().toISOString().split('T')[0],
    };
    manualMapOverrides[draggedNodeId] = newOverride;
    saveManualMapOverrides();
    saveManualMapOverrideToKV(currentCompany, draggedNodeId, newOverride);
    renderManualMapView();
  });

  div.appendChild(nodeEl);

  // Children
  if (node.children && node.children.length > 0) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'children-container';
    const children = document.createElement('div');
    children.className = 'children';
    if (node.children.length > 1) children.classList.add('multi');
    if (node.children.length > 1) {
      children.style.setProperty('--half-width', `${(node.children.length - 1) * 50}%`);
    }
    node.children.forEach((child: any) => children.appendChild(renderManualMapTree(child, level + 1)));
    childrenContainer.appendChild(children);
    div.appendChild(childrenContainer);
  }

  return div;
}

export function renderManualMapView(): void {
  const companyKey = currentCompany;

  if (!MANUAL_DATA[companyKey]?.root) {
    const tree = document.getElementById('tree');
    if (tree) {
      tree.innerHTML = `
        <div class="no-manual-map" style="padding: 48px; text-align: center;">
          <h3>No manual map available for ${escapeHtml(MANUAL_DATA[companyKey]?.company || companyKey)}</h3>
          <p>No manual map data found for this company.</p>
        </div>`;
    }
    return;
  }

  const manualData = MANUAL_DATA[companyKey];

  // Update stats
  const stats = manualData.stats || {};
  const entityCount = stats.entities || (stats as any).totalNodes || 0;
  const matchedCount = stats.matched || 0;
  const snippetCount = stats.snippets || 0;
  const matchRate = entityCount > 0 ? Math.round((matchedCount / entityCount) * 100) : 0;

  const statsEl = document.getElementById('stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <span>${entityCount} entities</span>
      <span style="color: #059669; padding: 2px 8px; border-radius: 4px; background: rgba(5, 150, 105, 0.1);">${matchedCount} matched orgs (${matchRate}%)</span>
      <span style="color: #6366f1; padding: 2px 8px; border-radius: 4px; background: rgba(99, 102, 241, 0.1);">${snippetCount} snippets</span>`;
  }

  // Render tree
  const tree = document.getElementById('tree');
  if (tree) {
    tree.innerHTML = '';
    const root = manualData.root;
    if (root) {
      const workingRoot = buildManualMapWorkingTree(root);
      tree.appendChild(renderManualMapTree(workingRoot, 0));
    }
  }

  // Render table (for when user switches to table view)
  renderTable(undefined, undefined);

  // Reset evidence panel
  const content = document.getElementById('evidenceContent');
  if (content) content.innerHTML = '<div class="evidence-empty">Select a node to view evidence</div>';
  const title = document.getElementById('evidenceTitleText');
  if (title) title.textContent = 'Source Evidence';
}

/** Scroll to and highlight a snippet card by its original index. */
export function scrollToSnippet(snippetOrigIdx: number): void {
  const snippetCard = document.querySelector(`.snippet-card[data-snippet-orig-idx="${snippetOrigIdx}"]`);
  if (snippetCard) {
    document.querySelectorAll('.snippet-card.highlighted').forEach(el => el.classList.remove('highlighted'));
    snippetCard.classList.add('highlighted');
    snippetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => snippetCard.classList.remove('highlighted'), 3000);
  }
}
