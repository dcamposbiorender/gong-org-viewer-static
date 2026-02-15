// Tree traversal and data structure operations

import type { OrgNode } from './types';
import { entityMerges, sizeOverrides, getSizeOverrideKey } from './state';

export function countNodes(node: OrgNode): number {
  let count = 1;
  if (node.children) {
    node.children.forEach(child => count += countNodes(child));
  }
  return count;
}

export function collectAllNodes(node: OrgNode | null, result: OrgNode[] = []): OrgNode[] {
  if (!node) return result;
  result.push(node);
  if (node.children) {
    node.children.forEach(child => collectAllNodes(child, result));
  }
  return result;
}

/** Returns the canonical entity ID if this entity was absorbed, or null. */
export function isEntityAbsorbed(entityId: string): string | null {
  for (const [canonicalId, merge] of Object.entries(entityMerges)) {
    if (merge.absorbed && merge.absorbed.includes(entityId)) {
      return canonicalId;
    }
  }
  return null;
}

/** Get display size respecting user overrides. Priority: custom > selected mention > first mention > node.size */
export function getDisplaySize(node: any, company: string): string | number | undefined {
  const key = getSizeOverrideKey(company, node.id);
  const override = sizeOverrides[key];

  if (override?.customValue) return override.customValue;
  if (override?.selectedSizeIndex !== undefined && override.selectedSizeIndex !== null) {
    const mention = node.sizeMentions?.[override.selectedSizeIndex];
    if (mention) return mention.value;
  }

  if (node.sizeMentions?.length > 0) return node.sizeMentions[0].value;
  return node.size;
}

/** Build a Map<nodeId, node> for O(1) lookups. */
export function buildNodeIndex(root: OrgNode): Map<string, OrgNode> {
  const index = new Map<string, OrgNode>();
  function walk(node: OrgNode) {
    if (node?.id) index.set(node.id, node);
    if (node?.children) node.children.forEach(walk);
  }
  walk(root);
  return index;
}

export function findNodeById(node: OrgNode | null, id: string): OrgNode | null {
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

export function isDescendant(parentId: string, childId: string, tree: OrgNode): boolean {
  const parent = findNodeInTree(tree, parentId);
  if (!parent) return false;
  function check(node: OrgNode): boolean {
    if (node.id === childId) return true;
    return node.children?.some(check) || false;
  }
  return check(parent);
}

export function findNodeInTree(node: OrgNode, id: string): OrgNode | null {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeInTree(child, id);
      if (found) return found;
    }
  }
  return null;
}
