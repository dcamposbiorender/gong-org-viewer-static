import type {
  CompanyData,
  MatchReviewData,
  ValidAccount,
  OrgNode,
  WorkingTreeNode,
  Override,
  SizeOverride,
} from './types';

// --- App state (mutable, company-scoped) ---

export let currentCompany: ValidAccount = 'astrazeneca';
export let selectedNode: OrgNode | null = null;
export let overrides: Record<string, Override> = {};
export let sizeOverrides: Record<string, SizeOverride> = {};
export let currentView: 'tree' | 'table' = 'tree';
export let currentMode: 'manual' | 'matchReview' = 'manual';
export let matchReviewState: Record<string, { approved: Record<string, any>; rejected: Record<string, any>; manual: Record<string, any> }> = {};
export let draggedNodeId: string | null = null;
export let dateRange = { start: 0, end: 100 };
export let evidenceExpanded = false;
export let selectedManualNode: OrgNode | null = null;

// Conflict resolution state
export let conflictResolutions: Record<string, any> = {};

// Field edits: { entityId: { name?: {original, edited}, leaderName?: ... } }
export let fieldEdits: Record<string, any> = {};
export let editingNodeId: string | null = null;

// Entity merges: { canonicalId: { absorbed: [], aliases: [], ... } }
export let entityMerges: Record<string, any> = {};

// Manual Map overrides: { nodeId: { originalParent, newParent, newParentName, movedAt } }
export let manualMapOverrides: Record<string, any> = {};

// Manual map modifications (add/delete entities): { company: { added: [], deleted: [] } }
export let manualMapModifications: Record<string, any> = {};

// Cached working tree for drag operations
export let _cachedDragTree: WorkingTreeNode | null = null;

// Table sort state
export let tableSortKey = 'date';
export let tableSortAsc = false;

// --- State setters (needed because `let` exports are read-only from importers) ---

export function setCurrentCompany(v: ValidAccount) { currentCompany = v; }
export function setSelectedNode(v: OrgNode | null) { selectedNode = v; }
export function setOverrides(v: Record<string, Override>) { overrides = v; }
export function setSizeOverrides(v: Record<string, SizeOverride>) { sizeOverrides = v; }
export function setCurrentView(v: 'tree' | 'table') { currentView = v; }
export function setCurrentMode(v: 'manual' | 'matchReview') { currentMode = v; }
export function setMatchReviewState(v: typeof matchReviewState) { matchReviewState = v; }
export function setDraggedNodeId(v: string | null) { draggedNodeId = v; }
export function setDateRange(v: { start: number; end: number }) { dateRange = v; }
export function setEvidenceExpanded(v: boolean) { evidenceExpanded = v; }
export function setSelectedManualNode(v: OrgNode | null) { selectedManualNode = v; }
export function setConflictResolutions(v: Record<string, any>) { conflictResolutions = v; }
export function setFieldEdits(v: Record<string, any>) { fieldEdits = v; }
export function setEditingNodeId(v: string | null) { editingNodeId = v; }
export function setEntityMerges(v: Record<string, any>) { entityMerges = v; }
export function setManualMapOverrides(v: Record<string, any>) { manualMapOverrides = v; }
export function setManualMapModifications(v: Record<string, any>) { manualMapModifications = v; }
export function setCachedDragTree(v: WorkingTreeNode | null) { _cachedDragTree = v; }
export function setTableSortKey(v: string) { tableSortKey = v; }
export function setTableSortAsc(v: boolean) { tableSortAsc = v; }

// --- Pure helper functions ---

export function getResolutionKey(company: string, entityId: string, leaderName: string): string {
  return `${company}:${entityId}:${leaderName}`.toLowerCase();
}

export function getSizeOverrideKey(company: string, nodeId: string): string {
  return `${company}:${nodeId}`.toLowerCase();
}

export function kvApiUrl(endpoint: string, account: string): string {
  if (!account) throw new Error('[KV] account parameter required for ' + endpoint);
  return '/api/' + endpoint + '?account=' + account.toLowerCase();
}

/** URL for consolidated org-state endpoint. */
export function orgStateUrl(type: string, account: string): string {
  if (!account) throw new Error('[KV] account parameter required for ' + type);
  return '/api/org-state?account=' + account.toLowerCase() + '&type=' + type;
}
