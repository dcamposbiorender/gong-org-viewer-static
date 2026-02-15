// Entity Merge: merge tab, alias management

let mergeTabState = {
  entityA: null,  // { id, name, path, type, hasChildren, childCount, snippetCount, leaderName }
  entityB: null
};

function resetMergeTab() {
  mergeTabState = { entityA: null, entityB: null };
  document.getElementById('mergeEntityASearch').value = '';
  document.getElementById('mergeEntityBSearch').value = '';
  document.getElementById('mergeEntityAList').style.display = 'none';
  document.getElementById('mergeEntityBList').style.display = 'none';
  document.getElementById('mergeEntityASelected').style.display = 'none';
  document.getElementById('mergeEntityBSelected').style.display = 'none';
  document.getElementById('mergePreviewPanel').style.display = 'none';
  document.getElementById('mergeValidationError').style.display = 'none';
  document.getElementById('mergeConfirmBtn').disabled = true;
  document.getElementById('mergeConfirmBtn').style.opacity = '0.5';
}

function buildMergeEntityInfo(entity) {
  // Enrich entity with additional info for merge preview
  const node = findNodeById(DATA[currentCompany]?.root, entity.id) ||
               findManualNodeById((MANUAL_DATA[currentCompany]?.root || MANUAL_DATA[currentCompany]), entity.id);
  if (!node) return entity;
  return {
    ...entity,
    type: node.type || 'unknown',
    childCount: node.children?.length || 0,
    snippetCount: node.snippets?.length || 0,
    leaderName: getFieldValue(node, 'leaderName') || ''
  };
}

function filterMergeEntityAList() {
  const search = document.getElementById('mergeEntityASearch').value.toLowerCase().trim();
  const listEl = document.getElementById('mergeEntityAList');

  if (!search) {
    listEl.style.display = 'none';
    return;
  }

  const filtered = manageEntitiesState.allEntities.filter(e => {
    const nameMatch = e.name.toLowerCase().includes(search) || e.path.toLowerCase().includes(search);
    // Also search aliases
    let aliasMatch = false;
    for (const [cid, merge] of Object.entries(entityMerges)) {
      if (merge.aliases?.some(a => a.toLowerCase().includes(search)) && cid === e.id) {
        aliasMatch = true;
        break;
      }
    }
    return nameMatch || aliasMatch;
  });

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
      item.addEventListener('click', () => selectMergeEntityA(entity));
      item.onmouseover = () => item.style.background = '#f5f5f5';
      item.onmouseout = () => item.style.background = 'transparent';
      listEl.appendChild(item);
    });
  }
  listEl.style.display = 'block';
}

function filterMergeEntityBList() {
  const search = document.getElementById('mergeEntityBSearch').value.toLowerCase().trim();
  const listEl = document.getElementById('mergeEntityBList');

  if (!search) {
    listEl.style.display = 'none';
    return;
  }

  const filtered = manageEntitiesState.allEntities.filter(e => {
    const nameMatch = e.name.toLowerCase().includes(search) || e.path.toLowerCase().includes(search);
    let aliasMatch = false;
    for (const [cid, merge] of Object.entries(entityMerges)) {
      if (merge.aliases?.some(a => a.toLowerCase().includes(search)) && cid === e.id) {
        aliasMatch = true;
        break;
      }
    }
    return nameMatch || aliasMatch;
  });

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
      item.addEventListener('click', () => selectMergeEntityB(entity));
      item.onmouseover = () => item.style.background = '#f5f5f5';
      item.onmouseout = () => item.style.background = 'transparent';
      listEl.appendChild(item);
    });
  }
  listEl.style.display = 'block';
}

function selectMergeEntityA(entity) {
  mergeTabState.entityA = buildMergeEntityInfo(entity);
  document.getElementById('mergeEntityAList').style.display = 'none';
  document.getElementById('mergeEntityASearch').value = '';

  const selectedEl = document.getElementById('mergeEntityASelected');
  selectedEl.innerHTML = '';
  const text = document.createElement('span');
  text.innerHTML = '<strong>Absorb:</strong> ' + entity.name + ' <span style="font-size:11px;color:#888;">' + entity.path + '</span>';
  const clearBtn = document.createElement('span');
  clearBtn.style.cssText = 'cursor: pointer; color: #c9302c; margin-left: 8px;';
  clearBtn.textContent = '\u00d7';
  clearBtn.addEventListener('click', () => {
    mergeTabState.entityA = null;
    selectedEl.style.display = 'none';
    updateMergePreview();
  });
  selectedEl.appendChild(text);
  selectedEl.appendChild(clearBtn);
  selectedEl.style.display = 'block';
  updateMergePreview();
}

function selectMergeEntityB(entity) {
  mergeTabState.entityB = buildMergeEntityInfo(entity);
  document.getElementById('mergeEntityBList').style.display = 'none';
  document.getElementById('mergeEntityBSearch').value = '';

  const selectedEl = document.getElementById('mergeEntityBSelected');
  selectedEl.innerHTML = '';
  const text = document.createElement('span');
  text.innerHTML = '<strong>Canonical:</strong> ' + entity.name + ' <span style="font-size:11px;color:#888;">' + entity.path + '</span>';
  const clearBtn = document.createElement('span');
  clearBtn.style.cssText = 'cursor: pointer; color: #c9302c; margin-left: 8px;';
  clearBtn.textContent = '\u00d7';
  clearBtn.addEventListener('click', () => {
    mergeTabState.entityB = null;
    selectedEl.style.display = 'none';
    updateMergePreview();
  });
  selectedEl.appendChild(text);
  selectedEl.appendChild(clearBtn);
  selectedEl.style.display = 'block';
  updateMergePreview();
}

function updateMergePreview() {
  const previewPanel = document.getElementById('mergePreviewPanel');
  const previewContent = document.getElementById('mergePreviewContent');
  const errorEl = document.getElementById('mergeValidationError');
  const confirmBtn = document.getElementById('mergeConfirmBtn');

  errorEl.style.display = 'none';
  confirmBtn.disabled = true;
  confirmBtn.style.opacity = '0.5';

  if (!mergeTabState.entityA || !mergeTabState.entityB) {
    previewPanel.style.display = 'none';
    return;
  }

  const entityAId = mergeTabState.entityA.id;
  const entityBId = mergeTabState.entityB.id;

  // Validations
  // 1f: Self-merge blocked
  if (entityAId === entityBId) {
    errorEl.textContent = 'Cannot merge an entity into itself (same entity selected as both A and B).';
    errorEl.style.display = 'block';
    previewPanel.style.display = 'none';
    return;
  }

  // 1f: Entity A is already absorbed
  const absorbedBy = isEntityAbsorbed(entityAId);
  if (absorbedBy) {
    errorEl.textContent = 'Entity A is already absorbed by another entity. Unmerge it first.';
    errorEl.style.display = 'block';
    previewPanel.style.display = 'none';
    return;
  }

  // 1f: Entity B is already absorbed
  const bAbsorbedBy = isEntityAbsorbed(entityBId);
  if (bAbsorbedBy) {
    errorEl.textContent = 'Entity B is already absorbed by another entity. Unmerge it first.';
    errorEl.style.display = 'block';
    previewPanel.style.display = 'none';
    return;
  }

  // 1f: Entity A is canonical for other merges (prevents transitive orphans)
  if (entityMerges[entityAId] && entityMerges[entityAId].absorbed?.length > 0) {
    errorEl.textContent = 'Entity A is canonical for other merges. Unmerge its absorbed entities first to prevent transitive orphans.';
    errorEl.style.display = 'block';
    previewPanel.style.display = 'none';
    return;
  }

  // Build preview
  const entityAName = mergeTabState.entityA.name;
  const childCount = mergeTabState.entityA.childCount || 0;
  const snippetCount = mergeTabState.entityA.snippetCount || 0;
  const entityBName = mergeTabState.entityB.name;
  const bSnippetCount = mergeTabState.entityB.snippetCount || 0;
  const aLeader = mergeTabState.entityA.leaderName || '';
  const bLeader = mergeTabState.entityB.leaderName || '';

  let previewHtml = '<ul style="margin: 0; padding-left: 16px; font-size: 13px; color: #333;">';
  previewHtml += '<li>"' + entityAName + '" will become an alias on "' + entityBName + '"</li>';

  if (childCount > 0) {
    // Get actual child names
    const node = findNodeById(DATA[currentCompany]?.root, entityAId) ||
                 findManualNodeById((MANUAL_DATA[currentCompany]?.root || MANUAL_DATA[currentCompany]), entityAId);
    if (node?.children) {
      const childNames = node.children.slice(0, 10).map(c => getFieldValue(c, 'name'));
      const moreCount = node.children.length - 10;
      previewHtml += '<li>' + childCount + ' children will be reparented: ' + childNames.join(', ');
      if (moreCount > 0) previewHtml += ' and ' + moreCount + ' more...';
      previewHtml += '</li>';
    } else {
      previewHtml += '<li>' + childCount + ' children will be reparented</li>';
    }
  }

  previewHtml += '<li>Snippets: ' + snippetCount + ' from A + ' + bSnippetCount + ' from B = ' + (snippetCount + bSnippetCount) + ' combined</li>';

  if (aLeader && !bLeader) {
    previewHtml += '<li style="color: #856404;">Warning: Entity A has leader "' + aLeader + '" but Entity B has no leader</li>';
  }

  previewHtml += '</ul>';
  previewContent.innerHTML = previewHtml;
  previewPanel.style.display = 'block';

  // Enable confirm button
  confirmBtn.disabled = false;
  confirmBtn.style.opacity = '1';
}

function executeMergeFromTab() {
  if (!mergeTabState.entityA || !mergeTabState.entityB) return;

  const entityAId = mergeTabState.entityA.id;
  const entityBId = mergeTabState.entityB.id;
  const entityAName = mergeTabState.entityA.name;
  const entityBName = mergeTabState.entityB.name;

  // Re-validate before executing
  if (entityAId === entityBId) {
    showToast('Cannot merge an entity into itself', 'error');
    return;
  }
  if (isEntityAbsorbed(entityAId)) {
    showToast('Entity A is already absorbed. Unmerge it first.', 'error');
    return;
  }
  if (isEntityAbsorbed(entityBId)) {
    showToast('Entity B is already absorbed. Unmerge it first.', 'error');
    return;
  }
  if (entityMerges[entityAId] && entityMerges[entityAId].absorbed?.length > 0) {
    showToast('Entity A is canonical for other merges. Unmerge its absorbed entities first.', 'error');
    return;
  }

  // Build merge record
  entityMerges[entityBId] = {
    absorbed: [...(entityMerges[entityBId]?.absorbed || []), entityAId],
    aliases: [...(entityMerges[entityBId]?.aliases || []), entityAName],
    mergedSnippets: [],  // Keep for backward compat, not used for logic
    mergedAt: new Date().toISOString(),
    user: 'user'
  };

  // Save to localStorage (company-scoped) + KV
  localStorage.setItem('entityMerges:' + currentCompany.toLowerCase(), JSON.stringify(entityMerges));
  saveEntityMergeToKV(currentCompany, entityBId, entityMerges[entityBId]);

  // Re-render
  renderCompany(currentCompany);
  closeManageEntitiesModal();
  showToast('Merged "' + entityAName + '" into "' + entityBName + '"', 'success');
}

// === ALIAS FUNCTIONS ===

function addAlias(canonicalId, aliasName) {
  aliasName = aliasName.trim();
  if (!aliasName) return;

  // Client-side uniqueness check across all merges
  for (const [cid, merge] of Object.entries(entityMerges)) {
    if (cid !== canonicalId && merge.aliases?.includes(aliasName)) {
      showToast('Alias "' + aliasName + '" is already used by another entity', 'error');
      return;
    }
  }

  // Also check if it already exists on this entity
  if (entityMerges[canonicalId]?.aliases?.includes(aliasName)) {
    showToast('Alias "' + aliasName + '" already exists on this entity', 'error');
    return;
  }

  if (!entityMerges[canonicalId]) {
    entityMerges[canonicalId] = { absorbed: [], aliases: [], mergedSnippets: [], mergedAt: new Date().toISOString() };
  }
  entityMerges[canonicalId].aliases.push(aliasName);
  localStorage.setItem('entityMerges:' + currentCompany.toLowerCase(), JSON.stringify(entityMerges));
  saveEntityMergeToKV(currentCompany, canonicalId, entityMerges[canonicalId]);
  // Re-render detail panel
  selectNode(selectedNode, document.querySelector('.node.selected'));
}

function removeAlias(canonicalId, aliasName) {
  const merge = entityMerges[canonicalId];
  if (!merge) return;
  merge.aliases = merge.aliases.filter(a => a !== aliasName);
  localStorage.setItem('entityMerges:' + currentCompany.toLowerCase(), JSON.stringify(entityMerges));
  saveEntityMergeToKV(currentCompany, canonicalId, merge);
  selectNode(selectedNode, document.querySelector('.node.selected'));
}

function showAddAliasInput(canonicalId) {
  const existing = document.getElementById('addAliasInputContainer');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'addAliasInputContainer';
  container.style.cssText = 'display: flex; gap: 4px; margin-top: 4px;';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'New alias name...';
  input.style.cssText = 'flex: 1; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Add';
  saveBtn.style.cssText = 'padding: 4px 8px; background: #4CAF50; color: white; border: none; border-radius: 4px; font-size: 12px; cursor: pointer;';
  saveBtn.addEventListener('click', () => {
    addAlias(canonicalId, input.value);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addAlias(canonicalId, input.value);
    if (e.key === 'Escape') container.remove();
  });

  container.appendChild(input);
  container.appendChild(saveBtn);

  // Find the alias section and append
  const aliasSection = document.querySelector('.alias-section');
  if (aliasSection) {
    aliasSection.appendChild(container);
    input.focus();
  }
}

// === NORMALIZE ENTITY NAME ===

