// Pure tree traversal and data structure operations.
// No global state reads — all functions accept state as parameters.

import type { OrgNode, EntityMerge, SizeMention, SizeOverride } from "./types";

export function countNodes(node: OrgNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}

export function collectAllNodes(
  node: OrgNode | null,
  result: OrgNode[] = []
): OrgNode[] {
  if (!node) return result;
  result.push(node);
  for (const child of node.children) {
    collectAllNodes(child, result);
  }
  return result;
}

/** Returns the canonical entity ID if this entity was absorbed, or null. */
export function isEntityAbsorbed(
  entityId: string,
  merges: Record<string, EntityMerge>
): string | null {
  for (const [canonicalId, merge] of Object.entries(merges)) {
    if (merge.absorbed.includes(entityId)) {
      return canonicalId;
    }
  }
  return null;
}

/** Get display size respecting user overrides. */
export function getDisplaySize(
  node: OrgNode,
  company: string,
  overrides: Record<string, SizeOverride>
): string | number | undefined {
  const key = `${company}:${node.id}`.toLowerCase();
  const override = overrides[key];

  if (override?.customValue) return override.customValue;
  if (override?.selectedSizeIndex != null) {
    const mentions: SizeMention[] =
      node.gongEvidence?.sizeMentions ?? [];
    const mention = mentions[override.selectedSizeIndex];
    if (mention) return mention.value;
  }

  const mentions: SizeMention[] = node.gongEvidence?.sizeMentions ?? [];
  if (mentions.length > 0) return mentions[0].value;
  return node.size;
}

/** Build a Map<nodeId, node> for O(1) lookups. */
export function buildNodeIndex(root: OrgNode): Map<string, OrgNode> {
  const index = new Map<string, OrgNode>();
  function walk(node: OrgNode) {
    if (node?.id) index.set(node.id, node);
    for (const child of node.children) {
      walk(child);
    }
  }
  walk(root);
  return index;
}

export function findNodeById(
  node: OrgNode | null,
  id: string
): OrgNode | null {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

export function isDescendant(
  parentId: string,
  childId: string,
  tree: OrgNode
): boolean {
  const parent = findNodeInTree(tree, parentId);
  if (!parent) return false;
  function check(node: OrgNode): boolean {
    if (node.id === childId) return true;
    return node.children?.some(check) ?? false;
  }
  return check(parent);
}

export function findNodeParent(
  node: OrgNode | null,
  targetId: string,
  parent: OrgNode | null = null
): OrgNode | null {
  if (!node) return null;
  if (node.id === targetId) return parent;
  for (const child of node.children) {
    const found = findNodeParent(child, targetId, node);
    if (found) return found;
  }
  return null;
}

export function findNodeInTree(node: OrgNode, id: string): OrgNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNodeInTree(child, id);
    if (found) return found;
  }
  return null;
}

/** Helper to generate a size override key. */
export function getSizeOverrideKey(
  company: string,
  nodeId: string
): string {
  return `${company}:${nodeId}`.toLowerCase();
}
