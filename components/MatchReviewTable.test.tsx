import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import MatchReviewTable from "./MatchReviewTable";
import type { MatchReviewItem } from "@/lib/types";
import { EMPTY_DECISIONS, type MatchDecisions } from "@/lib/match-helpers";

afterEach(() => cleanup());

const items: MatchReviewItem[] = [
  {
    id: "item-1",
    gong_entity: "Oncology Team",
    snippet: "We have 50 people in oncology",
    status: "pending",
    speaker_name: "Dr. Smith",
    call_date: "2025-12-01",
    gong_url: "https://gong.io/call/1",
    confidence: "high",
    llm_suggested_match: {
      manual_node_id: "node-1",
      manual_node_name: "Oncology",
      manual_node_path: "R&D / Oncology",
      confidence: "high",
      reasoning: "Name match with high confidence",
    },
  },
  {
    id: "item-2",
    gong_entity: "Unknown Team",
    snippet: "This team is growing",
    status: "pending",
    speaker_name: "Jane Doe",
    call_date: "2025-11-15",
  },
  {
    id: "item-3",
    gong_entity: "Cardio Dept",
    snippet: "Cardiology is expanding",
    status: "pending",
    confidence: "medium",
    llm_suggested_match: {
      manual_node_id: "node-2",
      manual_node_name: "Cardiology",
      manual_node_path: "R&D / Cardiology",
      confidence: "medium",
      reasoning: "Partial name match",
    },
  },
];

const defaultProps = {
  items,
  decisions: EMPTY_DECISIONS,
  onApprove: vi.fn(),
  onReject: vi.fn(),
  onPickEntity: vi.fn(),
  onReset: vi.fn(),
};

describe("MatchReviewTable", () => {
  it("renders table with all items", () => {
    render(<MatchReviewTable {...defaultProps} />);
    expect(screen.getByText(/oncology team/i)).toBeDefined();
    expect(screen.getByText(/unknown team/i)).toBeDefined();
    expect(screen.getByText(/cardio dept/i)).toBeDefined();
  });

  it("shows snippet text", () => {
    render(<MatchReviewTable {...defaultProps} />);
    expect(screen.getByText(/we have 50 people/i)).toBeDefined();
  });

  it("shows LLM suggestion when present", () => {
    render(<MatchReviewTable {...defaultProps} />);
    expect(screen.getByText("Oncology")).toBeDefined();
    expect(screen.getByText("R&D / Oncology")).toBeDefined();
  });

  it("shows 'No suggestion' when no LLM match", () => {
    render(<MatchReviewTable {...defaultProps} />);
    // At least one "No suggestion" text in the table cells (also in filter dropdown)
    const noSuggestionElements = screen.getAllByText(/no suggestion/i);
    expect(noSuggestionElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows confidence badge", () => {
    render(<MatchReviewTable {...defaultProps} />);
    expect(screen.getByText("high")).toBeDefined();
    expect(screen.getByText("medium")).toBeDefined();
  });

  it("shows reasoning text", () => {
    render(<MatchReviewTable {...defaultProps} />);
    expect(screen.getByText(/name match with high confidence/i)).toBeDefined();
  });

  // Stats
  it("shows stats counters", () => {
    render(<MatchReviewTable {...defaultProps} />);
    expect(screen.getByTestId("stat-total").textContent).toBe("3");
    expect(screen.getByTestId("stat-approved").textContent).toBe("0");
    expect(screen.getByTestId("stat-rejected").textContent).toBe("0");
  });

  it("shows updated stats with decisions", () => {
    const decisions: MatchDecisions = {
      approved: { "item-1": { manualNode: "Oncology", manualNodeId: "node-1", approvedAt: "2026-01-01" } },
      rejected: { "item-2": { rejectedAt: "2026-01-01" } },
      manual: {},
    };
    render(<MatchReviewTable {...defaultProps} decisions={decisions} />);
    expect(screen.getByTestId("stat-approved").textContent).toBe("1");
    expect(screen.getByTestId("stat-rejected").textContent).toBe("1");
  });

  // Actions for pending items
  it("shows Approve button for items with suggestions", () => {
    render(<MatchReviewTable {...defaultProps} />);
    const approveButtons = screen.getAllByText("Approve");
    expect(approveButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onApprove when Approve clicked", () => {
    const onApprove = vi.fn();
    render(<MatchReviewTable {...defaultProps} onApprove={onApprove} />);
    const approveButtons = screen.getAllByText("Approve");
    fireEvent.click(approveButtons[0]);
    expect(onApprove).toHaveBeenCalledWith(
      "item-1",
      "Oncology",
      "R&D / Oncology",
      "node-1"
    );
  });

  it("calls onReject when Reject clicked", () => {
    const onReject = vi.fn();
    render(<MatchReviewTable {...defaultProps} onReject={onReject} />);
    const rejectButtons = screen.getAllByText("Reject");
    fireEvent.click(rejectButtons[0]);
    expect(onReject).toHaveBeenCalledWith("item-1");
  });

  it("shows Pick Entity button for all pending items", () => {
    render(<MatchReviewTable {...defaultProps} />);
    const pickButtons = screen.getAllByText("Pick Entity");
    expect(pickButtons).toHaveLength(3);
  });

  it("calls onPickEntity when Pick Entity clicked", () => {
    const onPickEntity = vi.fn();
    render(<MatchReviewTable {...defaultProps} onPickEntity={onPickEntity} />);
    const pickButtons = screen.getAllByText("Pick Entity");
    fireEvent.click(pickButtons[0]);
    expect(onPickEntity).toHaveBeenCalledWith("item-1");
  });

  // Actions for decided items
  it("shows Reset button and status badge for approved items", () => {
    const decisions: MatchDecisions = {
      approved: { "item-1": { manualNode: "Oncology", manualNodeId: "node-1" } },
      rejected: {},
      manual: {},
    };
    render(<MatchReviewTable {...defaultProps} decisions={decisions} />);
    expect(screen.getByText("approved")).toBeDefined();
    expect(screen.getAllByText("Reset").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onReset when Reset clicked", () => {
    const onReset = vi.fn();
    const decisions: MatchDecisions = {
      approved: { "item-1": { manualNode: "Oncology", manualNodeId: "node-1" } },
      rejected: {},
      manual: {},
    };
    render(<MatchReviewTable {...defaultProps} decisions={decisions} onReset={onReset} />);
    fireEvent.click(screen.getAllByText("Reset")[0]);
    expect(onReset).toHaveBeenCalledWith("item-1");
  });

  // Filters
  it("filters by text search", () => {
    render(<MatchReviewTable {...defaultProps} />);
    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: "oncology" } });
    expect(screen.getByText(/oncology team/i)).toBeDefined();
    expect(screen.queryByText(/unknown team/i)).toBeNull();
  });

  it("filters by status", () => {
    const decisions: MatchDecisions = {
      approved: { "item-1": { manualNode: "Oncology", manualNodeId: "node-1" } },
      rejected: {},
      manual: {},
    };
    render(<MatchReviewTable {...defaultProps} decisions={decisions} />);
    const statusFilter = screen.getByDisplayValue("All Statuses");
    fireEvent.change(statusFilter, { target: { value: "approved" } });
    expect(screen.getByText(/oncology team/i)).toBeDefined();
    expect(screen.queryByText(/unknown team/i)).toBeNull();
  });

  it("shows empty state when no items match filters", () => {
    render(<MatchReviewTable {...defaultProps} />);
    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: "zzzzz" } });
    expect(screen.getByText(/no items match/i)).toBeDefined();
  });
});
