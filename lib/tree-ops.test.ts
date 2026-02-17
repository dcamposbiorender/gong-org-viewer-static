import { describe, it, expect } from "vitest";
import {
  countNodes,
  collectAllNodes,
  findNodeById,
  findNodeParent,
  findNodeInTree,
  isDescendant,
  buildNodeIndex,
  isEntityAbsorbed,
  getDisplaySize,
  getSizeOverrideKey,
} from "./tree-ops";
import type { OrgNode, EntityMerge, SizeOverride } from "./types";

// --- Test fixtures ---

function makeTree(): OrgNode {
  return {
    id: "root",
    name: "Root",
    type: "group",
    children: [
      {
        id: "a",
        name: "Division A",
        type: "division",
        children: [
          { id: "a1", name: "Team A1", type: "team", children: [] },
          {
            id: "a2",
            name: "Team A2",
            type: "team",
            children: [
              { id: "a2x", name: "Sub A2X", type: "sub_team", children: [] },
            ],
          },
        ],
      },
      {
        id: "b",
        name: "Division B",
        type: "division",
        children: [],
      },
    ],
  };
}

// --- countNodes ---

describe("countNodes", () => {
  it("counts all nodes recursively", () => {
    expect(countNodes(makeTree())).toBe(6);
  });

  it("counts leaf node as 1", () => {
    expect(
      countNodes({ id: "x", name: "X", type: "team", children: [] })
    ).toBe(1);
  });
});

// --- collectAllNodes ---

describe("collectAllNodes", () => {
  it("flattens tree to array", () => {
    const nodes = collectAllNodes(makeTree());
    expect(nodes).toHaveLength(6);
    expect(nodes.map((n) => n.id)).toEqual([
      "root",
      "a",
      "a1",
      "a2",
      "a2x",
      "b",
    ]);
  });

  it("returns empty array for null", () => {
    expect(collectAllNodes(null)).toEqual([]);
  });
});

// --- findNodeById ---

describe("findNodeById", () => {
  it("finds root", () => {
    expect(findNodeById(makeTree(), "root")?.name).toBe("Root");
  });

  it("finds deeply nested node", () => {
    expect(findNodeById(makeTree(), "a2x")?.name).toBe("Sub A2X");
  });

  it("returns null for missing ID", () => {
    expect(findNodeById(makeTree(), "missing")).toBeNull();
  });

  it("returns null for null tree", () => {
    expect(findNodeById(null, "anything")).toBeNull();
  });
});

// --- findNodeParent ---

describe("findNodeParent", () => {
  it("finds parent of child", () => {
    expect(findNodeParent(makeTree(), "a1")?.id).toBe("a");
  });

  it("finds parent of deeply nested node", () => {
    expect(findNodeParent(makeTree(), "a2x")?.id).toBe("a2");
  });

  it("returns null for root (no parent)", () => {
    expect(findNodeParent(makeTree(), "root")).toBeNull();
  });

  it("returns null for missing node", () => {
    expect(findNodeParent(makeTree(), "missing")).toBeNull();
  });
});

// --- findNodeInTree ---

describe("findNodeInTree", () => {
  it("finds node by ID", () => {
    expect(findNodeInTree(makeTree(), "b")?.name).toBe("Division B");
  });

  it("returns null for missing", () => {
    expect(findNodeInTree(makeTree(), "nope")).toBeNull();
  });
});

// --- isDescendant ---

describe("isDescendant", () => {
  it("detects direct child", () => {
    expect(isDescendant("a", "a1", makeTree())).toBe(true);
  });

  it("detects deeply nested descendant", () => {
    expect(isDescendant("a", "a2x", makeTree())).toBe(true);
  });

  it("rejects non-descendant", () => {
    expect(isDescendant("b", "a1", makeTree())).toBe(false);
  });

  it("considers self as descendant", () => {
    expect(isDescendant("a", "a", makeTree())).toBe(true);
  });

  it("returns false for missing parent", () => {
    expect(isDescendant("missing", "a1", makeTree())).toBe(false);
  });
});

// --- buildNodeIndex ---

describe("buildNodeIndex", () => {
  it("builds O(1) lookup map", () => {
    const index = buildNodeIndex(makeTree());
    expect(index.size).toBe(6);
    expect(index.get("a2x")?.name).toBe("Sub A2X");
  });

  it("handles single-node tree", () => {
    const index = buildNodeIndex({
      id: "solo",
      name: "Solo",
      type: "team",
      children: [],
    });
    expect(index.size).toBe(1);
  });
});

// --- isEntityAbsorbed (pure — accepts merges as param) ---

describe("isEntityAbsorbed", () => {
  it("returns null when no merges exist", () => {
    expect(isEntityAbsorbed("anything", {})).toBeNull();
  });

  it("returns canonical ID when entity is absorbed", () => {
    const merges: Record<string, EntityMerge> = {
      canonical1: {
        absorbed: ["absorbed1", "absorbed2"],
        mergedAt: "2026-01-01",
      },
    };
    expect(isEntityAbsorbed("absorbed1", merges)).toBe("canonical1");
    expect(isEntityAbsorbed("absorbed2", merges)).toBe("canonical1");
  });

  it("returns null when entity is not absorbed", () => {
    const merges: Record<string, EntityMerge> = {
      canonical1: { absorbed: ["other"], mergedAt: "2026-01-01" },
    };
    expect(isEntityAbsorbed("notAbsorbed", merges)).toBeNull();
  });

  it("returns null for canonical entity itself", () => {
    const merges: Record<string, EntityMerge> = {
      canonical1: { absorbed: ["other"], mergedAt: "2026-01-01" },
    };
    expect(isEntityAbsorbed("canonical1", merges)).toBeNull();
  });
});

// --- getDisplaySize (pure — accepts overrides as param) ---

describe("getDisplaySize", () => {
  it("returns first sizeMention when no override", () => {
    const node: OrgNode = {
      id: "x",
      name: "X",
      type: "team",
      children: [],
      gongEvidence: {
        snippets: [],
        sizeMentions: [{ value: "50 people" }],
        matchedContacts: [],
        totalMentions: 0,
        confidence: "medium",
        status: "supported",
      },
    };
    expect(getDisplaySize(node, "test", {})).toBe("50 people");
  });

  it("returns node.size when no sizeMentions", () => {
    const node: OrgNode = {
      id: "x",
      name: "X",
      type: "team",
      size: 25,
      children: [],
    };
    expect(getDisplaySize(node, "test", {})).toBe(25);
  });

  it("returns undefined when no size data at all", () => {
    const node: OrgNode = {
      id: "x",
      name: "X",
      type: "team",
      children: [],
    };
    expect(getDisplaySize(node, "test", {})).toBeUndefined();
  });

  it("returns custom value from override", () => {
    const node: OrgNode = {
      id: "x",
      name: "X",
      type: "team",
      children: [],
    };
    const overrides: Record<string, SizeOverride> = {
      "test:x": { customValue: "42 scientists" },
    };
    expect(getDisplaySize(node, "test", overrides)).toBe("42 scientists");
  });

  it("returns selected mention from override", () => {
    const node: OrgNode = {
      id: "x",
      name: "X",
      type: "team",
      children: [],
      gongEvidence: {
        snippets: [],
        sizeMentions: [{ value: "50 people" }, { value: "60 people" }],
        matchedContacts: [],
        totalMentions: 0,
        confidence: "medium",
        status: "supported",
      },
    };
    const overrides: Record<string, SizeOverride> = {
      "test:x": { selectedSizeIndex: 1 },
    };
    expect(getDisplaySize(node, "test", overrides)).toBe("60 people");
  });
});

// --- getSizeOverrideKey ---

describe("getSizeOverrideKey", () => {
  it("generates lowercase key", () => {
    expect(getSizeOverrideKey("AstraZeneca", "Node1")).toBe(
      "astrazeneca:node1"
    );
  });
});
