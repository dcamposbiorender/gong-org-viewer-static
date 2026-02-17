import { describe, it, expect } from "vitest";
import { buildWorkingTree } from "./build-working-tree";
import type {
  OrgNode,
  ManualMapOverride,
  CompanyModifications,
  EntityMerge,
  FieldEdit,
} from "./types";

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
        leader: { name: "Alice", title: "VP" },
        children: [
          { id: "a1", name: "Team A1", type: "team", children: [] },
          { id: "a2", name: "Team A2", type: "team", children: [] },
        ],
      },
      {
        id: "b",
        name: "Division B",
        type: "division",
        children: [
          { id: "b1", name: "Team B1", type: "team", children: [] },
        ],
      },
    ],
  };
}

describe("buildWorkingTree", () => {
  it("returns a deep clone without mutations", () => {
    const original = makeTree();
    const tree = buildWorkingTree(original, {}, null, {}, {});
    expect(tree.id).toBe("root");
    expect(tree.children).toHaveLength(2);
    // Verify it's a deep clone
    tree.name = "Modified";
    expect(original.name).toBe("Root");
  });

  it("applies field edits", () => {
    const edits: Record<string, FieldEdit> = {
      a: {
        name: { original: "Division A", edited: "Division Alpha" },
        leaderName: { original: "Alice", edited: "Alicia" },
      },
    };
    const tree = buildWorkingTree(makeTree(), {}, null, {}, edits);
    const divA = tree.children.find((c) => c.id === "a")!;
    expect(divA.displayName).toBe("Division Alpha");
    expect(divA.displayLeaderName).toBe("Alicia");
  });

  it("marks absorbed entities", () => {
    const merges: Record<string, EntityMerge> = {
      a1: { absorbed: ["a2"], mergedAt: "2026-01-01" },
    };
    const tree = buildWorkingTree(makeTree(), {}, null, merges, {});
    const divA = tree.children.find((c) => c.id === "a")!;
    const a2 = divA.children.find((c) => c.id === "a2")!;
    expect(a2.absorbed).toBe(true);
    // a1 should not be absorbed (it's the canonical)
    const a1 = divA.children.find((c) => c.id === "a1")!;
    expect(a1.absorbed).toBeUndefined();
  });

  it("applies move overrides (reparenting)", () => {
    const overrides: Record<string, ManualMapOverride> = {
      a1: {
        originalParent: "a",
        newParent: "b",
        movedAt: "2026-01-01",
      },
    };
    const tree = buildWorkingTree(makeTree(), overrides, null, {}, {});
    const divA = tree.children.find((c) => c.id === "a")!;
    const divB = tree.children.find((c) => c.id === "b")!;
    // a1 should have moved from A to B
    expect(divA.children.map((c) => c.id)).toEqual(["a2"]);
    expect(divB.children.map((c) => c.id)).toContain("a1");
    const movedA1 = divB.children.find((c) => c.id === "a1")!;
    expect(movedA1.originalParent).toBe("a");
  });

  it("applies modifications (add and delete)", () => {
    const modifications: CompanyModifications = {
      added: [
        {
          id: "new1",
          name: "New Team",
          parentId: "b",
          addedAt: "2026-01-01",
        },
      ],
      deleted: [{ id: "a2", deletedAt: "2026-01-01" }],
    };
    const tree = buildWorkingTree(makeTree(), {}, modifications, {}, {});
    const divA = tree.children.find((c) => c.id === "a")!;
    const divB = tree.children.find((c) => c.id === "b")!;
    // a2 should be deleted
    expect(divA.children.map((c) => c.id)).toEqual(["a1"]);
    // new1 should be added to B
    expect(divB.children.map((c) => c.id)).toContain("new1");
  });

  it("handles all operations together", () => {
    const overrides: Record<string, ManualMapOverride> = {
      a1: {
        originalParent: "a",
        newParent: "b",
        movedAt: "2026-01-01",
      },
    };
    const modifications: CompanyModifications = {
      added: [
        {
          id: "new1",
          name: "New Team",
          parentId: "a",
          addedAt: "2026-01-01",
        },
      ],
      deleted: [],
    };
    const merges: Record<string, EntityMerge> = {
      b1: { absorbed: ["a2"], mergedAt: "2026-01-01" },
    };
    const edits: Record<string, FieldEdit> = {
      b: { name: { original: "Division B", edited: "Division Beta" } },
    };

    const tree = buildWorkingTree(
      makeTree(),
      overrides,
      modifications,
      merges,
      edits
    );

    // Division B renamed
    const divB = tree.children.find((c) => c.id === "b")!;
    expect(divB.displayName).toBe("Division Beta");

    // a1 moved to B
    expect(divB.children.map((c) => c.id)).toContain("a1");

    // a2 absorbed
    const divA = tree.children.find((c) => c.id === "a")!;
    const a2 = divA.children.find((c) => c.id === "a2");
    expect(a2?.absorbed).toBe(true);

    // new1 added to A
    expect(divA.children.map((c) => c.id)).toContain("new1");
  });

  it("applies leader field edits on node with no original leader", () => {
    // Division B has no leader property in makeTree()
    const edits: Record<string, FieldEdit> = {
      b: {
        leaderName: { original: "", edited: "Bob" },
        leaderTitle: { original: "", edited: "Director" },
      },
    };
    const tree = buildWorkingTree(makeTree(), {}, null, {}, edits);
    const divB = tree.children.find((c) => c.id === "b")!;
    expect(divB.displayLeaderName).toBe("Bob");
    expect(divB.displayLeaderTitle).toBe("Director");
    // Original leader should still be undefined
    expect(divB.leader).toBeUndefined();
  });

  it("deletes a manually-added entity", () => {
    const modifications: CompanyModifications = {
      added: [
        { id: "manual-1", name: "Test Entity", parentId: "b", addedAt: "2026-01-01" },
      ],
      deleted: [{ id: "manual-1", deletedAt: "2026-01-02" }],
    };
    const tree = buildWorkingTree(makeTree(), {}, modifications, {}, {});
    const divB = tree.children.find((c) => c.id === "b")!;
    // manual-1 should NOT appear — it's in both added and deleted
    expect(divB.children.map((c) => c.id)).not.toContain("manual-1");
  });

  it("handles empty overlays", () => {
    const tree = buildWorkingTree(makeTree(), {}, null, {}, {});
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].children).toHaveLength(2);
    expect(tree.children[1].children).toHaveLength(1);
  });
});
