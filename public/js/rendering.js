// Rendering: tree, table, edits, CRUD, size chips, view/mode

function startEdit(nodeId, nodeEl) {
  if (editingNodeId) cancelEdit();
  editingNodeId = nodeId;
  nodeEl.classList.add('editing');

  const node = findNodeById(DATA[currentCompany]?.root, nodeId);
  if (!node) return;

  const currentName = getFieldValue(node, 'name');
  const currentLeaderName = getFieldValue(node, 'leaderName');
  const currentLeaderTitle = getFieldValue(node, 'leaderTitle');

  nodeEl.dataset.originalHtml = nodeEl.innerHTML;

  const editForm = `
    <div class="edit-form" style="text-align: left; padding: 8px;">
      <label style="font-size: 10px; color: #666; display: block; margin-bottom: 2px;">Entity Name</label>
      <input type="text" class="edit-field" id="edit-name" value="${escapeHtml(currentName)}" placeholder="Entity name" onclick="event.stopPropagation()">
      <label style="font-size: 10px; color: #666; display: block; margin-top: 8px; margin-bottom: 2px;">Leader Name</label>
      <input type="text" class="edit-field" id="edit-leaderName" value="${escapeHtml(currentLeaderName)}" placeholder="Leader name" onclick="event.stopPropagation()">
      <label style="font-size: 10px; color: #666; display: block; margin-top: 8px; margin-bottom: 2px;">Leader Title</label>
      <input type="text" class="edit-field" id="edit-leaderTitle" value="${escapeHtml(currentLeaderTitle)}" placeholder="Leader title" onclick="event.stopPropagation()">
      <div class="edit-actions" style="margin-top: 8px; display: flex; gap: 8px;">
        <button class="edit-save-btn" onclick="event.stopPropagation(); saveEdit('${nodeId}')" style="background: #4CAF50; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer;">Save</button>
        <button class="edit-cancel-btn" onclick="event.stopPropagation(); cancelEdit()" style="background: #666; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer;">Cancel</button>
      </div>
    </div>
  `;

  nodeEl.innerHTML = editForm;
  document.getElementById('edit-name').focus();
}

// Save field edits
function saveEdit(nodeId) {
  const node = findNodeById(DATA[currentCompany]?.root, nodeId);
  if (!node) return;

  const newName = document.getElementById('edit-name').value.trim();
  const newLeaderName = document.getElementById('edit-leaderName').value.trim();
  const newLeaderTitle = document.getElementById('edit-leaderTitle').value.trim();

  const originalName = node.name || '';
  const originalLeaderName = node.leader?.name || '';
  const originalLeaderTitle = node.leader?.title || '';

  const edit = {};
  let hasChanges = false;

  if (newName !== originalName) {
    edit.name = { original: originalName, edited: newName };
    hasChanges = true;
  }
  if (newLeaderName !== originalLeaderName) {
    edit.leaderName = { original: originalLeaderName, edited: newLeaderName };
    hasChanges = true;
  }
  if (newLeaderTitle !== originalLeaderTitle) {
    edit.leaderTitle = { original: originalLeaderTitle, edited: newLeaderTitle };
    hasChanges = true;
  }

  if (hasChanges) {
    fieldEdits[nodeId] = {
      ...fieldEdits[nodeId],
      ...edit,
      editedAt: new Date().toISOString()
    };
    localStorage.setItem('fieldEdits', JSON.stringify(fieldEdits));
    saveFieldEditToKV(currentCompany, nodeId, fieldEdits[nodeId]);
  }

  editingNodeId = null;
  renderCompany(currentCompany);
}

// Cancel editing
function cancelEdit() {
  if (!editingNodeId) return;
  const nodeEl = document.querySelector(`.node[data-id="${editingNodeId}"]`);
  if (nodeEl && nodeEl.dataset.originalHtml) {
    nodeEl.innerHTML = nodeEl.dataset.originalHtml;
    nodeEl.classList.remove('editing');
  }
  editingNodeId = null;
  renderCompany(currentCompany);
}

// Clear field edit for an entity
function clearFieldEdit(nodeId) {
  delete fieldEdits[nodeId];
  localStorage.setItem('fieldEdits', JSON.stringify(fieldEdits));
  deleteFieldEditFromKV(currentCompany, nodeId);
  renderCompany(currentCompany);
}

// Escape HTML for safe insertion

function startEditManualNode(nodeId, nodeEl) {
  if (editingNodeId) cancelEditManualNode();
  editingNodeId = nodeId;
  nodeEl.classList.add('editing');

  const node = findManualNodeById(MANUAL_DATA[currentCompany].root, nodeId);
  if (!node) return;

  const currentName = getFieldValue(node, 'name');
  const currentLeaderName = getFieldValue(node, 'leaderName');
  const currentLeaderTitle = getFieldValue(node, 'leaderTitle');

  nodeEl.dataset.originalHtml = nodeEl.innerHTML;

  const editForm = `
    <div class="edit-form" style="text-align: left; padding: 8px;">
      <label style="font-size: 10px; color: #666; display: block; margin-bottom: 2px;">Entity Name</label>
      <input type="text" class="edit-field" id="edit-mm-name" value="${escapeHtml(currentName)}" placeholder="Entity name" onclick="event.stopPropagation()">
      <label style="font-size: 10px; color: #666; display: block; margin-top: 8px; margin-bottom: 2px;">Leader Name</label>
      <input type="text" class="edit-field" id="edit-mm-leaderName" value="${escapeHtml(currentLeaderName)}" placeholder="Leader name" onclick="event.stopPropagation()">
      <label style="font-size: 10px; color: #666; display: block; margin-top: 8px; margin-bottom: 2px;">Leader Title</label>
      <input type="text" class="edit-field" id="edit-mm-leaderTitle" value="${escapeHtml(currentLeaderTitle)}" placeholder="Leader title" onclick="event.stopPropagation()">
      <div class="edit-actions" style="margin-top: 8px; display: flex; gap: 8px;">
        <button class="edit-save-btn" onclick="event.stopPropagation(); saveEditManualNode('${nodeId}')" style="background: #4CAF50; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer;">Save</button>
        <button class="edit-cancel-btn" onclick="event.stopPropagation(); cancelEditManualNode()" style="background: #666; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer;">Cancel</button>
      </div>
    </div>
  `;

  nodeEl.innerHTML = editForm;
  document.getElementById('edit-mm-name').focus();
}

// Save Manual Map node edit
function saveEditManualNode(nodeId) {
  const node = findManualNodeById(MANUAL_DATA[currentCompany].root, nodeId);
  if (!node) return;

  const newName = document.getElementById('edit-mm-name').value.trim();
  const newLeaderName = document.getElementById('edit-mm-leaderName').value.trim();
  const newLeaderTitle = document.getElementById('edit-mm-leaderTitle').value.trim();

  const originalName = node.name || '';
  // Manual Map nodes may have leader info in gongEvidence.matchedContacts or directly
  const decisionMaker = node.gongEvidence?.matchedContacts?.find(c => c.isDecisionMaker);
  const originalLeaderName = node.leader?.name || decisionMaker?.name || '';
  const originalLeaderTitle = node.leader?.title || decisionMaker?.title || '';

  const edit = {};
  let hasChanges = false;

  if (newName !== originalName) {
    edit.name = { original: originalName, edited: newName };
    hasChanges = true;
  }
  if (newLeaderName !== originalLeaderName) {
    edit.leaderName = { original: originalLeaderName, edited: newLeaderName };
    hasChanges = true;
  }
  if (newLeaderTitle !== originalLeaderTitle) {
    edit.leaderTitle = { original: originalLeaderTitle, edited: newLeaderTitle };
    hasChanges = true;
  }

  if (hasChanges) {
    fieldEdits[nodeId] = {
      ...fieldEdits[nodeId],
      ...edit,
      editedAt: new Date().toISOString()
    };
    localStorage.setItem('fieldEdits', JSON.stringify(fieldEdits));
    saveFieldEditToKV(currentCompany, nodeId, fieldEdits[nodeId]);
  }

  editingNodeId = null;
  renderManualMapView();
}

// Cancel Manual Map node edit
function cancelEditManualNode() {
  if (!editingNodeId) return;
  editingNodeId = null;
  renderManualMapView();
}

// Find node in Manual Map tree by ID
function findManualNodeById(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findManualNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
}

// Find parent of a node in Manual Map tree
function findManualNodeParent(node, targetId, parent = null) {
  if (!node) return null;
  if (node.id === targetId) return parent;
  if (node.children) {
    for (const child of node.children) {
      const found = findManualNodeParent(child, targetId, node);
      if (found) return found;
    }
  }
  return null;
}

// ===== MANUAL MAP CRUD =====


// State for tracking Manual Map modifications
let manualMapModifications = {}; // { companyKey: { added: [], deleted: [] } }

// Show modal to add a new child entity
function showAddChildModal(parentId) {
  const parentNode = findManualNodeById(MANUAL_DATA[currentCompany]?.root, parentId);
  if (!parentNode) return;

  const name = prompt(`Enter name for new entity under "${parentNode.name}":`);
  if (!name || !name.trim()) return;

  addManualMapChild(parentId, name.trim());
}

// Add a new child to a Manual Map node
function addManualMapChild(parentId, name) {
  const root = MANUAL_DATA[currentCompany]?.root;
  if (!root) return;

  const parentNode = findManualNodeById(root, parentId);
  if (!parentNode) return;

  // Generate unique ID
  const newId = `manual-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

  // Create new node
  const newNode = {
    id: newId,
    name: name,
    type: 'group',
    level: (parentNode.level || 0) + 1,
    sites: [],
    notes: `Added manually on ${new Date().toISOString().split('T')[0]}`,
    gongEvidence: {
      status: 'unverified',
      totalMentions: 0,
      matchedContacts: [],
      matchedEntities: [],
      sizeMentions: [],
      teamSizes: [],
      snippets: []
    },
    children: []
  };

  // Add to parent's children
  if (!parentNode.children) parentNode.children = [];
  parentNode.children.push(newNode);

  // Track modification
  if (!manualMapModifications[currentCompany]) {
    manualMapModifications[currentCompany] = { added: [], deleted: [] };
  }
  manualMapModifications[currentCompany].added.push({ id: newId, name, parentId, addedAt: new Date().toISOString() });

  // Save to localStorage
  saveManualMapModifications();

  // Update stats
  if (MANUAL_DATA[currentCompany].stats) {
    MANUAL_DATA[currentCompany].stats.totalNodes = (MANUAL_DATA[currentCompany].stats.totalNodes || 0) + 1;
  }

  // Re-render
  renderManualMapView();

  // Select the new node
  setTimeout(() => {
    const nodeEl = document.querySelector(`.node[data-id="${newId}"]`);
    if (nodeEl) {
      nodeEl.click();
    }
  }, 100);
}

// Confirm and delete an entity
function confirmDeleteEntity(nodeId) {
  const node = findManualNodeById(MANUAL_DATA[currentCompany]?.root, nodeId);
  if (!node) return;

  const childCount = countNodes(node) - 1;
  let message = `Are you sure you want to delete "${node.name}"?`;
  if (childCount > 0) {
    message += `\n\nThis will also delete ${childCount} child ${childCount === 1 ? 'entity' : 'entities'}.`;
  }

  if (confirm(message)) {
    deleteManualMapNode(nodeId);
  }
}

// Delete a node from Manual Map
function deleteManualMapNode(nodeId) {
  const root = MANUAL_DATA[currentCompany]?.root;
  if (!root) return;

  // Find and remove the node from its parent
  const parent = findManualNodeParent(root, nodeId);
  if (!parent || !parent.children) return;

  const nodeToDelete = findManualNodeById(root, nodeId);
  const deletedCount = countNodes(nodeToDelete);

  // Remove from parent's children
  parent.children = parent.children.filter(child => child.id !== nodeId);

  // Track modification
  if (!manualMapModifications[currentCompany]) {
    manualMapModifications[currentCompany] = { added: [], deleted: [] };
  }
  manualMapModifications[currentCompany].deleted.push({
    id: nodeId,
    name: nodeToDelete?.name,
    parentId: parent.id,
    deletedAt: new Date().toISOString()
  });

  // Save to localStorage
  saveManualMapModifications();

  // Update stats
  if (MANUAL_DATA[currentCompany].stats) {
    MANUAL_DATA[currentCompany].stats.totalNodes = Math.max(0, (MANUAL_DATA[currentCompany].stats.totalNodes || 0) - deletedCount);
  }

  // Clear selection
  selectedManualNode = null;

  // Re-render
  renderManualMapView();
}

// Save Manual Map modifications to localStorage AND KV
async function saveManualMapModifications(company) {
  const co = company || currentCompany;
  localStorage.setItem('manualMapModifications', JSON.stringify(manualMapModifications));

  // Always sync to KV for cross-browser persistence
  if (MANUAL_DATA[co]) {
    try {
      const response = await fetch(kvApiUrl('graduated-map', co), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map: MANUAL_DATA[co] })
      });
      if (!response.ok) {
        console.error('[ManualMap] KV sync failed:', response.status);
        showToast('Manual map sync failed - saved locally only', 'error');
      } else {
        console.log('[ManualMap] Synced entity changes to KV');
      }
    } catch (e) {
      console.error('[ManualMap] KV sync network error:', e.message);
      showToast('Manual map sync failed - saved locally only', 'error');
    }
  }
}

// Load manual map overlays from KV (user edits persisted server-side)

function getManualNodeSizeMentions(node) {
  const evidence = node.gongEvidence || {};
  let sizeMentions = [...(evidence.sizeMentions || [])];

  // Add size mentions from approved matches
  const approvedMatches = getApprovedMatchesForNode(currentCompany, node.name);
  approvedMatches.forEach(match => {
    if (match.team_size) {
      sizeMentions.push({
        value: String(match.team_size),
        source: {
          callDate: match.snippet_date,
          customerName: match.person_name
        }
      });
    }
  });

  return sizeMentions;
}

// Handle size chip click - always scroll to snippet, normal click also selects and populates input
function handleSizeChipClick(event, nodeId, sizeIdx, snippetIdx) {
  event.preventDefault();

  // Always scroll to the relevant snippet
  if (snippetIdx !== undefined && snippetIdx !== null) {
    scrollToSnippet(snippetIdx);
  }

  if (!event.shiftKey) {
    // Normal click: also select this size as source of truth

    // Get the numeric value from the size mention
    let numericValue = '';
    if (selectedManualNode) {
      const sizeMentions = getManualNodeSizeMentions(selectedManualNode);
      if (sizeMentions[sizeIdx]) {
        numericValue = String(sizeMentions[sizeIdx].value || '').replace(/[^\d]/g, '');
      }
    } else if (selectedNode) {
      const sizeMentions = selectedNode.sizeMentions || [];
      if (sizeMentions[sizeIdx]) {
        numericValue = String(sizeMentions[sizeIdx].value || '').replace(/[^\d]/g, '');
      }
    }

    // Set the override with both the index and the custom value
    setSizeOverride(currentCompany, nodeId, sizeIdx, numericValue);

    // Re-render the evidence panel to show updated selection
    if (selectedManualNode) {
      // Manual Map mode - re-render tree to update node meta and evidence panel
      renderManualMapView();
      // Re-select the node to show evidence
      setTimeout(() => {
        const nodeEl = document.querySelector(`.mm-node[data-id="${selectedManualNode.id}"]`);
        if (nodeEl) {
          nodeEl.classList.add('selected');
          showManualNodeEvidence(selectedManualNode);
        }
      }, 0);
    } else {
      // Auto mode - re-render to update displayed size in tree
      renderCompany(currentCompany);
      // Re-select the node after re-render
      setTimeout(() => {
        const nodeEl = document.querySelector(`.node[data-id="${nodeId}"]`);
        if (nodeEl && selectedNode) {
          nodeEl.classList.add('selected');
          selectNode(selectedNode, nodeEl);
        }
      }, 0);
    }
  }
  // Shift+click: only scroll, don't change selection
}

// Handle manual team size input change
function handleTeamSizeInputChange(nodeId, value) {
  const numericValue = value.trim();

  if (numericValue === '') {
    // Clear the override if input is empty
    clearSizeOverride(nodeId);
  } else {
    // Set custom value override (selectedSizeIndex = null means custom input)
    setSizeOverride(currentCompany, nodeId, null, numericValue);
  }

  // Re-render to update the org chart display
  if (selectedManualNode) {
    // Manual Map mode - re-render tree to update node meta
    renderManualMapView();
    // Re-select the node to show evidence
    setTimeout(() => {
      const nodeEl = document.querySelector(`.mm-node[data-id="${selectedManualNode.id}"]`);
      if (nodeEl) {
        nodeEl.classList.add('selected');
        showManualNodeEvidence(selectedManualNode);
      }
    }, 0);
  } else {
    renderTree();
    // Re-select to update evidence panel
    const nodeEl = document.querySelector('.node.selected');
    if (selectedNode && nodeEl) {
      selectNode(selectedNode, nodeEl, rangeStart, rangeEnd);
    }
  }
}


function renderTree(node, level = 0, rangeStart, rangeEnd) {
  // Skip absorbed (merged) entities
  if (isEntityAbsorbed(node.id)) {
    const div = document.createElement('div');
    div.style.display = 'none';
    return div;
  }

  const div = document.createElement('div');
  div.className = `child-branch level-${level}`;

  const nodeEl = document.createElement('div');
  nodeEl.className = 'node';

  // Check if entity existed in date range
  const firstSeen = node.firstSeen ? new Date(node.firstSeen) : new Date('2024-01-01');
  const rangeStartDate = new Date(rangeStart);
  if (firstSeen > rangeStartDate) {
    // Entity didn't exist at start of range - show dimmed
  }

  // Filter snippets by date range
  const snippetsInRange = node.snippets?.filter(s => isInDateRange(s.date, rangeStart, rangeEnd)) || [];
  if (snippetsInRange.length === 0 && level > 0) {
    nodeEl.classList.add('outside-range');
  }

  if (node.override) nodeEl.classList.add('user-override');
  if (fieldEdits[node.id]) nodeEl.classList.add('user-edited');
  nodeEl.dataset.id = node.id;
  nodeEl.draggable = level > 0;

  // Change indicators
  const changes = getChangesForEntity(node.id, rangeStart, rangeEnd);
  const hasChanges = changes.reorg.length || changes.leadership.length || changes.size.length;

  if (hasChanges) {
    nodeEl.classList.add('has-changes');
    const indicators = document.createElement('div');
    indicators.className = 'node-change-indicators';
    if (changes.reorg.length) indicators.innerHTML += '<div class="node-change-dot reorg"></div>';
    if (changes.leadership.length) indicators.innerHTML += '<div class="node-change-dot leadership"></div>';
    if (changes.size.length) indicators.innerHTML += '<div class="node-change-dot size"></div>';
    nodeEl.appendChild(indicators);
  }

  // Node name (use edited value if available)
  const nameEl = document.createElement('div');
  nameEl.className = 'node-name';
  nameEl.textContent = getFieldValue(node, 'name');

  // Add edit pencil icon
  const editBtn = document.createElement('span');
  editBtn.className = 'edit-btn';
  editBtn.innerHTML = '✎';
  editBtn.title = 'Edit entity';
  editBtn.style.cssText = 'cursor: pointer; margin-left: 6px; font-size: 11px; color: #8b7355;';
  editBtn.onclick = (e) => {
    e.stopPropagation();
    startEdit(node.id, nodeEl);
  };
  nameEl.appendChild(editBtn);
  nodeEl.appendChild(nameEl);
  
  // Leader
  if (node.leader?.name) {
    const leaderEl = document.createElement('div');
    leaderEl.className = 'node-leader';

    // Check for verification data
    const verification = node.leader.verification;
    const resolutionKey = getResolutionKey(currentCompany, node.id, node.leader.name);
    const resolution = conflictResolutions[resolutionKey];

    // Use public title if it's more detailed (longer) than Gong title
    let displayTitle = node.leader.title || '';
    if (verification?.public_data?.title) {
      const publicTitle = verification.public_data.title;
      // Use public title if it's more detailed (contains more info)
      if (publicTitle.length > displayTitle.length || !displayTitle) {
        displayTitle = publicTitle;
      }
    }
    let leaderText = displayTitle ? `${node.leader.name}, ${displayTitle}` : node.leader.name;

    if (verification) {
      const status = verification.verification_status;
      const publicData = verification.public_data;

      if (resolution) {
        // Conflict has been resolved - show blue badge
        const resolvedTitle = `Resolved as "${resolution.choice}" on ${new Date(resolution.resolvedAt).toLocaleDateString()}`;
        leaderEl.innerHTML = `<a href="${publicData?.source_url || '#'}" target="_blank" class="verification-link" title="${resolvedTitle}">${leaderText}</a><span class="verification-badge resolved" title="${resolvedTitle}" style="cursor: pointer;" onclick="event.stopPropagation(); openResolveModal(${JSON.stringify(verification).replace(/"/g, '&quot;')}, '${node.id}', '${node.leader.name.replace(/'/g, "\\'")}')">✓</span>`;
      } else if (status === 'match' && publicData?.source_url) {
        // Match - green checkmark with link
        leaderEl.innerHTML = `<a href="${publicData.source_url}" target="_blank" class="verification-link" title="Verified via ${publicData.source_name || 'web'}">${leaderText}</a><span class="verification-badge match" title="Verified">✓</span>`;
      } else if (status === 'conflict' && publicData?.source_url) {
        // Conflict - red X with link, clickable to resolve
        const conflictTitle = `Conflict: Gong says "${verification.gong_data?.title || ''}", public says "${publicData.title || ''}" - Click to resolve`;
        leaderEl.innerHTML = `<a href="${publicData.source_url}" target="_blank" class="verification-link" title="${conflictTitle}">${leaderText}</a><span class="verification-badge conflict" title="Click to resolve" style="cursor: pointer;" onclick="event.stopPropagation(); openResolveModal(${JSON.stringify(verification).replace(/"/g, '&quot;')}, '${node.id}', '${node.leader.name.replace(/'/g, "\\'")}')">✗</span>`;
      } else {
        // No verification but check for LinkedIn/email from Exa enrichment
        let enrichedHtml = leaderText;
        if (node.leader.linkedin_url) {
          enrichedHtml = `<a href="${node.leader.linkedin_url}" target="_blank" class="verification-link" title="View LinkedIn Profile">${leaderText}</a><span class="linkedin-badge" title="LinkedIn Profile">in</span>`;
        }
        leaderEl.innerHTML = enrichedHtml;
      }
    } else {
      // No verification but check for LinkedIn/email from Exa enrichment
      let enrichedHtml = leaderText;
      if (node.leader.linkedin_url) {
        enrichedHtml = `<a href="${node.leader.linkedin_url}" target="_blank" class="verification-link" title="View LinkedIn Profile">${leaderText}</a><span class="linkedin-badge" title="LinkedIn Profile">in</span>`;
      }
      leaderEl.innerHTML = enrichedHtml;
    }
    nodeEl.appendChild(leaderEl);
  } else if (level > 0) {
    const leaderEl = document.createElement('div');
    leaderEl.className = 'node-leader node-unknown';
    leaderEl.textContent = '?, ?';
    nodeEl.appendChild(leaderEl);
  }
  
  // Meta - use getDisplaySize to respect user overrides
  const metaParts = [];
  const displayedSize = getDisplaySize(node, currentCompany);
  if (displayedSize) metaParts.push(displayedSize);
  metaParts.push(snippetsInRange.length + ' in range');
  if (node.conflicts?.length) metaParts.push(`<span class="conflicts">${node.conflicts.length} conflicts</span>`);
  
  const metaEl = document.createElement('div');
  metaEl.className = 'node-meta';
  metaEl.innerHTML = metaParts.join(' · ');
  nodeEl.appendChild(metaEl);
  
  // Events
  nodeEl.addEventListener('click', (e) => {
    e.stopPropagation();
    selectNode(node, nodeEl, rangeStart, rangeEnd);
  });
  
  // Drag events
  nodeEl.addEventListener('dragstart', (e) => {
    draggedNodeId = node.id;
    _cachedDragTree = buildWorkingTree(DATA[currentCompany]?.root);
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
    const tree = _cachedDragTree || buildWorkingTree(DATA[currentCompany]?.root);
    if (isDescendant(draggedNodeId, node.id, tree)) {
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
    const tree = _cachedDragTree || buildWorkingTree(DATA[currentCompany]?.root);
    if (isDescendant(draggedNodeId, node.id, tree)) return;
    
    const newOverride = {
      originalParent: getOriginalParentName(draggedNodeId),
      newParent: node.id,
      newParentName: node.name,
      movedAt: new Date().toISOString().split('T')[0]
    };
    overrides[draggedNodeId] = newOverride;
    saveOverrides();
    saveOverrideToKV(currentCompany, draggedNodeId, newOverride); // Sync to Vercel KV
    renderCompany(currentCompany);
  });
  
  div.appendChild(nodeEl);
  
  // Children
  if (node.children?.length) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'children-container';
    const childrenEl = document.createElement('div');
    childrenEl.className = 'children' + (node.children.length > 1 ? ' multi' : '');
    
    if (node.children.length > 1) {
      // Queue layout measurement — collected and batched in a single rAF
      // (see _pendingConnectorMeasurements in renderCompany/renderManualMapView)
      if (!window._pendingConnectorMeasurements) window._pendingConnectorMeasurements = [];
      window._pendingConnectorMeasurements.push(childrenEl);
    }
    
    node.children.forEach(child => childrenEl.appendChild(renderTree(child, level + 1, rangeStart, rangeEnd)));
    childrenContainer.appendChild(childrenEl);
    div.appendChild(childrenContainer);
  }
  
  return div;
}

// Get combined snippets for a node (including absorbed entities)
function getNodeSnippets(node) {
  let snippets = [...(node.snippets || [])];
  if (entityMerges[node.id]) {
    for (const absorbedId of (entityMerges[node.id].absorbed || [])) {
      const absorbedNode = findNodeById(DATA[currentCompany]?.root, absorbedId);
      if (absorbedNode?.snippets) {
        snippets.push(...absorbedNode.snippets);
      }
    }
    // Dedupe by callId + quote prefix
    const seen = new Set();
    snippets = snippets.filter(s => {
      const key = (s.callId || '') + ':' + (s.quote || '').slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return snippets;
}

function selectNode(node, nodeEl, rangeStart, rangeEnd) {
  document.querySelectorAll('.node.selected').forEach(el => el.classList.remove('selected'));
  nodeEl.classList.add('selected');
  selectedNode = node;

  const content = document.getElementById('evidenceContent');
  const allSnippets = getNodeSnippets(node);
  const snippetsInRange = allSnippets.filter(s => isInDateRange(s.date, rangeStart, rangeEnd)) || [];
  const changes = getChangesForEntity(node.id, rangeStart, rangeEnd);
  
  // Build size mentions HTML with clickable chips and editable override input
  const sizeMentions = node.sizeMentions || [];
  const sizeOverrideKey = getSizeOverrideKey(currentCompany, node.id);
  const currentSizeOverride = sizeOverrides[sizeOverrideKey];

  // Get current displayed size value for the input
  const currentDisplayedSize = getDisplaySize(node, currentCompany) || '';
  // Extract just the numeric part for the input (e.g., "150 people" -> "150")
  const currentSizeNumber = currentSizeOverride?.customValue ||
    (currentDisplayedSize ? currentDisplayedSize.replace(/[^\d]/g, '') : '');

  let sizeMentionsHtml = '';

  // Always show the team size override input
  sizeMentionsHtml = `
    <div class="team-size-override">
      <span class="team-size-override-label">Team size</span>
      <input type="text" class="team-size-override-input" id="teamSizeInput-${node.id}"
             value="${currentSizeNumber}"
             placeholder="—"
             onchange="handleTeamSizeInputChange('${node.id}', this.value)"
             onkeydown="if(event.key==='Enter') this.blur()"
             title="Enter team size or click a mention below to populate">
      <span class="team-size-override-hint">Enter or click below</span>
    </div>`;

  if (sizeMentions.length > 0 || node.size) {
    sizeMentionsHtml += '<div class="size-mentions-row">';

    if (sizeMentions.length > 0) {
      sizeMentions.forEach((m, idx) => {
        const dateStr = m.source?.callDate ? m.source.callDate.substring(0, 10) : '';
        const customerShort = m.source?.customerName?.split(';')[0]?.split(' ')[0] || '';
        // Check if this size is the selected override
        const isSelected = currentSizeOverride?.selectedSizeIndex === idx;
        const selectedClass = isSelected ? ' selected' : '';
        const checkmark = isSelected ? '<span class="size-chip-check">✓</span> ' : '';
        sizeMentionsHtml += `
          <a class="size-chip${selectedClass}" href="#" data-snippet-idx="${m.snippetIndex}" data-size-idx="${idx}"
             onclick="handleSizeChipClick(event, '${node.id}', ${idx}, ${m.snippetIndex})"
             title="${isSelected ? '✓ Selected as source of truth. ' : ''}Click to select and populate input. Shift+click to view snippet only.">
            ${checkmark}${m.value}
            <span class="size-chip-source">${dateStr}${customerShort ? ' · ' + customerShort : ''}</span>
          </a>`;
      });
      // Add clear button if there's a selection
      if (currentSizeOverride?.selectedSizeIndex !== undefined && currentSizeOverride?.selectedSizeIndex !== null) {
        sizeMentionsHtml += `
          <button class="size-chip-clear" onclick="clearSizeOverride('${node.id}'); selectNode(selectedNode, document.querySelector('.node.selected'), rangeStart, rangeEnd);" title="Clear size selection">
            ✕ clear
          </button>`;
      }
    }

    // Check if node.size exists but has no traceable source
    if (node.size && sizeMentions.length === 0) {
      sizeMentionsHtml += `
        <span class="size-chip untraceable" title="No traceable snippet source found for this team size">
          ${node.size}
          <span class="size-chip-warning">⚠ no source</span>
        </span>`;
    }

    sizeMentionsHtml += '</div>';
  }

  let html = `
    <div class="evidence-entity-info">
      <div class="evidence-entity-name">${node.name}</div>
      <div class="evidence-entity-meta">
        ${node.type.replace('_', ' ')}
        ${node.leader?.name ? ` · ${node.leader.name}` : ''}
        <br>${snippetsInRange.length} snippets in range · ${node.mentions} total mentions
      </div>
      ${sizeMentionsHtml}
  `;
  
  // Changes in range
  if (changes.reorg.length || changes.leadership.length || changes.size.length) {
    html += '<div class="evidence-changes">';
    changes.reorg.forEach(c => {
      html += `<div class="evidence-change reorg">⟳ Reorg: ${c.from} → ${c.to} (${formatDateShort(c.date)})</div>`;
    });
    changes.leadership.forEach(c => {
      html += `<div class="evidence-change leadership">👤 Leadership: ${c.from} → ${c.to} (${formatDateShort(c.date)})</div>`;
    });
    changes.size.forEach(c => {
      html += `<div class="evidence-change size">📊 Size: ${c.from} → ${c.to} (${formatDateShort(c.date)})</div>`;
    });
    html += '</div>';
  }
  
  // Override badge
  if (node.override) {
    html += `
      <div class="override-badge">
        ◆ Moved from ${node.override.originalParent}
        <button class="reset-node-btn" onclick="resetNodeOverride('${node.id}')">reset</button>
      </div>
    `;
  }
  
  html += '</div><div class="evidence-snippets">';

  // External verification data (show first, as it's the authoritative source)
  if (node.leader?.verification?.public_data) {
    const v = node.leader.verification;
    const pd = v.public_data;
    const key = getResolutionKey(currentCompany, node.id, node.leader.name);
    const resolution = conflictResolutions[key];

    let statusClass = v.verification_status || 'unknown';
    let statusText = v.verification_status === 'match' ? 'Verified Match' :
                     v.verification_status === 'conflict' ? 'Conflict with Gong' : 'Unknown';

    if (resolution) {
      statusClass = 'resolved';
      statusText = `Resolved: ${resolution.choice}`;
    }

    html += `
      <div class="external-source-card">
        <div class="external-source-header">
          <span class="external-source-label">${pd.source_name || 'External Source'}</span>
          ${pd.source_url ? `<a href="${pd.source_url}" target="_blank" class="external-source-link">View Source ↗</a>` : ''}
        </div>
        <div class="external-source-title">${pd.title || '(no title)'}</div>
        <div class="external-source-dept">${pd.department || ''}</div>
        <span class="external-source-status ${statusClass}">${statusText}</span>
        ${v.verification_status === 'conflict' && !resolution ? `
          <button style="margin-left: 8px; padding: 2px 8px; font-size: 11px; cursor: pointer; border: 1px solid #dc2626; background: white; color: #dc2626; border-radius: 4px;"
                  onclick="openResolveModal(${JSON.stringify(v).replace(/"/g, '&quot;')}, '${node.id}', '${node.leader.name.replace(/'/g, "\\'")}')">
            Resolve
          </button>
        ` : ''}
      </div>
    `;
  }

  // Snippet cards
  if (snippetsInRange.length === 0 && !node.leader?.verification?.public_data) {
    html += '<div class="evidence-empty">No snippets in selected date range</div>';
  } else if (snippetsInRange.length > 0) {
    // Sort snippets by date (newest first)
    const sortedSnippets = [...snippetsInRange].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Build a map of original snippet index to sorted index for size mention linking
    const originalToSortedIdx = {};
    allSnippets.forEach((s, origIdx) => {
      const sortedIdx = sortedSnippets.findIndex(sorted =>
        sorted.date === s.date && sorted.quote === s.quote
      );
      if (sortedIdx !== -1) originalToSortedIdx[origIdx] = sortedIdx;
    });

    sortedSnippets.forEach((s, sortedIdx) => {
      // Find the original index for this snippet to check sizeMentions
      const origIdx = allSnippets.findIndex(orig =>
        orig.date === s.date && orig.quote === s.quote
      ) ?? -1;

      // Get size mentions for this snippet
      const snippetSizes = s.sizeMentions || [];

      html += `
        <div class="snippet-card" data-snippet-sorted-idx="${sortedIdx}" data-snippet-orig-idx="${origIdx}">
          <div class="snippet-date">
            ${s.date}
            ${snippetSizes.length > 0 ? '<span class="snippet-tag" style="background:#ecfdf5;color:#047857;">Size Mention</span>' : ''}
          </div>
          <div class="snippet-quote">"${boldSizeMentions(s.quote)}"</div>
          <div class="snippet-attribution">
            <span>
              ${s.internalName ? `Internal: ${s.internalName}` : ''}
              ${s.internalName && s.customerName ? ' | ' : ''}
              ${s.customerName ? `Customer: ${s.customerName}` : ''}
              ${!s.internalName && !s.customerName ? '—' : ''}
            </span>
            <a href="${s.gongUrl}" class="snippet-link" target="_blank">↗ Gong</a>
            ${s.contextBefore !== undefined ? `<button class="snippet-context-btn" data-snippet-idx="${sortedIdx}">📄 Context</button>` : ''}
          </div>
          ${snippetSizes.length > 0 ? `
            <div class="snippet-sizes">
              ${snippetSizes.map(sz => `<span class="snippet-size-badge">${sz}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `;
    });
  }

  // Conflicts
  node.conflicts?.forEach(c => {
    html += `
      <div class="snippet-card conflict">
        <div class="snippet-date">
          ${c.date}
          <span class="snippet-tag conflict">Conflict</span>
        </div>
        <div class="snippet-quote">"${boldSizeMentions(c.quote)}"</div>
        <div class="snippet-attribution">
          <span>${c.note || ''}</span>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  
  content.innerHTML = html;

  // Attach context button click handlers (using addEventListener, no inline onclick)
  content.querySelectorAll('.snippet-context-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showSnippetContext(parseInt(btn.dataset.snippetIdx));
    });
  });

  // Render alias chips for canonical entities (using addEventListener, no inline onclick)
  if (entityMerges[node.id]?.aliases?.length) {
    const aliasSection = document.createElement('div');
    aliasSection.className = 'alias-section';
    aliasSection.style.cssText = 'margin: 8px 0; padding: 8px; background: #f0f4ff; border-radius: 4px;';

    const label = document.createElement('div');
    label.style.cssText = 'font-size: 11px; color: #666; margin-bottom: 4px;';
    label.textContent = 'Also known as:';
    aliasSection.appendChild(label);

    const chipContainer = document.createElement('div');
    chipContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px;';

    entityMerges[node.id].aliases.forEach(alias => {
      const chip = document.createElement('span');
      chip.className = 'alias-chip';
      chip.style.cssText = 'background: #e0e7ff; padding: 2px 8px; border-radius: 12px; font-size: 12px;';
      chip.textContent = alias;

      const removeBtn = document.createElement('span');
      removeBtn.style.cssText = 'cursor: pointer; margin-left: 4px; color: #666;';
      removeBtn.textContent = '\u00d7';
      removeBtn.addEventListener('click', () => removeAlias(node.id, alias));
      chip.appendChild(removeBtn);
      chipContainer.appendChild(chip);
    });

    const addBtn = document.createElement('button');
    addBtn.style.cssText = 'background: none; border: 1px dashed #999; padding: 2px 8px; border-radius: 12px; font-size: 12px; cursor: pointer;';
    addBtn.textContent = '+ Add';
    addBtn.addEventListener('click', () => showAddAliasInput(node.id));
    chipContainer.appendChild(addBtn);

    aliasSection.appendChild(chipContainer);

    // Insert after entity info div
    const entityInfo = content.querySelector('.evidence-entity-info');
    if (entityInfo) {
      entityInfo.after(aliasSection);
    } else {
      content.insertBefore(aliasSection, content.firstChild);
    }
  }

  document.getElementById('evidenceEmpty').style.display = 'none';
  document.getElementById('evidenceTitleText').textContent = `Source Evidence — ${node.name}`;
}

window.resetNodeOverride = function(nodeId) {
  delete overrides[nodeId];
  saveOverrides();
  deleteOverrideFromKV(currentCompany, nodeId); // Sync deletion to Vercel KV
  renderCompany(currentCompany);
};

// Scroll to and highlight a snippet when clicking a size chip
window.scrollToSnippet = function(snippetOrigIdx) {
  // Find the snippet card with matching original index
  const snippetCard = document.querySelector(`.snippet-card[data-snippet-orig-idx="${snippetOrigIdx}"]`);

  if (snippetCard) {
    // Remove previous highlights
    document.querySelectorAll('.snippet-card.highlighted').forEach(el => el.classList.remove('highlighted'));

    // Add highlight to this snippet
    snippetCard.classList.add('highlighted');

    // Scroll to the snippet
    snippetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Remove highlight after 3 seconds
    setTimeout(() => {
      snippetCard.classList.remove('highlighted');
    }, 3000);
  }
};

// Table
function collectAllSnippets(node, results = [], rangeStart, rangeEnd) {
  node.snippets?.filter(s => isInDateRange(s.date, rangeStart, rangeEnd)).forEach(s => {
    results.push({
      entityId: node.id,
      entityName: node.name,
      type: node.type,
      confidence: node.confidence,
      hasOverride: !!overrides[node.id],
      ...s
    });
  });
  node.conflicts?.forEach(c => {
    if (isInDateRange(c.date, rangeStart, rangeEnd)) {
      results.push({
        entityId: node.id,
        entityName: node.name,
        type: node.type,
        confidence: 'conflict',
        hasOverride: !!overrides[node.id],
        quote: c.quote,
        date: c.date,
        ae: c.ae,
        bd: c.bd,
        gongUrl: '#',
        isConflict: true
      });
    }
  });
  node.children?.forEach(child => collectAllSnippets(child, results, rangeStart, rangeEnd));
  return results;
}

// Collect snippets from Manual Map nodes (gongEvidence structure)
function collectManualMapSnippets(node, results = [], rangeStart, rangeEnd, company) {
  const evidence = node.gongEvidence || {};

  // Collect snippets from gongEvidence.snippets
  (evidence.snippets || []).filter(s => isInDateRange(s.date, rangeStart, rangeEnd)).forEach(s => {
    results.push({
      entityId: node.id,
      entityName: node.name,
      type: node.type || 'manual',
      confidence: evidence.confidence || 'medium',
      hasOverride: false,
      quote: s.quote || s.text || '',
      date: s.date || s.callDate,
      ae: s.internalName || '',
      bd: '',
      gongUrl: s.gongUrl || '#',
      callId: s.callId
    });
  });

  // Collect snippets from approved Match Review items
  const approvedMatches = getApprovedMatchesForNode(company, node.name);
  approvedMatches.forEach(match => {
    if (isInDateRange(match.snippet_date, rangeStart, rangeEnd)) {
      results.push({
        entityId: node.id,
        entityName: node.name,
        type: node.type || 'manual',
        confidence: match.confidence || 'medium',
        hasOverride: false,
        quote: match.snippet_quote || '',
        date: match.snippet_date,
        ae: match.person_name || '',
        bd: '',
        gongUrl: match.gong_url || '#',
        callId: match.call_id,
        isApprovedMatch: true
      });
    }
  });

  node.children?.forEach(child => collectManualMapSnippets(child, results, rangeStart, rangeEnd, company));
  return results;
}

let tableSortKey = 'date';
let tableSortAsc = false;

function renderTable(rangeStart, rangeEnd) {
  let snippets;

  // Use appropriate data source based on current mode
  if (currentMode === 'manual' && MANUAL_DATA[currentCompany]?.root) {
    snippets = collectManualMapSnippets(MANUAL_DATA[currentCompany].root, [], rangeStart, rangeEnd, currentCompany);
  } else {
    snippets = DATA[currentCompany]?.root ? collectAllSnippets(DATA[currentCompany].root, [], rangeStart, rangeEnd) : [];
  }

  const searchTerm = document.getElementById('tableSearch').value.toLowerCase();
  const confFilter = document.getElementById('confidenceFilter').value;
  const typeFilter = document.getElementById('typeFilter').value;
  
  snippets = snippets.filter(s => {
    if (searchTerm && !`${s.entityName} ${s.quote} ${s.ae||''} ${s.bd||''}`.toLowerCase().includes(searchTerm)) return false;
    if (confFilter && s.confidence !== confFilter) return false;
    if (typeFilter && s.type !== typeFilter) return false;
    return true;
  });
  
  snippets.sort((a, b) => {
    let aVal = tableSortKey === 'entity' ? a.entityName : (a[tableSortKey] || '');
    let bVal = tableSortKey === 'entity' ? b.entityName : (b[tableSortKey] || '');
    if (aVal < bVal) return tableSortAsc ? -1 : 1;
    if (aVal > bVal) return tableSortAsc ? 1 : -1;
    return 0;
  });
  
  if (snippets.length === 0) {
    const message = currentMode === 'manual'
      ? 'No snippets found. Use Match Review to approve entities and add evidence to manual nodes.'
      : 'No snippets found for the current filters.';
    document.getElementById('tableBody').innerHTML = `
      <tr><td colspan="7" style="text-align: center; padding: 40px; color: #888; font-style: italic;">${message}</td></tr>
    `;
  } else {
    document.getElementById('tableBody').innerHTML = snippets.map(s => `
      <tr${s.isApprovedMatch ? ' class="approved-match-row"' : ''}>
        <td><span class="table-entity">${s.entityName}</span>${s.hasOverride ? '<span class="table-override-badge">◆</span>' : ''}${s.isApprovedMatch ? '<span class="table-approved-badge" title="Approved via Match Review">✓</span>' : ''}</td>
        <td class="table-meta">${(s.type || '').replace('_', ' ')}</td>
        <td class="table-quote">"${s.quote}"</td>
        <td class="table-meta">${s.date || '—'}</td>
        <td class="table-meta">${[s.ae, s.bd].filter(Boolean).join(' / ') || '—'}</td>
        <td><span class="table-confidence ${s.isConflict ? 'low' : s.confidence}">${s.isConflict ? 'conflict' : s.confidence}</span></td>
        <td><a href="${s.gongUrl}" class="table-link" target="_blank">↗</a></td>
      </tr>
    `).join('');
  }
  
  document.querySelectorAll('.snippets-table th.sortable').forEach(th => {
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = th.dataset.sort === tableSortKey ? (tableSortAsc ? '▲' : '▼') : '';
  });
}

// Show changes modal
function showChanges(type) {
  const data = DATA[currentCompany];
  if (!data?.dateRange) return;
  const rangeStart = getDateFromPercent(dateRange.start, data.dateRange);
  const rangeEnd = getDateFromPercent(dateRange.end, data.dateRange);

  let changes = [];
  let title = '';

  if (type === 'reorgs') {
    changes = data.changes.reorgs.filter(c => isInDateRange(c.date, rangeStart, rangeEnd));
    title = 'Potential Reorgs';
  } else if (type === 'leadership') {
    changes = data.changes.leadership.filter(c => isInDateRange(c.date, rangeStart, rangeEnd));
    title = 'Leadership Changes';
  } else if (type === 'size') {
    changes = data.changes.size.filter(c => isInDateRange(c.date, rangeStart, rangeEnd));
    title = 'Size Changes';
  }

  const modal = document.getElementById('changesModal');
  const modalTitle = document.getElementById('changesModalTitle');
  const modalContent = document.getElementById('changesModalContent');

  modalTitle.textContent = title;

  if (changes.length === 0) {
    modalContent.innerHTML = '<div class="changes-modal-empty">No changes detected</div>';
  } else {
    let html = '';
    changes.forEach(change => {
      const entity = findNodeInTree(data.root, change.entityId);
      const entityName = entity ? entity.name : 'Unknown Entity';

      let details = '';
      if (type === 'size') {
        details = `${change.from} people → ${change.to} people`;
      } else if (type === 'leadership') {
        details = change.from && change.to
          ? `${change.from} → ${change.to}`
          : change.to
            ? `New leader: ${change.to}`
            : 'Leadership change';
      } else if (type === 'reorgs') {
        details = change.from && change.to
          ? `Moved from ${change.from} to ${change.to}`
          : 'Organizational change';
      }

      html += `
        <div class="change-item" data-entity-id="${change.entityId}">
          <div class="change-item-entity">${entityName}</div>
          <div class="change-item-details">${details}</div>
          <div class="change-item-date">${formatDateShort(new Date(change.date))}</div>
        </div>
      `;
    });

    modalContent.innerHTML = html;

    // Add click handlers to each change item to select the entity
    modalContent.querySelectorAll('.change-item').forEach(item => {
      item.addEventListener('click', () => {
        const entityId = item.dataset.entityId;
        const entity = findNodeInTree(data.root, entityId);
        if (entity) {
          // Close modal
          modal.classList.remove('active');

          // Find the node element in the tree and select it
          const nodeEl = document.querySelector(`.node[data-id="${entityId}"]`);
          if (nodeEl) {
            selectNode(entity, nodeEl, rangeStart, rangeEnd);
            // Scroll to the node
            nodeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      });
    });
  }

  modal.classList.add('active');
}

// Close changes modal
function closeChangesModal() {
  document.getElementById('changesModal').classList.remove('active');
}


function renderCompany(companyKey) {
  currentCompany = companyKey;
  const data = DATA[companyKey];
  if (!data) return;
  
  const rangeStart = getDateFromPercent(dateRange.start, data.dateRange);
  const rangeEnd = getDateFromPercent(dateRange.end, data.dateRange);
  
  // Update stats
  document.getElementById('stats').innerHTML = `
    <span><strong>${data.stats.entities}</strong> entities</span>
    <span><strong>${data.stats.extractions}</strong> extractions</span>
    <span><strong>${data.stats.calls}</strong> calls</span>
  `;
  
  // Update date labels
  document.getElementById('startDate').textContent = formatDateShort(rangeStart);
  document.getElementById('endDate').textContent = formatDateShort(rangeEnd);
  
  // Update timeline fill
  const fill = document.getElementById('timelineFill');
  fill.style.left = dateRange.start + '%';
  fill.style.width = (dateRange.end - dateRange.start) + '%';
  
  // Update change counts
  const counts = countChangesInRange(rangeStart, rangeEnd);
  const verificationConflicts = data.verificationConflicts || [];
  document.getElementById('conflictCount').textContent = verificationConflicts.length;
  document.getElementById('reorgCount').textContent = counts.reorgs;
  document.getElementById('leadershipCount').textContent = counts.leadership;
  document.getElementById('sizeCount').textContent = counts.size;

  // Update disabled state on badges
  const changeSummary = document.getElementById('changeSummary');
  const badges = changeSummary.querySelectorAll('.change-stat');
  badges[0].classList.toggle('disabled', verificationConflicts.length === 0);
  badges[1].classList.toggle('disabled', counts.reorgs === 0);
  badges[2].classList.toggle('disabled', counts.leadership === 0);
  badges[3].classList.toggle('disabled', counts.size === 0);
  
  // Render tree
  const workingTree = buildWorkingTree(data.root);
  const tree = document.getElementById('tree');
  tree.innerHTML = '';
  tree.appendChild(renderTree(workingTree, 0, rangeStart, rangeEnd));
  flushConnectorMeasurements();

  // Render table
  renderTable(rangeStart, rangeEnd);
  
  // Reset evidence panel
  document.getElementById('evidenceContent').innerHTML = '<div class="evidence-empty" id="evidenceEmpty">Select an entity to view source evidence</div>';
  document.getElementById('evidenceTitleText').textContent = 'Source Evidence';
}

function setView(view) {
  currentView = view;
  document.getElementById('treeViewBtn').classList.toggle('active', view === 'tree');
  document.getElementById('tableViewBtn').classList.toggle('active', view === 'table');

  // Handle view visibility - both modes use treeContainer for horizontal tree
  document.getElementById('treeContainer').classList.toggle('hidden', view !== 'tree');
  document.getElementById('sideBySideContainer').classList.remove('active'); // No longer used
  document.getElementById('tableContainer').classList.toggle('active', view === 'table');
  document.getElementById('evidencePanel').style.display = view === 'tree' ? 'flex' : 'none';
}

// Set mode (auto vs manual map vs match review)
function setMode(mode) {
  currentMode = mode;
  document.getElementById('manualModeBtn').classList.toggle('active', mode === 'manual');
  document.getElementById('matchReviewBtn').classList.toggle('active', mode === 'matchReview');

  // Store preference
  localStorage.setItem('orgChartMode', mode);

  // Hide all containers first
  document.getElementById('treeContainer').classList.add('hidden');
  document.getElementById('tableContainer').classList.remove('active');
  document.getElementById('sideBySideContainer').classList.remove('active');
  document.getElementById('matchReviewContainer').classList.remove('active');
  document.getElementById('changeSummary').style.display = 'none';
  document.getElementById('evidencePanel').style.display = 'none';

  // Show/hide timeline and view toggle based on mode
  const timelineContainer = document.querySelector('.timeline-container');
  const viewToggle = document.querySelector('.view-toggle');
  const manageEntitiesBtn = document.getElementById('manageEntitiesBtn');

  if (mode === 'matchReview') {
    timelineContainer.style.display = 'none';
    viewToggle.style.display = 'none';
    if (manageEntitiesBtn) manageEntitiesBtn.style.display = 'none';
  } else {
    // Manual mode
    timelineContainer.style.display = 'flex';
    viewToggle.style.display = 'flex';
    if (manageEntitiesBtn) manageEntitiesBtn.style.display = 'inline-flex';
  }

  // Re-render based on mode
  if (mode === 'manual') {
    renderManualMapView();
    setView(currentView);
  } else if (mode === 'matchReview') {
    document.getElementById('matchReviewContainer').classList.add('active');
    renderMatchReview(currentCompany);
  }
}

// Check if company has manual map
function hasManualMap(companyKey) {
  return typeof MANUAL_DATA !== 'undefined' && MANUAL_DATA[companyKey];
}

// ============================================
// MATCH REVIEW SYSTEM
// ============================================

// Load match review state from localStorage and Vercel KV
