// KV API: load/save/delete operations for all endpoints

async function loadOverrides(rerender = false) {
  // Load localStorage first as cache
  const stored = localStorage.getItem('orgChartOverrides');
  if (stored) overrides = safeJsonParse(stored, {});

  // Then try to fetch from Vercel KV and merge (KV takes precedence)
  try {
    const response = await fetch(`/api/corrections?account=${currentCompany.toLowerCase()}`);
    if (response.ok) {
      const kvData = await response.json();
      if (kvData && Object.keys(kvData).length > 0) {
        const hadChanges = JSON.stringify(overrides) !== JSON.stringify({ ...overrides, ...kvData });
        overrides = { ...overrides, ...kvData };
        localStorage.setItem('orgChartOverrides', JSON.stringify(overrides));
        // Re-render if KV had new data
        if (hadChanges && rerender) {
          renderCompany(currentCompany);
        }
      }
    }
  } catch (e) {
    console.log('Using localStorage for overrides (KV not available)');
  }
}

// Load size overrides from localStorage and Vercel KV
async function loadSizeOverrides() {
  const stored = localStorage.getItem('sizeOverrides');
  if (stored) sizeOverrides = safeJsonParse(stored, {});

  // Fetch from Vercel KV and merge (KV takes precedence)
  try {
    const response = await fetch(`/api/sizes?account=${currentCompany.toLowerCase()}`);
    if (response.ok) {
      const kvData = await response.json();
      if (kvData && Object.keys(kvData).length > 0) {
        sizeOverrides = { ...sizeOverrides, ...kvData };
        localStorage.setItem('sizeOverrides', JSON.stringify(sizeOverrides));
      }
    }
  } catch (e) {
    console.log('Using localStorage for size overrides (KV not available)');
  }
}

// Save size overrides to localStorage and Vercel KV
function saveSizeOverrides() {
  localStorage.setItem('sizeOverrides', JSON.stringify(sizeOverrides));
}

// Save single size override to Vercel KV
async function saveSizeOverrideToKV(account, key, override, isRetry = false) {
  try {
    const response = await fetch(kvApiUrl('sizes', account), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, override })
    });
    if (!response.ok) {
      console.error('[Sizes] KV save failed:', response.status, 'account=' + account);
      if (!isRetry) setTimeout(() => saveSizeOverrideToKV(account, key, override, true), 2000);
      else showToast('Size save failed - data saved locally only', 'error');
    }
  } catch (e) {
    console.error('[Sizes] KV save network error:', e.message);
    if (!isRetry) setTimeout(() => saveSizeOverrideToKV(account, key, override, true), 2000);
    else showToast('Size save failed - data saved locally only', 'error');
  }
}

// Get display size for a node (respects overrides)

function setSizeOverride(company, nodeId, selectedIndex, customValue = null) {
  const key = getSizeOverrideKey(company, nodeId);
  const override = {
    selectedSizeIndex: selectedIndex,
    customValue: customValue,
    updatedAt: new Date().toISOString()
  };
  sizeOverrides[key] = override;
  saveSizeOverrides();
  saveSizeOverrideToKV(company, key, override); // Sync to Vercel KV
}

// Clear size override
function clearSizeOverride(nodeId, company) {
  const acct = company || currentCompany;
  const key = getSizeOverrideKey(acct, nodeId);
  delete sizeOverrides[key];
  saveSizeOverrides();
  deleteSizeOverrideFromKV(acct, key); // Sync deletion to Vercel KV
}

// Delete size override from Vercel KV
async function deleteSizeOverrideFromKV(account, key, isRetry = false) {
  try {
    const response = await fetch(kvApiUrl('sizes', account), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    if (!response.ok) {
      console.error('[Sizes] KV delete failed:', response.status, 'account=' + account);
      if (!isRetry) setTimeout(() => deleteSizeOverrideFromKV(account, key, true), 2000);
      else showToast('Size delete failed - reverted locally only', 'error');
    }
  } catch (e) {
    console.error('[Sizes] KV delete network error:', e.message);
    if (!isRetry) setTimeout(() => deleteSizeOverrideFromKV(account, key, true), 2000);
    else showToast('Size delete failed - reverted locally only', 'error');
  }
}

// ===== FIELD EDITS (Inline Entity Editing) =====


async function loadFieldEdits() {
  const stored = localStorage.getItem('fieldEdits');
  if (stored) fieldEdits = safeJsonParse(stored, {});

  try {
    const response = await fetch(`/api/field-edits?account=${currentCompany.toLowerCase()}`);
    if (response.ok) {
      const kvData = await response.json();
      if (kvData && Object.keys(kvData).length > 0) {
        fieldEdits = { ...fieldEdits, ...kvData };
        localStorage.setItem('fieldEdits', JSON.stringify(fieldEdits));
      }
    }
  } catch (e) {
    console.log('Using localStorage for field edits (KV not available)');
  }
}

// Save field edit to Vercel KV
async function saveFieldEditToKV(account, entityId, edit, isRetry = false) {
  try {
    const response = await fetch(kvApiUrl('field-edits', account), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId, edit })
    });
    if (!response.ok) {
      console.error('[FieldEdits] KV save failed:', response.status, 'account=' + account);
      if (!isRetry) setTimeout(() => saveFieldEditToKV(account, entityId, edit, true), 2000);
      else showToast('Field edit save failed - data saved locally only', 'error');
    }
  } catch (e) {
    console.error('[FieldEdits] KV save network error:', e.message);
    if (!isRetry) setTimeout(() => saveFieldEditToKV(account, entityId, edit, true), 2000);
    else showToast('Field edit save failed - data saved locally only', 'error');
  }
}

// Delete field edit from Vercel KV
async function deleteFieldEditFromKV(account, entityId, isRetry = false) {
  try {
    const response = await fetch(kvApiUrl('field-edits', account), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId })
    });
    if (!response.ok) {
      console.error('[FieldEdits] KV delete failed:', response.status, 'account=' + account);
      if (!isRetry) setTimeout(() => deleteFieldEditFromKV(account, entityId, true), 2000);
      else showToast('Field edit delete failed - reverted locally only', 'error');
    }
  } catch (e) {
    console.error('[FieldEdits] KV delete network error:', e.message);
    if (!isRetry) setTimeout(() => deleteFieldEditFromKV(account, entityId, true), 2000);
    else showToast('Field edit delete failed - reverted locally only', 'error');
  }
}

// Get edited value for a field, or original if not edited
function getFieldValue(node, fieldName) {
  const edit = fieldEdits[node.id];
  if (edit && edit[fieldName]?.edited !== undefined) {
    return edit[fieldName].edited;
  }
  if (fieldName === 'name') return node.name || '';
  // Check both Auto mode structure (node.leader) and Manual Map structure (gongEvidence.matchedContacts)
  if (fieldName === 'leaderName') {
    if (node.leader?.name) return node.leader.name;
    const decisionMaker = node.gongEvidence?.matchedContacts?.find(c => c.isDecisionMaker);
    return decisionMaker?.name || '';
  }
  if (fieldName === 'leaderTitle') {
    if (node.leader?.title) return node.leader.title;
    const decisionMaker = node.gongEvidence?.matchedContacts?.find(c => c.isDecisionMaker);
    return decisionMaker?.title || '';
  }
  return '';
}

// Start editing a node

async function loadManualMapsFromKV(onlyCompany) {
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
      } else if (response.status === 404) {
        // No KV data for this company, use embedded data
      }
    } catch (e) {
      console.warn(`[ManualMaps] KV fetch failed for ${company}:`, e.message);
    }
  }));
}

// Load Manual Map modifications (called on init, after loadManualMapsFromKV)
function loadManualMapModifications() {
  const stored = localStorage.getItem('manualMapModifications');
  if (stored) {
    manualMapModifications = safeJsonParse(stored, {});
  }
}

// ===== END MANUAL MAP CRUD =====

// ===== MANUAL MAP DRAG-DROP =====

// Build working tree for Manual Map with overrides applied
function buildManualMapWorkingTree(node, parent = null) {
  const clone = { ...node, originalParent: parent?.id || null, children: [] };
  const override = manualMapOverrides[node.id];
  if (override) clone.override = override;

  if (node.children) {
    node.children.forEach(child => {
      // Include child if no override OR if override keeps it under this parent
      if (!manualMapOverrides[child.id] || manualMapOverrides[child.id].newParent === node.id) {
        clone.children.push(buildManualMapWorkingTree(child, node));
      }
    });
  }

  // Add nodes that have been moved TO this node
  Object.entries(manualMapOverrides).forEach(([nodeId, ov]) => {
    if (ov.newParent === node.id && nodeId !== node.id) {
      const movedNode = findManualNodeById(MANUAL_DATA[currentCompany].root, nodeId);
      if (movedNode) {
        const movedClone = buildManualMapWorkingTree(movedNode, node);
        movedClone.override = ov;
        clone.children.push(movedClone);
      }
    }
  });

  return clone;
}

// Check if childId is a descendant of parentId in Manual Map
function isManualMapDescendant(parentId, childId, tree) {
  const parent = findManualNodeById(tree, parentId);
  if (!parent) return false;
  function check(node) {
    if (node.id === childId) return true;
    return node.children?.some(check) || false;
  }
  return check(parent);
}

// Get original parent name for a Manual Map node
function getManualMapOriginalParentName(nodeId) {
  function findParent(node, targetId, parent = null) {
    if (node.id === targetId) return parent;
    if (node.children) {
      for (const child of node.children) {
        const found = findParent(child, targetId, node);
        if (found) return found;
      }
    }
    return null;
  }
  const parent = findParent(MANUAL_DATA[currentCompany].root, nodeId);
  return parent?.name || 'root';
}

// Save Manual Map overrides to localStorage
function saveManualMapOverrides() {
  localStorage.setItem('manualMapOverrides', JSON.stringify(manualMapOverrides));
}

// Load Manual Map overrides from localStorage
function loadManualMapOverrides() {
  const stored = localStorage.getItem('manualMapOverrides');
  if (stored) manualMapOverrides = safeJsonParse(stored, {});
}

// ===== ENTITY MERGES (Duplicate Leader Handling) =====

// Load entity merges from localStorage and Vercel KV

async function loadEntityMerges() {
  // Clear previous company's merges to prevent cross-contamination
  entityMerges = {};

  const stored = localStorage.getItem('entityMerges:' + currentCompany.toLowerCase());
  if (stored) entityMerges = safeJsonParse(stored, {});

  try {
    const response = await fetch(kvApiUrl('merges', currentCompany));
    if (response.ok) {
      const kvData = await response.json();
      if (kvData && Object.keys(kvData).length > 0) {
        entityMerges = kvData;
      }
    }
  } catch (e) {
    console.log('Using localStorage for entity merges (KV not available)');
  }

  localStorage.setItem('entityMerges:' + currentCompany.toLowerCase(), JSON.stringify(entityMerges));
}

// Save entity merge to Vercel KV
async function saveEntityMergeToKV(account, canonicalId, merge, isRetry = false) {
  try {
    const response = await fetch(kvApiUrl('merges', account), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canonicalId, merge })
    });
    if (!response.ok) {
      console.error('[Merges] KV save failed:', response.status, 'account=' + account);
      if (!isRetry) setTimeout(() => saveEntityMergeToKV(account, canonicalId, merge, true), 2000);
      else showToast('Merge save failed - data saved locally only', 'error');
    }
  } catch (e) {
    console.error('[Merges] KV save network error:', e.message);
    if (!isRetry) setTimeout(() => saveEntityMergeToKV(account, canonicalId, merge, true), 2000);
    else showToast('Merge save failed - data saved locally only', 'error');
  }
}

// Delete entity merge from Vercel KV
async function deleteEntityMergeFromKV(account, canonicalId, isRetry = false) {
  try {
    const response = await fetch(kvApiUrl('merges', account), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canonicalId })
    });
    if (!response.ok) {
      console.error('[Merges] KV delete failed:', response.status, 'account=' + account);
      if (!isRetry) setTimeout(() => deleteEntityMergeFromKV(account, canonicalId, true), 2000);
      else showToast('Merge delete failed - reverted locally only', 'error');
    }
  } catch (e) {
    console.error('[Merges] KV delete network error:', e.message);
    if (!isRetry) setTimeout(() => deleteEntityMergeFromKV(account, canonicalId, true), 2000);
    else showToast('Merge delete failed - reverted locally only', 'error');
  }
}

// Collect all nodes from tree into flat array

function saveOverrides() {
  localStorage.setItem('orgChartOverrides', JSON.stringify(overrides));
}

// Save single override to Vercel KV
async function saveOverrideToKV(account, entityId, override, isRetry = false) {
  try {
    const response = await fetch(kvApiUrl('corrections', account), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId, override })
    });
    if (!response.ok) {
      console.error('[Corrections] KV save failed:', response.status, 'account=' + account);
      if (!isRetry) setTimeout(() => saveOverrideToKV(account, entityId, override, true), 2000);
      else showToast('Correction save failed - data saved locally only', 'error');
    }
  } catch (e) {
    console.error('[Corrections] KV save network error:', e.message);
    if (!isRetry) setTimeout(() => saveOverrideToKV(account, entityId, override, true), 2000);
    else showToast('Correction save failed - data saved locally only', 'error');
  }
}

// Delete single override from Vercel KV
async function deleteOverrideFromKV(account, entityId, isRetry = false) {
  try {
    const response = await fetch(kvApiUrl('corrections', account), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId })
    });
    if (!response.ok) {
      console.error('[Corrections] KV delete failed:', response.status, 'account=' + account);
      if (!isRetry) setTimeout(() => deleteOverrideFromKV(account, entityId, true), 2000);
      else showToast('Correction delete failed - reverted locally only', 'error');
    }
  } catch (e) {
    console.error('[Corrections] KV delete network error:', e.message);
    if (!isRetry) setTimeout(() => deleteOverrideFromKV(account, entityId, true), 2000);
    else showToast('Correction delete failed - reverted locally only', 'error');
  }
}

async function loadMatchReviewState() {
  const stored = localStorage.getItem('matchReviewState');
  if (stored) {
    matchReviewState = safeJsonParse(stored, {});
  }

  // Fetch from Vercel KV per company
  try {
    const response = await fetch(`/api/match-review?account=${currentCompany.toLowerCase()}`);
    if (response.ok) {
      const kvData = await response.json();
      if (kvData && (kvData.approved || kvData.rejected || kvData.manual)) {
        // KV is source of truth — replace local state entirely for this company
        matchReviewState[currentCompany] = {
          approved: kvData.approved || {},
          rejected: kvData.rejected || {},
          manual: kvData.manual || {}
        };
        localStorage.setItem('matchReviewState', JSON.stringify(matchReviewState));
      }
    }
  } catch (e) {
    console.log('Using localStorage for match review state (KV not available)');
  }
}

// Save match review state to localStorage (always) and optionally sync to KV
function saveMatchReviewState(company) {
  localStorage.setItem('matchReviewState', JSON.stringify(matchReviewState));
}

// Save a single match review item to Vercel KV (per-entity read-merge-write)
async function saveMatchReviewItemToKV(account, itemId, decision, category, isRetry = false) {
  try {
    const response = await fetch(kvApiUrl('match-review', account), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, decision, category })
    });
    if (!response.ok) {
      const err = await response.text().catch(() => '');
      console.error('[Match Review] KV save failed:', response.status, 'account=' + account, err);
      if (!isRetry) setTimeout(() => saveMatchReviewItemToKV(account, itemId, decision, category, true), 2000);
      else showToast('Match review save failed - data saved locally only', 'error');
    }
  } catch (e) {
    console.error('[Match Review] KV save network error:', e.message);
    if (!isRetry) setTimeout(() => saveMatchReviewItemToKV(account, itemId, decision, category, true), 2000);
    else showToast('Match review save failed - data saved locally only', 'error');
  }
}

// Delete a match review item from Vercel KV (reset to pending)
async function deleteMatchReviewItemFromKV(account, itemId, isRetry = false) {
  try {
    const response = await fetch(kvApiUrl('match-review', account), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId })
    });
    if (!response.ok) {
      console.error('[Match Review] KV delete failed:', response.status, 'account=' + account);
      if (!isRetry) setTimeout(() => deleteMatchReviewItemFromKV(account, itemId, true), 2000);
      else showToast('Match review reset failed - reverted locally only', 'error');
    }
  } catch (e) {
    console.error('[Match Review] KV delete network error:', e.message);
    if (!isRetry) setTimeout(() => deleteMatchReviewItemFromKV(account, itemId, true), 2000);
    else showToast('Match review reset failed - reverted locally only', 'error');
  }
}

// Initialize match review state for a company
function initMatchReviewState(company) {
  if (!matchReviewState[company]) {
    matchReviewState[company] = {
      approved: {},  // { itemId: { manualNode, manualPath, approvedAt } }
      rejected: {},  // { itemId: { rejectedAt } }
      manual: {}     // { itemId: { manualNode, manualPath, matchedAt } }
    };
  }
}

// ============================================
// MATCH REVIEW FEATURE (Rebuilt 2026-01-05)
// ============================================

// Check if company has match review data
function hasMatchReviewData(companyKey) {
  return typeof MATCH_REVIEW_DATA !== 'undefined' &&
         MATCH_REVIEW_DATA.companies &&
         MATCH_REVIEW_DATA.companies[companyKey];
}

// Get item status (pending, approved, rejected, manual)
function getItemStatus(company, itemId) {
  if (!matchReviewState[company]) return 'pending';
  if (matchReviewState[company].approved[itemId]) return 'approved';
  if (matchReviewState[company].rejected[itemId]) return 'rejected';
  if (matchReviewState[company].manual[itemId]) return 'manual';
  return 'pending';
}

// Get manual map nodes for dropdown
function getManualMapOptions(company) {
  if (!hasManualMap(company)) return [];
  const options = [];
  function traverse(node, path = '') {
    const currentPath = path ? `${path}/${node.name}` : node.name;
    options.push({ id: node.id, name: node.name, path: currentPath });
    if (node.children) {
      node.children.forEach(child => traverse(child, currentPath));
    }
  }
  traverse(MANUAL_DATA[company].root || MANUAL_DATA[company]);
  return options;
}

// ===== ENTITY PICKER MODAL =====
