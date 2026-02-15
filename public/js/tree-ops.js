// Tree traversal and data structure operations

function countNodes(node) {
  let count = 1;
  if (node.children) {
    node.children.forEach(child => count += countNodes(child));
  }
  return count;
}

// Convert Auto tree node to Manual Map format

function collectAllNodes(node, result = []) {
  if (!node) return result;
  result.push(node);
  if (node.children) {
    node.children.forEach(child => collectAllNodes(child, result));
  }
  return result;
}

// Check if entity has been absorbed by another
function isEntityAbsorbed(entityId) {
  for (const [canonicalId, merge] of Object.entries(entityMerges)) {
    if (merge.absorbed && merge.absorbed.includes(entityId)) {
      return canonicalId;
    }
  }
  return null;
}


function getDisplaySize(node, company) {
  const key = getSizeOverrideKey(company, node.id);
  const override = sizeOverrides[key];

  if (override?.customValue) return override.customValue;
  if (override?.selectedSizeIndex !== undefined && override.selectedSizeIndex !== null) {
    const mention = node.sizeMentions?.[override.selectedSizeIndex];
    if (mention) return mention.value;
  }

  // Default: first size mention or node.size
  if (node.sizeMentions?.length > 0) return node.sizeMentions[0].value;
  return node.size;
}

// Set size override

function convertToManualMapNode(node, level = 0) {
  // Apply field edits to get the current name
  const displayName = getFieldValue(node, 'name');

  // Get display size (respecting overrides)
  const displaySize = getDisplaySize(node, currentCompany);

  // Build gongEvidence with what we have
  const gongEvidence = {
    status: 'supported', // Graduated from Auto is considered supported
    totalMentions: node.snippets?.length || 0,
    matchedContacts: [],
    matchedEntities: [],
    sizeMentions: node.sizeMentions || [],
    teamSizes: displaySize ? [displaySize] : (node.teamSize ? [node.teamSize] : []),
    snippets: node.snippets || []
  };

  // Copy leader info if available
  if (node.leader?.name) {
    gongEvidence.matchedContacts.push({
      name: node.leader.name,
      title: node.leader.title || '',
      isDecisionMaker: true
    });
  }

  const manualNode = {
    id: node.id,
    name: displayName,
    type: node.type || 'group',
    level: level,
    sites: node.sites || [],
    notes: node.override ? `Moved from ${node.override.originalParent} on ${node.override.movedAt}` : '',
    gongEvidence: gongEvidence,
    children: []
  };

  // Recursively convert children
  if (node.children && node.children.length > 0) {
    manualNode.children = node.children.map(child => convertToManualMapNode(child, level + 1));
  }

  return manualNode;
}

// Perform the graduation
// ===== END ENTITY MERGES =====

// Helper to get all size mentions for a Manual Map node (including approved matches)

function buildWorkingTree(node, parent = null) {
  const clone = { ...node, originalParent: parent?.id || null, children: [] };
  const override = overrides[node.id];
  if (override) clone.override = override;

  if (node.children) {
    node.children.forEach(child => {
      if (!overrides[child.id] || overrides[child.id].newParent === node.id) {
        clone.children.push(buildWorkingTree(child, node));
      }
    });
  }

  Object.entries(overrides).forEach(([nodeId, ov]) => {
    if (ov.newParent === node.id && nodeId !== node.id) {
      const movedNode = findNodeById(DATA[currentCompany]?.root, nodeId);
      if (movedNode) {
        const movedClone = buildWorkingTree(movedNode, node);
        movedClone.override = ov;
        clone.children.push(movedClone);
      }
    }
  });

  // Reparent children from absorbed entities (entityMerges)
  if (entityMerges[node.id]) {
    const merge = entityMerges[node.id];
    for (const absorbedId of (merge.absorbed || [])) {
      const absorbedNode = findNodeById(DATA[currentCompany]?.root, absorbedId);
      if (absorbedNode?.children) {
        absorbedNode.children.forEach(child => {
          // Only add if not already moved by a correction override
          if (!overrides[child.id]) {
            clone.children.push(buildWorkingTree(child, node));
          }
        });
      }
    }
  }

  return clone;
}

function findNodeById(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
}

function isDescendant(parentId, childId, tree) {
  const parent = findNodeInTree(tree, parentId);
  if (!parent) return false;
  function check(node) {
    if (node.id === childId) return true;
    return node.children?.some(check) || false;
  }
  return check(parent);
}

function findNodeInTree(node, id) {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeInTree(child, id);
      if (found) return found;
    }
  }
  return null;
}

function getOriginalParentName(nodeId) {
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
  const parent = findParent(DATA[currentCompany]?.root, nodeId);
  return parent ? parent.name : 'root';
}

// Get changes for an entity in current date range
function getChangesForEntity(entityId, rangeStart, rangeEnd) {
  const data = DATA[currentCompany];
  if (!data?.changes) return { reorg: [], leadership: [], size: [] };
  const changes = { reorg: [], leadership: [], size: [] };

  data.changes.reorgs.filter(c => c.entityId === entityId && isInDateRange(c.date, rangeStart, rangeEnd))
    .forEach(c => changes.reorg.push(c));
  data.changes.leadership.filter(c => c.entityId === entityId && isInDateRange(c.date, rangeStart, rangeEnd))
    .forEach(c => changes.leadership.push(c));
  data.changes.size.filter(c => c.entityId === entityId && isInDateRange(c.date, rangeStart, rangeEnd))
    .forEach(c => changes.size.push(c));
  
  return changes;
}

// Count total changes in range
function countChangesInRange(rangeStart, rangeEnd) {
  const data = DATA[currentCompany];
  if (!data?.changes) return { reorgs: 0, leadership: 0, size: 0 };
  return {
    reorgs: data.changes.reorgs.filter(c => isInDateRange(c.date, rangeStart, rangeEnd)).length,
    leadership: data.changes.leadership.filter(c => isInDateRange(c.date, rangeStart, rangeEnd)).length,
    size: data.changes.size.filter(c => isInDateRange(c.date, rangeStart, rangeEnd)).length
  };
}

// Render tree
