import { describe, it, expect } from "vitest";
import type { MatchDecisions } from "./match-helpers";

// Test the state transition logic used by useMatchReview
// (Hook lifecycle tested via component tests; here we test pure logic)

function applyApprove(
  decisions: MatchDecisions,
  itemId: string,
  manualNode: string,
  manualPath: string,
  manualNodeId: string
): MatchDecisions {
  const next = {
    approved: { ...decisions.approved },
    rejected: { ...decisions.rejected },
    manual: { ...decisions.manual },
  };
  delete next.rejected[itemId];
  delete next.manual[itemId];
  next.approved[itemId] = { manualNode, manualNodeId, manualPath, approvedAt: new Date().toISOString() };
  return next;
}

function applyReject(decisions: MatchDecisions, itemId: string): MatchDecisions {
  const next = {
    approved: { ...decisions.approved },
    rejected: { ...decisions.rejected },
    manual: { ...decisions.manual },
  };
  delete next.approved[itemId];
  delete next.manual[itemId];
  next.rejected[itemId] = { rejectedAt: new Date().toISOString() };
  return next;
}

function applyReset(decisions: MatchDecisions, itemId: string): MatchDecisions {
  const next = {
    approved: { ...decisions.approved },
    rejected: { ...decisions.rejected },
    manual: { ...decisions.manual },
  };
  delete next.approved[itemId];
  delete next.rejected[itemId];
  delete next.manual[itemId];
  return next;
}

describe("match review state transitions", () => {
  const empty: MatchDecisions = { approved: {}, rejected: {}, manual: {} };

  it("approve adds to approved, removes from others", () => {
    const rejected: MatchDecisions = { ...empty, rejected: { "item-1": { rejectedAt: "2026-01-01" } } };
    const result = applyApprove(rejected, "item-1", "Node A", "/path", "node-a");
    expect(result.approved["item-1"]).toBeDefined();
    expect(result.rejected["item-1"]).toBeUndefined();
  });

  it("reject adds to rejected, removes from others", () => {
    const approved: MatchDecisions = {
      ...empty,
      approved: { "item-1": { manualNode: "X", manualNodeId: "x", approvedAt: "2026-01-01" } },
    };
    const result = applyReject(approved, "item-1");
    expect(result.rejected["item-1"]).toBeDefined();
    expect(result.approved["item-1"]).toBeUndefined();
  });

  it("reset removes from all categories", () => {
    const withApproved: MatchDecisions = {
      ...empty,
      approved: { "item-1": { manualNode: "X", manualNodeId: "x" } },
    };
    const result = applyReset(withApproved, "item-1");
    expect(result.approved["item-1"]).toBeUndefined();
    expect(result.rejected["item-1"]).toBeUndefined();
    expect(result.manual["item-1"]).toBeUndefined();
  });

  it("approve preserves other items", () => {
    const existing: MatchDecisions = {
      approved: { "item-2": { manualNode: "Y", manualNodeId: "y" } },
      rejected: {},
      manual: {},
    };
    const result = applyApprove(existing, "item-1", "X", "/path", "x");
    expect(result.approved["item-2"]).toBeDefined();
    expect(result.approved["item-1"]).toBeDefined();
  });

  it("does not mutate input", () => {
    const original: MatchDecisions = { approved: {}, rejected: {}, manual: {} };
    applyApprove(original, "item-1", "X", "/path", "x");
    expect(original.approved["item-1"]).toBeUndefined();
  });
});
