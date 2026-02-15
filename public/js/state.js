// State
let currentCompany = 'astrazeneca';
let selectedNode = null;
let overrides = {};
let sizeOverrides = {}; // Size source of truth: { "company:nodeId": { selectedSizeIndex: number | null, customValue: string | null } }
let currentView = 'tree';
let currentMode = 'manual'; // 'manual' or 'matchReview'
let matchReviewState = {}; // Per-company state: { company: { approved: [], rejected: [], manual: [] } }
let draggedNodeId = null;
let dateRange = { start: 0, end: 100 }; // percentages
let evidenceExpanded = false;
let selectedManualNode = null;

// Conflict resolution state (must be before renderTree uses it)
let conflictResolutions = {};

// Field edits state: { entityId: { name?: {original, edited}, leaderName?: {original, edited}, leaderTitle?: {original, edited} } }
let fieldEdits = {};
let editingNodeId = null; // Currently being edited

// Entity merges state: { canonicalId: { absorbed: [], aliases: [], mergedSnippets: [], mergedAt, user } }
let entityMerges = {};

// Manual Map overrides state: { nodeId: { originalParent, newParent, newParentName, movedAt } }
let manualMapOverrides = {};

// Cached working tree for drag operations (avoids rebuilding on every dragover)
let _cachedDragTree = null;

// Get resolution key for a conflict
function getResolutionKey(company, entityId, leaderName) {
  return `${company}:${entityId}:${leaderName}`.toLowerCase();
}

// Size override key
function getSizeOverrideKey(company, nodeId) {
  return `${company}:${nodeId}`.toLowerCase();
}

// SAFETY: No save/load function should reference currentCompany for API URLs.
// Use explicit account parameter passed from the caller.
// grep -n "currentCompany" public/index.html | grep -E "save.*ToKV|delete.*FromKV|kvApiUrl" should return 0 results.
function kvApiUrl(endpoint, account) {
  if (!account) throw new Error('[KV] account parameter required for ' + endpoint);
  return '/api/' + endpoint + '?account=' + account.toLowerCase();
}
