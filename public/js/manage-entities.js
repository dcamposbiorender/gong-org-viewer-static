// Manage Entities: create, delete, and entity list

let manageEntitiesState = {
  selectedParentId: null,
  selectedParentName: null,
  selectedDeleteId: null,
  selectedDeleteName: null,
  selectedDeleteHasChildren: false,
  allEntities: []
};

function showManageEntitiesModal() {
  // Only works for Manual Map mode
  if (!MANUAL_DATA[currentCompany]) {
    alert('Manage Entities is only available in Manual Map mode. Please Graduate first or switch to a company with Manual Map data.');
    return;
  }

  const modal = document.getElementById('manageEntitiesModal');
  manageEntitiesState = {
    selectedParentId: null,
    selectedParentName: null,
    selectedDeleteId: null,
    selectedDeleteName: null,
    selectedDeleteHasChildren: false,
    allEntities: []
  };

  // Build flat list of all entities
  manageEntitiesState.allEntities = [];
  const root = MANUAL_DATA[currentCompany].root || MANUAL_DATA[currentCompany];
  buildEntityList(root, '', manageEntitiesState.allEntities);

  // Reset form fields
  document.getElementById('createEntityParentSearch').value = '';
  document.getElementById('createEntityName').value = '';
  document.getElementById('createEntityLeaderName').value = '';
  document.getElementById('createEntityLeaderTitle').value = '';
  document.getElementById('createEntityParentList').style.display = 'none';
  document.getElementById('createEntitySelectedParent').style.display = 'none';
  document.getElementById('deleteEntitySearch').value = '';
  document.getElementById('deleteEntityConfirm').style.display = 'none';

  // Start on Create tab
  switchManageEntitiesTab('create');

  modal.style.display = 'flex';
}

function buildEntityList(node, path, list) {
  if (!node) return;
  const nodeName = getFieldValue(node, 'name');
  const fullPath = path ? `${path} > ${nodeName}` : nodeName;
  list.push({
    id: node.id,
    name: nodeName,
    path: fullPath,
    hasChildren: (node.children?.length || 0) > 0
  });
  if (node.children) {
    for (const child of node.children) {
      buildEntityList(child, fullPath, list);
    }
  }
}

function closeManageEntitiesModal() {
  document.getElementById('manageEntitiesModal').style.display = 'none';
}

function switchManageEntitiesTab(tab) {
  const createTab = document.getElementById('createEntityTab');
  const deleteTab = document.getElementById('deleteEntityTab');
  const mergeTab = document.getElementById('mergeEntityTab');
  const createPane = document.getElementById('createEntityPane');
  const deletePane = document.getElementById('deleteEntityPane');
  const mergePane = document.getElementById('mergeEntityPane');

  // Reset all tabs
  createTab.style.opacity = '0.6';
  deleteTab.style.opacity = '0.6';
  mergeTab.style.opacity = '0.6';
  createPane.style.display = 'none';
  deletePane.style.display = 'none';
  mergePane.style.display = 'none';

  if (tab === 'create') {
    createTab.style.opacity = '1';
    createPane.style.display = 'block';
  } else if (tab === 'delete') {
    deleteTab.style.opacity = '1';
    deletePane.style.display = 'block';
    renderDeleteEntityList(manageEntitiesState.allEntities);
  } else if (tab === 'merge') {
    mergeTab.style.opacity = '1';
    mergePane.style.display = 'block';
    resetMergeTab();
  }
}

// === CREATE ENTITY FUNCTIONS ===

function filterCreateEntityParentList() {
  const search = document.getElementById('createEntityParentSearch').value.toLowerCase().trim();
  const listEl = document.getElementById('createEntityParentList');

  if (!search) {
    listEl.style.display = 'none';
    return;
  }

  const filtered = manageEntitiesState.allEntities.filter(e =>
    e.name.toLowerCase().includes(search) || e.path.toLowerCase().includes(search)
  );

  listEl.innerHTML = '';
  if (filtered.length === 0) {
    listEl.innerHTML = '<div style="padding: 12px; color: #666; font-size: 13px;">No matching entities</div>';
  } else {
    filtered.slice(0, 20).forEach(entity => {
      const item = document.createElement('div');
      item.style.cssText = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; font-size: 13px;';
      const nameDiv = document.createElement('div');
      nameDiv.style.fontWeight = '500';
      nameDiv.textContent = entity.name;
      const pathDiv = document.createElement('div');
      pathDiv.style.cssText = 'font-size: 11px; color: #888;';
      pathDiv.textContent = entity.path;
      item.appendChild(nameDiv);
      item.appendChild(pathDiv);
      item.onclick = () => selectCreateEntityParent(entity);
      item.onmouseover = () => item.style.background = '#f5f5f5';
      item.onmouseout = () => item.style.background = 'transparent';
      listEl.appendChild(item);
    });
  }
  listEl.style.display = 'block';
}

function selectCreateEntityParent(entity) {
  manageEntitiesState.selectedParentId = entity.id;
  manageEntitiesState.selectedParentName = entity.name;

  document.getElementById('createEntityParentList').style.display = 'none';
  document.getElementById('createEntityParentSearch').value = '';

  const selectedEl = document.getElementById('createEntitySelectedParent');
  selectedEl.innerHTML = `<strong>Selected:</strong> ${entity.path} <span style="cursor: pointer; color: #c9302c; margin-left: 8px;" onclick="clearCreateEntityParent()">×</span>`;
  selectedEl.style.display = 'block';
}

function clearCreateEntityParent() {
  manageEntitiesState.selectedParentId = null;
  manageEntitiesState.selectedParentName = null;
  document.getElementById('createEntitySelectedParent').style.display = 'none';
}

function createNewEntity() {
  const parentId = manageEntitiesState.selectedParentId;
  const name = document.getElementById('createEntityName').value.trim();
  const leaderName = document.getElementById('createEntityLeaderName').value.trim();
  const leaderTitle = document.getElementById('createEntityLeaderTitle').value.trim();

  if (!parentId) {
    alert('Please select a parent entity');
    return;
  }
  if (!name) {
    alert('Please enter an entity name');
    return;
  }

  const root = MANUAL_DATA[currentCompany].root || MANUAL_DATA[currentCompany];
  const parentNode = findManualNodeById(root, parentId);
  if (!parentNode) {
    alert('Parent entity not found');
    return;
  }

  const newId = `manual-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const newNode = {
    id: newId,
    name: name,
    type: 'group',
    level: (parentNode.level || 0) + 1,
    gongEvidence: {
      status: 'unverified',
      totalMentions: 0,
      teamSizes: [],
      sizeMentions: [],
      matchedContacts: leaderName ? [{
        name: leaderName,
        title: leaderTitle || '',
        isDecisionMaker: true
      }] : []
    },
    children: []
  };

  if (!parentNode.children) parentNode.children = [];
  parentNode.children.push(newNode);

  // Save changes
  saveManualMapModifications();

  // Close modal and re-render
  closeManageEntitiesModal();
  renderManualMapView();
}

// === DELETE ENTITY FUNCTIONS ===

function renderDeleteEntityList(entities) {
  const listEl = document.getElementById('deleteEntityList');
  listEl.innerHTML = '';

  // Filter out root node (can't delete)
  const root = MANUAL_DATA[currentCompany].root || MANUAL_DATA[currentCompany];
  const deletable = entities.filter(e => e.id !== root.id);

  if (deletable.length === 0) {
    listEl.innerHTML = '<div style="padding: 12px; color: #666; font-size: 13px;">No entities available to delete</div>';
    return;
  }

  deletable.forEach(entity => {
    const item = document.createElement('div');
    item.style.cssText = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; font-size: 13px; display: flex; justify-content: space-between; align-items: center;';

    const infoDiv = document.createElement('div');
    const nameDiv = document.createElement('div');
    nameDiv.style.fontWeight = '500';
    nameDiv.textContent = entity.name;
    const pathDiv = document.createElement('div');
    pathDiv.style.cssText = 'font-size: 11px; color: #888;';
    pathDiv.textContent = entity.path;
    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(pathDiv);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'resolve-btn';
    deleteBtn.style.cssText = 'background: #c9302c; color: white; font-size: 11px; padding: 4px 8px;';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      selectDeleteEntity(entity.id, entity.name, entity.hasChildren);
    };

    item.appendChild(infoDiv);
    item.appendChild(deleteBtn);
    item.onmouseover = () => item.style.background = '#fff3cd';
    item.onmouseout = () => item.style.background = 'transparent';
    listEl.appendChild(item);
  });
}

function filterDeleteEntityList() {
  const search = document.getElementById('deleteEntitySearch').value.toLowerCase().trim();

  if (!search) {
    renderDeleteEntityList(manageEntitiesState.allEntities);
    return;
  }

  const filtered = manageEntitiesState.allEntities.filter(e =>
    e.name.toLowerCase().includes(search) || e.path.toLowerCase().includes(search)
  );

  renderDeleteEntityList(filtered);
}

function selectDeleteEntity(id, name, hasChildren) {
  manageEntitiesState.selectedDeleteId = id;
  manageEntitiesState.selectedDeleteName = name;
  manageEntitiesState.selectedDeleteHasChildren = hasChildren;

  document.getElementById('deleteEntityName').textContent = name;
  document.getElementById('deleteEntityChildrenWarning').style.display = hasChildren ? 'inline' : 'none';
  document.getElementById('deleteEntityConfirm').style.display = 'block';
}

function cancelDeleteEntity() {
  manageEntitiesState.selectedDeleteId = null;
  manageEntitiesState.selectedDeleteName = null;
  manageEntitiesState.selectedDeleteHasChildren = false;
  document.getElementById('deleteEntityConfirm').style.display = 'none';
}

function confirmDeleteEntity() {
  const nodeId = manageEntitiesState.selectedDeleteId;
  if (!nodeId) return;

  const root = MANUAL_DATA[currentCompany].root || MANUAL_DATA[currentCompany];

  // Can't delete root
  if (nodeId === root.id) {
    alert('Cannot delete the root entity');
    return;
  }

  const parent = findManualNodeParent(root, nodeId);
  if (!parent) {
    alert('Could not find parent of entity');
    return;
  }

  parent.children = parent.children.filter(child => child.id !== nodeId);

  // Save changes
  saveManualMapModifications();

  // Close modal and re-render
  closeManageEntitiesModal();
  renderManualMapView();
}

// === MERGE ENTITY FUNCTIONS ===

