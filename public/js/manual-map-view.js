// Manual Map View: tree rendering and filtering

function renderManualMapTree(node, level = 0) {
  const div = document.createElement('div');
  div.className = `child-branch level-${level}`;

  const evidence = node.gongEvidence || {};
  let status = evidence.status || 'unverified';

  // Check for approved matches that would upgrade status
  const approvedMatches = getApprovedMatchesForNode(currentCompany, node.name);
  if (approvedMatches.length > 0 && status === 'unverified') {
    status = 'supported'; // Approved matches count as support
  }

  const nodeEl = document.createElement('div');
  nodeEl.className = 'node manual-map-node mm-node';
  nodeEl.dataset.id = node.id;
  nodeEl.dataset.status = status;
  nodeEl.dataset.nodeName = node.name;

  // Enable drag for non-root nodes
  if (manualMapOverrides[node.id]) nodeEl.classList.add('user-override');
  nodeEl.draggable = level > 0;

  // Status indicator (colored dot)
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

  // Add edit pencil icon at top-left
  const editBtn = document.createElement('span');
  editBtn.className = 'edit-btn';
  editBtn.innerHTML = '✎';
  editBtn.title = 'Edit entity';
  editBtn.style.cssText = 'cursor: pointer; font-size: 11px; color: #8b7355; position: absolute; top: 2px; left: 2px;';
  editBtn.onclick = (e) => {
    e.stopPropagation();
    startEditManualNode(node.id, nodeEl);
  };
  nodeEl.appendChild(editBtn);

  // Node name (use edited value if available)
  const nameEl = document.createElement('div');
  nameEl.className = 'node-name';
  nameEl.textContent = getFieldValue(node, 'name');
  nodeEl.appendChild(nameEl);

  // Leader from manual map node.leader OR from Gong-extracted matchedContacts
  const leader = node.leader || evidence.matchedContacts?.find(c => c.isDecisionMaker);
  if (leader?.name) {
    const leaderEl = document.createElement('div');
    leaderEl.className = 'node-leader';
    leaderEl.textContent = leader.title ? `${leader.name}, ${leader.title}` : leader.name;
    nodeEl.appendChild(leaderEl);
  }

  // Meta info (with bolded team sizes)
  const metaParts = [];
  // Get displayed size (respecting user overrides)
  const displayedSizeMM = getDisplaySize(node, currentCompany);
  if (displayedSizeMM) {
    metaParts.push(`<strong>${displayedSizeMM}</strong>`);
  } else if (evidence.teamSizes?.length > 0) {
    metaParts.push(`<strong>${evidence.teamSizes[0]}</strong>`);
  } else if (approvedMatches.length > 0) {
    // Show team size from first approved match if available
    const firstMatchWithSize = approvedMatches.find(m => m.team_size);
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
    // Deselect previous
    document.querySelectorAll('.node.selected').forEach(el => el.classList.remove('selected'));
    nodeEl.classList.add('selected');
    selectedManualNode = node;
    showManualNodeEvidence(node);
  });

  // Drag events for Manual Map
  nodeEl.addEventListener('dragstart', (e) => {
    draggedNodeId = node.id;
    _cachedDragTree = buildManualMapWorkingTree(MANUAL_DATA[currentCompany].root);
    nodeEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  nodeEl.addEventListener('dragend', () => {
    draggedNodeId = null;
    _cachedDragTree = null;
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
      movedAt: new Date().toISOString().split('T')[0]
    };
    manualMapOverrides[draggedNodeId] = newOverride;
    saveManualMapOverrides();
    saveManualMapOverrideToKV(currentCompany, draggedNodeId, newOverride);
    renderManualMapView();
  });

  div.appendChild(nodeEl);

  // Render children (horizontal tree structure)
  if (node.children && node.children.length > 0) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'children-container';

    const children = document.createElement('div');
    children.className = 'children';
    if (node.children.length > 1) children.classList.add('multi');

    // Calculate connector width
    const childCount = node.children.length;
    if (childCount > 1) {
      children.style.setProperty('--half-width', `${(childCount - 1) * 50}%`);
    }

    node.children.forEach(child => {
      children.appendChild(renderManualMapTree(child, level + 1));
    });

    childrenContainer.appendChild(children);
    div.appendChild(childrenContainer);
  }

  return div;
}

// Render extracted matches panel
function renderExtractedMatches(manualNode) {
  const container = document.getElementById('extractedMatches');
  container.innerHTML = '';

  const evidence = manualNode.gongEvidence || {};
  const matchedEntities = evidence.matchedEntities || [];

  if (matchedEntities.length === 0) {
    container.innerHTML = '<div class="no-manual-map"><p>No extracted entities match this node</p></div>';
    return;
  }

  matchedEntities.forEach(match => {
    const matchEl = document.createElement('div');
    matchEl.className = `extracted-match ${match.parentMatch ? 'supported' : 'conflicting'}`;

    const nameEl = document.createElement('div');
    nameEl.className = 'extracted-match-name';
    nameEl.textContent = match.name;
    matchEl.appendChild(nameEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'extracted-match-meta';
    const parts = [];
    if (match.type) parts.push(match.type);
    if (match.extractedParent) parts.push(`Parent: ${match.extractedParent}`);
    if (!match.parentMatch) parts.push('(parent mismatch)');
    metaEl.textContent = parts.join(' | ');
    matchEl.appendChild(metaEl);

    container.appendChild(matchEl);
  });

  // Also show matched contacts
  const matchedContacts = evidence.matchedContacts || [];
  if (matchedContacts.length > 0) {
    const contactsHeader = document.createElement('div');
    contactsHeader.className = 'side-by-side-panel-header';
    contactsHeader.style.marginTop = '16px';
    contactsHeader.textContent = 'Contacts';
    container.appendChild(contactsHeader);

    matchedContacts.forEach(contact => {
      const contactEl = document.createElement('div');
      contactEl.className = 'extracted-match supported';
      contactEl.innerHTML = `
        <div class="extracted-match-name">${escapeHtml(contact.name)}</div>
        <div class="extracted-match-meta">${escapeHtml(contact.title || '')} ${contact.isDecisionMaker ? '(Decision Maker)' : ''}</div>
      `;
      container.appendChild(contactEl);
    });
  }
}

// Bold size mentions in text

function renderManualMapView() {
  const companyKey = currentCompany;

  // Check if manual map exists for this company
  if (!hasManualMap(companyKey)) {
    const tree = document.getElementById('tree');
    tree.innerHTML = `
      <div class="no-manual-map" style="padding: 48px; text-align: center;">
        <h3>No manual map available for ${escapeHtml(MANUAL_DATA[companyKey]?.company || companyKey)}</h3>
        <p>No manual map data found for this company.</p>
      </div>
    `;
    return;
  }

  const manualData = MANUAL_DATA[companyKey];

  // Update stats with clickable filters
  const stats = manualData.stats || {};
  const entityCount = stats.entities || stats.totalNodes || 0;
  const matchedCount = stats.matched || 0;
  const snippetCount = stats.snippets || 0;
  const matchRate = entityCount > 0 ? Math.round((matchedCount / entityCount) * 100) : 0;
  document.getElementById('stats').innerHTML = `
    <span>${entityCount} entities</span>
    <span class="stat-filter" data-filter="matched" style="color: #059669; cursor: pointer; padding: 2px 8px; border-radius: 4px; background: rgba(5, 150, 105, 0.1);" onclick="filterManualMapByStatus('auto_matched')" title="Click to show matched nodes">${matchedCount} matched orgs (${matchRate}%)</span>
    <span style="color: #6366f1; padding: 2px 8px; border-radius: 4px; background: rgba(99, 102, 241, 0.1);">${snippetCount} snippets</span>
  `;

  // Render tree into main tree container (horizontal layout)
  const tree = document.getElementById('tree');
  tree.innerHTML = '';

  const root = manualData.root;
  if (root) {
    // Build working tree with overrides applied
    const workingRoot = buildManualMapWorkingTree(root);
    tree.appendChild(renderManualMapTree(workingRoot, 0));
  }

  // Render table view (populated even if tree view is active, for when user switches)
  renderTable(null, null);

  // Reset evidence panel
  document.getElementById('evidenceContent').innerHTML = '<div class="evidence-empty">Select a node to view evidence</div>';
  document.getElementById('evidenceTitleText').textContent = 'Source Evidence';
}

// Track current filter for Manual Map
let manualMapStatusFilter = null;

function filterManualMapByStatus(status) {
  // Toggle filter if clicking same status
  if (manualMapStatusFilter === status) {
    manualMapStatusFilter = null;
  } else {
    manualMapStatusFilter = status;
  }

  // Update stat badge styling to show active filter
  document.querySelectorAll('.stat-filter').forEach(el => {
    const isActive = el.dataset.filter === manualMapStatusFilter;
    el.style.fontWeight = isActive ? 'bold' : 'normal';
    el.style.textDecoration = isActive ? 'underline' : 'none';
  });

  // Get all manual map nodes
  const allNodes = document.querySelectorAll('.mm-node');

  if (!manualMapStatusFilter) {
    // Show all nodes, reset highlights
    allNodes.forEach(node => {
      node.style.opacity = '1';
      node.style.display = '';
      node.style.boxShadow = 'none';
    });
    return;
  }

  // Filter nodes by status
  const manualData = MANUAL_DATA[currentCompany];
  if (!manualData) return;

  // Build a set of node names with the target status
  const targetNodes = new Set();

  function collectNodesByStatus(node) {
    const evidence = node.gongEvidence || {};
    const nodeStatus = evidence.status || 'unverified';
    if (nodeStatus === manualMapStatusFilter) {
      targetNodes.add(node.name);
    }
    if (node.children) {
      node.children.forEach(collectNodesByStatus);
    }
  }
  collectNodesByStatus(manualData.root);

  // Highlight matching nodes, dim others
  allNodes.forEach(nodeEl => {
    const nodeName = nodeEl.dataset.nodeName;
    if (targetNodes.has(nodeName)) {
      nodeEl.style.opacity = '1';
      const highlightColor = (manualMapStatusFilter === 'supported' || manualMapStatusFilter === 'auto_matched') ? 'rgba(5, 150, 105, 0.5)' : 'rgba(220, 38, 38, 0.5)';
      nodeEl.style.boxShadow = '0 0 8px 2px ' + highlightColor;
      // Scroll first match into view
      if (nodeEl === document.querySelector(`.mm-node[data-node-name="${nodeName}"]`)) {
        nodeEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    } else {
      nodeEl.style.opacity = '0.3';
      nodeEl.style.boxShadow = 'none';
    }
  });

  // Show count in a toast
  const count = targetNodes.size;
  showToast(`Found ${count} ${manualMapStatusFilter} node${count !== 1 ? 's' : ''}`);
}

