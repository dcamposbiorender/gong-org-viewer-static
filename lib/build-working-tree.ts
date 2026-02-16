// Pure function: applies KV overlays to base tree to produce a display-ready working tree.
// No side effects, no global state.

import type {
  OrgNode,
  WorkingTreeNode,
  ManualMapOverride,
  CompanyModifications,
  EntityMerge,
  FieldEdit,
} from "./types";
import { isEntityAbsorbed } from "./tree-ops";

/**
 * Build a working tree by applying all KV overlays to the base tree.
 *
 * Order of operations:
 * 1. Deep-clone the base tree
 * 2. Apply modifications (add/delete entities)
 * 3. Apply merges (mark absorbed entities)
 * 4. Apply field edits (display name/leader overrides)
 * 5. Apply move overrides (reparenting)
 */
export function buildWorkingTree(
  root: OrgNode,
  overrides: Record<string, ManualMapOverride>,
  modifications: CompanyModifications | null,
  merges: Record<string, EntityMerge>,
  fieldEdits: Record<string, FieldEdit>
): WorkingTreeNode {
  // 1. Deep-clone to avoid mutating base data
  const tree = deepCloneNode(root);

  // 2. Apply modifications (add/delete)
  if (modifications) {
    applyModifications(tree, modifications);
  }

  // 3. Mark absorbed entities
  markAbsorbed(tree, merges);

  // 4. Apply field edits
  applyFieldEdits(tree, fieldEdits);

  // 5. Apply move overrides
  applyMoveOverrides(tree, overrides);

  return tree;
}

function deepCloneNode(node: OrgNode): WorkingTreeNode {
  return {
    ...node,
    leader: node.leader ? { ...node.leader } : undefined,
    gongEvidence: node.gongEvidence
      ? {
          ...node.gongEvidence,
          snippets: [...node.gongEvidence.snippets],
          sizeMentions: [...node.gongEvidence.sizeMentions],
          matchedContacts: [...node.gongEvidence.matchedContacts],
        }
      : undefined,
    children: node.children.map(deepCloneNode),
  };
}

function applyModifications(
  tree: WorkingTreeNode,
  modifications: CompanyModifications
): void {
  // Apply deletions first
  for (const deletion of modifications.deleted) {
    removeNode(tree, deletion.id);
  }

  // Then additions
  for (const addition of modifications.added) {
    const parent = findWorkingNode(tree, addition.parentId);
    if (parent) {
      parent.children.push({
        id: addition.id,
        name: addition.name,
        type: "team",
        children: [],
      });
    }
  }
}

function markAbsorbed(
  node: WorkingTreeNode,
  merges: Record<string, EntityMerge>
): void {
  const canonical = isEntityAbsorbed(node.id, merges);
  if (canonical) {
    node.absorbed = true;
  }
  for (const child of node.children) {
    markAbsorbed(child, merges);
  }
}

function applyFieldEdits(
  node: WorkingTreeNode,
  edits: Record<string, FieldEdit>
): void {
  const edit = edits[node.id];
  if (edit) {
    if (edit.name?.edited) {
      node.displayName = edit.name.edited;
    }
    if (edit.leaderName?.edited && node.leader) {
      node.displayLeaderName = edit.leaderName.edited;
    }
    if (edit.leaderTitle?.edited && node.leader) {
      node.displayLeaderTitle = edit.leaderTitle.edited;
    }
  }
  for (const child of node.children) {
    applyFieldEdits(child, edits);
  }
}

function applyMoveOverrides(
  tree: WorkingTreeNode,
  overrides: Record<string, ManualMapOverride>
): void {
  for (const [nodeId, override] of Object.entries(overrides)) {
    const node = findWorkingNode(tree, nodeId);
    if (!node) continue;

    // Remove from current parent
    const currentParent = findParent(tree, nodeId);
    if (currentParent) {
      currentParent.children = currentParent.children.filter(
        (c) => c.id !== nodeId
      );
    }

    // Add to new parent
    const newParent = findWorkingNode(tree, override.newParent);
    if (newParent) {
      node.originalParent = override.originalParent;
      node.override = override;
      newParent.children.push(node);
    }
  }
}

function findWorkingNode(
  node: WorkingTreeNode,
  id: string
): WorkingTreeNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findWorkingNode(child, id);
    if (found) return found;
  }
  return null;
}

function findParent(
  node: WorkingTreeNode,
  targetId: string,
  parent: WorkingTreeNode | null = null
): WorkingTreeNode | null {
  if (node.id === targetId) return parent;
  for (const child of node.children) {
    const found = findParent(child, targetId, node);
    if (found) return found;
  }
  return null;
}

function removeNode(tree: WorkingTreeNode, id: string): void {
  tree.children = tree.children.filter((c) => c.id !== id);
  for (const child of tree.children) {
    removeNode(child, id);
  }
}
