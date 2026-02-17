// Pure helper functions for match review and entity list operations.

import type { MatchReviewItem, OrgNode, FieldEdit } from "./types";

export interface MatchDecisions {
  approved: Record<string, { manualNode: string; manualNodeId?: string; manualPath?: string; approvedAt?: string }>;
  rejected: Record<string, { rejectedAt?: string; [key: string]: unknown }>;
  manual: Record<string, { manualNode: string; manualNodeId?: string; manualPath?: string; matchedAt?: string }>;
}

export const EMPTY_DECISIONS: MatchDecisions = {
  approved: {},
  rejected: {},
  manual: {},
};

/** Get approved/manual match review items that reference a given node (by ID or name). */
export function getApprovedMatchesForNode(
  nodeName: string,
  nodeId: string,
  decisions: MatchDecisions,
  items: MatchReviewItem[]
): MatchReviewItem[] {
  const result: MatchReviewItem[] = [];

  for (const category of ["approved", "manual"] as const) {
    for (const [itemId, decision] of Object.entries(decisions[category])) {
      const matchById = nodeId && decision.manualNodeId === nodeId;
      const matchByName = decision.manualNode === nodeName;
      if (matchById || matchByName) {
        const item = items.find((i) => i.id === itemId);
        if (item) result.push(item);
      }
    }
  }

  return result;
}

/** Get the review status of a match review item. */
export function getItemStatus(
  itemId: string,
  decisions: MatchDecisions
): "pending" | "approved" | "rejected" | "manual" {
  if (decisions.approved[itemId]) return "approved";
  if (decisions.rejected[itemId]) return "rejected";
  if (decisions.manual[itemId]) return "manual";
  return "pending";
}

export interface EntityListItem {
  id: string;
  name: string;
  path: string;
}

/** Flatten an OrgNode tree to a list of {id, name, path} for entity pickers. */
export function buildEntityList(
  node: OrgNode,
  fieldEdits: Record<string, FieldEdit>,
  parentPath = ""
): EntityListItem[] {
  const displayName = fieldEdits[node.id]?.name?.edited || node.name;
  const currentPath = parentPath ? `${parentPath} / ${displayName}` : displayName;
  const result: EntityListItem[] = [{ id: node.id, name: displayName, path: currentPath }];
  for (const child of node.children) {
    result.push(...buildEntityList(child, fieldEdits, currentPath));
  }
  return result;
}
