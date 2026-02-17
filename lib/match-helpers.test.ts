import { describe, it, expect } from "vitest";
import {
  getApprovedMatchesForNode,
  getItemStatus,
  buildEntityList,
  EMPTY_DECISIONS,
} from "./match-helpers";
import type { MatchReviewItem, OrgNode, FieldEdit } from "./types";

describe("getApprovedMatchesForNode", () => {
  const items: MatchReviewItem[] = [
    { id: "item-1", gong_entity: "Gong A", snippet: "s1", status: "pending" },
    { id: "item-2", gong_entity: "Gong B", snippet: "s2", status: "pending" },
    { id: "item-3", gong_entity: "Gong C", snippet: "s3", status: "pending" },
  ];

  it("returns empty array when no decisions", () => {
    const result = getApprovedMatchesForNode("NodeX", "node-x", EMPTY_DECISIONS, items);
    expect(result).toEqual([]);
  });

  it("matches by nodeId (approved)", () => {
    const decisions = {
      approved: { "item-1": { manualNode: "NodeX", manualNodeId: "node-x", approvedAt: "2026-01-01" } },
      rejected: {},
      manual: {},
    };
    const result = getApprovedMatchesForNode("NodeX", "node-x", decisions, items);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("item-1");
  });

  it("matches by name fallback", () => {
    const decisions = {
      approved: { "item-2": { manualNode: "NodeX", manualNodeId: "", approvedAt: "2026-01-01" } },
      rejected: {},
      manual: {},
    };
    const result = getApprovedMatchesForNode("NodeX", "node-x", decisions, items);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("item-2");
  });

  it("includes manual matches", () => {
    const decisions = {
      approved: {},
      rejected: {},
      manual: { "item-3": { manualNode: "NodeX", manualNodeId: "node-x", matchedAt: "2026-01-01" } },
    };
    const result = getApprovedMatchesForNode("NodeX", "node-x", decisions, items);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("item-3");
  });

  it("excludes rejected items", () => {
    const decisions = {
      approved: {},
      rejected: { "item-1": { manualNode: "NodeX", manualNodeId: "node-x", rejectedAt: "2026-01-01" } },
      manual: {},
    };
    const result = getApprovedMatchesForNode("NodeX", "node-x", decisions, items);
    expect(result).toEqual([]);
  });
});

describe("getItemStatus", () => {
  it("returns 'pending' when no decisions", () => {
    expect(getItemStatus("item-1", { approved: {}, rejected: {}, manual: {} })).toBe("pending");
  });

  it("returns 'approved' when in approved", () => {
    const decisions = {
      approved: { "item-1": { manualNode: "X", manualNodeId: "x" } },
      rejected: {},
      manual: {},
    };
    expect(getItemStatus("item-1", decisions)).toBe("approved");
  });

  it("returns 'rejected' when in rejected", () => {
    const decisions = {
      approved: {},
      rejected: { "item-1": { rejectedAt: "2026-01-01" } },
      manual: {},
    };
    expect(getItemStatus("item-1", decisions)).toBe("rejected");
  });

  it("returns 'manual' when in manual", () => {
    const decisions = {
      approved: {},
      rejected: {},
      manual: { "item-1": { manualNode: "X", manualNodeId: "x" } },
    };
    expect(getItemStatus("item-1", decisions)).toBe("manual");
  });
});

describe("buildEntityList", () => {
  const tree: OrgNode = {
    id: "root",
    name: "Root",
    type: "group",
    children: [
      {
        id: "child-1",
        name: "Child 1",
        type: "team",
        children: [
          { id: "grandchild-1", name: "Grandchild 1", type: "team", children: [] },
        ],
      },
      { id: "child-2", name: "Child 2", type: "department", children: [] },
    ],
  };

  it("flattens tree to entity list", () => {
    const result = buildEntityList(tree, {});
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ id: "root", name: "Root", path: "Root" });
    expect(result[1]).toEqual({ id: "child-1", name: "Child 1", path: "Root / Child 1" });
    expect(result[2]).toEqual({
      id: "grandchild-1",
      name: "Grandchild 1",
      path: "Root / Child 1 / Grandchild 1",
    });
    expect(result[3]).toEqual({ id: "child-2", name: "Child 2", path: "Root / Child 2" });
  });

  it("uses field edit display names", () => {
    const fieldEdits: Record<string, FieldEdit> = {
      "child-1": { name: { original: "Child 1", edited: "Edited Child" } },
    };
    const result = buildEntityList(tree, fieldEdits);
    const child = result.find((e) => e.id === "child-1");
    expect(child?.name).toBe("Edited Child");
  });

  it("returns empty array for node with no children", () => {
    const leaf: OrgNode = { id: "leaf", name: "Leaf", type: "team", children: [] };
    const result = buildEntityList(leaf, {});
    expect(result).toHaveLength(1);
  });
});
