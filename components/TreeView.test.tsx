import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TreeView from "./TreeView";
import type { CompanyData, WorkingTreeNode, MatchReviewItem } from "@/lib/types";
import { EMPTY_STATE } from "@/lib/types";
import { EMPTY_DECISIONS } from "@/lib/match-helpers";
import React from "react";

afterEach(() => cleanup());

const companyData: CompanyData = {
  company: "AstraZeneca",
  source: "Manual Map",
  stats: { entities: 5, matched: 3, snippets: 10 },
  root: {
    id: "root",
    name: "R&D",
    type: "group",
    children: [
      {
        id: "child-1",
        name: "Oncology",
        type: "department",
        leader: { name: "Dr. Smith", title: "VP" },
        gongEvidence: {
          snippets: [],
          sizeMentions: [{ value: "50" }],
          matchedContacts: [],
          totalMentions: 3,
          confidence: "high",
          status: "supported",
        },
        children: [
          {
            id: "grandchild-1",
            name: "Clinical Trials",
            type: "team",
            children: [],
          },
        ],
      },
      {
        id: "child-2",
        name: "Cardiology",
        type: "department",
        gongEvidence: {
          snippets: [],
          sizeMentions: [],
          matchedContacts: [],
          totalMentions: 0,
          confidence: "none",
          status: "unverified",
        },
        children: [],
      },
    ],
  },
};

const defaultProps = {
  companyData,
  company: "astrazeneca",
  state: EMPTY_STATE,
  decisions: EMPTY_DECISIONS,
  reviewItems: [] as MatchReviewItem[],
  selectedNodeId: null as string | null,
  onSelect: vi.fn(),
  onDrop: vi.fn(),
  onFieldEdit: vi.fn(),
  isDraggingRef: { current: false },
};

describe("TreeView", () => {
  it("renders root node", () => {
    render(<TreeView {...defaultProps} />);
    expect(screen.getByText("R&D")).toBeDefined();
  });

  it("renders child nodes", () => {
    render(<TreeView {...defaultProps} />);
    expect(screen.getByText("Oncology")).toBeDefined();
    expect(screen.getByText("Cardiology")).toBeDefined();
  });

  it("renders grandchild nodes", () => {
    render(<TreeView {...defaultProps} />);
    expect(screen.getByText("Clinical Trials")).toBeDefined();
  });

  it("renders leader name", () => {
    render(<TreeView {...defaultProps} />);
    expect(screen.getByText(/Dr\. Smith/)).toBeDefined();
  });

  it("renders meta info (size, mentions)", () => {
    render(<TreeView {...defaultProps} />);
    expect(screen.getByText(/50/)).toBeDefined();
    expect(screen.getByText(/3 mentions/)).toBeDefined();
  });

  it("calls onSelect when node clicked", () => {
    const onSelect = vi.fn();
    render(<TreeView {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Oncology"));
    expect(onSelect).toHaveBeenCalledWith("child-1");
  });

  it("highlights selected node", () => {
    render(<TreeView {...defaultProps} selectedNodeId="child-1" />);
    const node = screen.getByText("Oncology").closest("[data-node-id]");
    expect(node?.className).toContain("bg-[rgba(37,99,235,0.06)]");
  });

  it("renders status dot for supported nodes", () => {
    render(<TreeView {...defaultProps} />);
    const oncologyNode = screen.getByText("Oncology").closest("[data-node-id]");
    const dot = oncologyNode?.querySelector("[data-status-dot]");
    expect(dot).not.toBeNull();
  });

  it("does not render status dot for unverified nodes", () => {
    render(<TreeView {...defaultProps} />);
    const cardioNode = screen.getByText("Cardiology").closest("[data-node-id]");
    const dot = cardioNode?.querySelector("[data-status-dot]");
    expect(dot).toBeNull();
  });

  it("renders edit button on nodes", () => {
    render(<TreeView {...defaultProps} />);
    const editBtns = document.querySelectorAll("[data-edit-btn]");
    // Root + 3 children/grandchildren = 4 edit buttons
    expect(editBtns.length).toBeGreaterThanOrEqual(3);
  });

  it("enters inline edit mode when edit button clicked", () => {
    render(<TreeView {...defaultProps} />);
    const oncologyNode = screen.getByText("Oncology").closest("[data-node-id]");
    const editBtn = oncologyNode?.querySelector("[data-edit-btn]");
    fireEvent.click(editBtn!);
    // Should now show edit form with input fields
    expect(screen.getByDisplayValue("Oncology")).toBeDefined();
  });

  it("calls onFieldEdit when save clicked in edit form", () => {
    const onFieldEdit = vi.fn();
    render(<TreeView {...defaultProps} onFieldEdit={onFieldEdit} />);
    const oncologyNode = screen.getByText("Oncology").closest("[data-node-id]");
    const editBtn = oncologyNode?.querySelector("[data-edit-btn]");
    fireEvent.click(editBtn!);
    // Change the name
    const nameInput = screen.getByDisplayValue("Oncology");
    fireEvent.change(nameInput, { target: { value: "Oncology Revised" } });
    // Click save
    fireEvent.click(screen.getByText("Save"));
    expect(onFieldEdit).toHaveBeenCalledWith(
      "child-1",
      expect.objectContaining({ name: "Oncology Revised" })
    );
  });

  it("cancels edit when Cancel clicked", () => {
    render(<TreeView {...defaultProps} />);
    const oncologyNode = screen.getByText("Oncology").closest("[data-node-id]");
    const editBtn = oncologyNode?.querySelector("[data-edit-btn]");
    fireEvent.click(editBtn!);
    fireEvent.click(screen.getByText("Cancel"));
    // Should return to normal view
    expect(screen.getByText("Oncology")).toBeDefined();
    expect(screen.queryByDisplayValue("Oncology")).toBeNull();
  });

  it("applies field edits to display names", () => {
    const stateWithEdits = {
      ...EMPTY_STATE,
      fieldEdits: {
        "child-1": { name: { original: "Oncology", edited: "Oncology Edited" } },
      },
    };
    render(<TreeView {...defaultProps} state={stateWithEdits} />);
    expect(screen.getByText("Oncology Edited")).toBeDefined();
  });

  it("filters out absorbed nodes", () => {
    const stateWithMerges = {
      ...EMPTY_STATE,
      merges: {
        "child-1": { absorbed: ["child-2"], mergedAt: "2026-01-01" },
      },
    };
    render(<TreeView {...defaultProps} state={stateWithMerges} />);
    expect(screen.queryByText("Cardiology")).toBeNull();
  });

  it("root node is not draggable", () => {
    render(<TreeView {...defaultProps} />);
    const rootNode = screen.getByText("R&D").closest("[data-node-id]");
    expect(rootNode?.getAttribute("draggable")).not.toBe("true");
  });

  it("child nodes are draggable", () => {
    render(<TreeView {...defaultProps} />);
    const oncologyNode = screen.getByText("Oncology").closest("[data-node-id]");
    expect(oncologyNode?.getAttribute("draggable")).toBe("true");
  });
});
