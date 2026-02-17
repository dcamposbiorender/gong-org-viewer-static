import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import EvidencePanel from "./EvidencePanel";
import type { WorkingTreeNode, OrgState, MatchReviewItem } from "@/lib/types";
import { EMPTY_STATE } from "@/lib/types";
import { EMPTY_DECISIONS, type MatchDecisions } from "@/lib/match-helpers";

afterEach(() => cleanup());

function makeNode(overrides: Partial<WorkingTreeNode> = {}): WorkingTreeNode {
  return {
    id: "node-1",
    name: "Oncology",
    type: "department",
    children: [],
    gongEvidence: {
      snippets: [
        {
          quote: "We have 50 people",
          date: "2025-12-01",
          gongUrl: "https://gong.io/call/1",
          contextBefore: "before context",
        },
      ],
      sizeMentions: [{ value: "50", source: { callDate: "2025-12-01", customerName: "Jane" } }],
      matchedContacts: [
        { name: "Dr. Smith", title: "VP Oncology", isDecisionMaker: true },
        { name: "Jane Doe", title: "Director" },
      ],
      matchedEntities: [],
      totalMentions: 5,
      confidence: "high",
      status: "supported",
    },
    sites: ["Cambridge", "Boston"],
    ...overrides,
  };
}

const root: WorkingTreeNode = { ...makeNode(), children: [makeNode({ id: "child-1", name: "Child" })] };

const defaultProps = {
  company: "astrazeneca",
  state: EMPTY_STATE,
  decisions: EMPTY_DECISIONS,
  reviewItems: [] as MatchReviewItem[],
  root,
  onSizeChipClick: vi.fn(),
  onCustomSizeChange: vi.fn(),
  onClearSize: vi.fn(),
  onContextClick: vi.fn(),
  onAddChild: vi.fn(),
  onDeleteEntity: vi.fn(),
};

describe("EvidencePanel", () => {
  it("shows placeholder when no node selected", () => {
    render(<EvidencePanel {...defaultProps} node={null} />);
    expect(screen.getByText(/select a node/i)).toBeDefined();
  });

  it("renders entity name and type", () => {
    render(<EvidencePanel {...defaultProps} node={makeNode()} />);
    expect(screen.getByText("Oncology")).toBeDefined();
    expect(screen.getByText("department")).toBeDefined();
  });

  it("renders evidence status badge", () => {
    render(<EvidencePanel {...defaultProps} node={makeNode()} />);
    expect(screen.getByText("supported")).toBeDefined();
  });

  it("renders matched contacts with Decision Maker badge", () => {
    render(<EvidencePanel {...defaultProps} node={makeNode()} />);
    expect(screen.getByText("Dr. Smith")).toBeDefined();
    expect(screen.getByText(/DM/)).toBeDefined();
    expect(screen.getByText("Jane Doe")).toBeDefined();
  });

  it("renders snippet cards with Gong links", () => {
    render(<EvidencePanel {...defaultProps} node={makeNode()} />);
    expect(screen.getByText(/we have 50 people/i)).toBeDefined();
    const gongLink = screen.getByText(/gong/i);
    expect(gongLink.closest("a")?.getAttribute("href")).toBe("https://gong.io/call/1");
  });

  it("renders size chips", () => {
    render(<EvidencePanel {...defaultProps} node={makeNode()} />);
    expect(screen.getByText("50")).toBeDefined();
  });

  it("calls onSizeChipClick when chip clicked", () => {
    const onSizeChipClick = vi.fn();
    render(<EvidencePanel {...defaultProps} node={makeNode()} onSizeChipClick={onSizeChipClick} />);
    fireEvent.click(screen.getByText("50"));
    expect(onSizeChipClick).toHaveBeenCalledWith("node-1", 0);
  });

  it("renders Add Child button and calls callback", () => {
    const onAddChild = vi.fn();
    render(<EvidencePanel {...defaultProps} node={makeNode()} onAddChild={onAddChild} />);
    const btn = screen.getByText(/add child/i);
    fireEvent.click(btn);
    expect(onAddChild).toHaveBeenCalledWith("node-1");
  });

  it("renders Delete button for non-root nodes", () => {
    const childNode = makeNode({ id: "child-1", name: "Child" });
    render(<EvidencePanel {...defaultProps} node={childNode} />);
    expect(screen.getByText(/delete/i)).toBeDefined();
  });

  it("hides Delete button for root node", () => {
    render(<EvidencePanel {...defaultProps} node={root} />);
    expect(screen.queryByText(/^delete$/i)).toBeNull();
  });

  it("renders context button for snippets with context", () => {
    const onContextClick = vi.fn();
    render(<EvidencePanel {...defaultProps} node={makeNode()} onContextClick={onContextClick} />);
    const ctxBtn = screen.getByTitle(/view context/i);
    fireEvent.click(ctxBtn);
    // Now passes the actual snippet object instead of (idx, evidence)
    expect(onContextClick).toHaveBeenCalledWith(
      expect.objectContaining({ quote: "We have 50 people" })
    );
  });

  it("renders sites", () => {
    render(<EvidencePanel {...defaultProps} node={makeNode()} />);
    expect(screen.getByText(/cambridge/i)).toBeDefined();
    expect(screen.getByText(/boston/i)).toBeDefined();
  });

  it("shows team size input", () => {
    render(<EvidencePanel {...defaultProps} node={makeNode()} />);
    const input = screen.getByPlaceholderText("—");
    expect(input).toBeDefined();
  });

  it("renders empty snippet message when no snippets", () => {
    const emptyNode = makeNode({
      gongEvidence: {
        snippets: [],
        sizeMentions: [],
        matchedContacts: [],
        totalMentions: 0,
        confidence: "none",
        status: "unverified",
      },
    });
    render(<EvidencePanel {...defaultProps} node={emptyNode} />);
    expect(screen.getByText(/no gong snippets/i)).toBeDefined();
  });
});
