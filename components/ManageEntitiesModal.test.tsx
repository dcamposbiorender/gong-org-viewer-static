import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ManageEntitiesModal from "./ManageEntitiesModal";
import type { EntityListItem } from "@/lib/match-helpers";
import type { WorkingTreeNode, EntityMerge } from "@/lib/types";

afterEach(() => cleanup());

const entities: EntityListItem[] = [
  { id: "root", name: "R&D", path: "R&D" },
  { id: "e1", name: "Oncology", path: "R&D / Oncology" },
  { id: "e2", name: "Cardiology", path: "R&D / Cardiology" },
  { id: "e3", name: "Neurology", path: "R&D / Neurology" },
];

const tree: WorkingTreeNode = {
  id: "root",
  name: "R&D",
  type: "group",
  children: [
    { id: "e1", name: "Oncology", type: "team", children: [{ id: "e1a", name: "Clinical", type: "team", children: [] }] },
    { id: "e2", name: "Cardiology", type: "team", children: [] },
    { id: "e3", name: "Neurology", type: "team", children: [] },
  ],
};

const defaultProps = {
  isOpen: true,
  entities,
  tree,
  merges: {} as Record<string, EntityMerge>,
  onClose: vi.fn(),
  onCreate: vi.fn(),
  onDelete: vi.fn(),
  onMerge: vi.fn(),
};

describe("ManageEntitiesModal", () => {
  it("renders nothing when not open", () => {
    const { container } = render(<ManageEntitiesModal {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders modal with Create tab by default", () => {
    render(<ManageEntitiesModal {...defaultProps} />);
    expect(screen.getByText("Create")).toBeDefined();
    expect(screen.getByText("Delete")).toBeDefined();
    expect(screen.getByText("Merge")).toBeDefined();
    // Create tab content
    expect(screen.getByPlaceholderText(/search parent/i)).toBeDefined();
  });

  it("switches to Delete tab", () => {
    render(<ManageEntitiesModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Delete"));
    expect(screen.getByPlaceholderText(/search to filter/i)).toBeDefined();
  });

  it("switches to Merge tab", () => {
    render(<ManageEntitiesModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Merge"));
    expect(screen.getByText(/entity a/i)).toBeDefined();
  });

  // Create tab
  it("shows parent search results when typing", () => {
    render(<ManageEntitiesModal {...defaultProps} />);
    const searchInput = screen.getByPlaceholderText(/search parent/i);
    fireEvent.change(searchInput, { target: { value: "onc" } });
    expect(screen.getByText("Oncology")).toBeDefined();
  });

  it("calls onCreate with parent and name", () => {
    const onCreate = vi.fn();
    render(<ManageEntitiesModal {...defaultProps} onCreate={onCreate} />);
    // Search and select parent
    const searchInput = screen.getByPlaceholderText(/search parent/i);
    fireEvent.change(searchInput, { target: { value: "onc" } });
    fireEvent.click(screen.getByText("Oncology"));
    // Enter name
    const nameInput = screen.getByPlaceholderText(/entity name/i);
    fireEvent.change(nameInput, { target: { value: "New Team" } });
    // Create
    fireEvent.click(screen.getByText(/create entity/i));
    expect(onCreate).toHaveBeenCalledWith("e1", "New Team");
  });

  it("prevents create without parent selected", () => {
    const onCreate = vi.fn();
    render(<ManageEntitiesModal {...defaultProps} onCreate={onCreate} />);
    const nameInput = screen.getByPlaceholderText(/entity name/i);
    fireEvent.change(nameInput, { target: { value: "New Team" } });
    fireEvent.click(screen.getByText(/create entity/i));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("prevents create without name", () => {
    const onCreate = vi.fn();
    render(<ManageEntitiesModal {...defaultProps} onCreate={onCreate} />);
    const searchInput = screen.getByPlaceholderText(/search parent/i);
    fireEvent.change(searchInput, { target: { value: "onc" } });
    fireEvent.click(screen.getByText("Oncology"));
    fireEvent.click(screen.getByText(/create entity/i));
    expect(onCreate).not.toHaveBeenCalled();
  });

  // Delete tab
  it("lists entities in delete tab with child count", () => {
    render(<ManageEntitiesModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Delete"));
    expect(screen.getByText("Oncology")).toBeDefined();
    // Oncology has 1 child
    expect(screen.getByText(/1 child/i)).toBeDefined();
  });

  it("shows confirmation and calls onDelete", () => {
    const onDelete = vi.fn();
    render(<ManageEntitiesModal {...defaultProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByText("Delete"));
    // Click on Cardiology (no children)
    fireEvent.click(screen.getByText("Cardiology"));
    // Confirm
    fireEvent.click(screen.getByText(/confirm delete/i));
    expect(onDelete).toHaveBeenCalledWith("e2");
  });

  // Merge tab
  it("validates self-merge", () => {
    render(<ManageEntitiesModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Merge"));
    // Select entity A
    const searchA = screen.getByPlaceholderText(/search entity a/i);
    fireEvent.change(searchA, { target: { value: "onc" } });
    fireEvent.click(screen.getByText("Oncology"));
    // Select entity B = same (need to click the one in dropdown, not selected display)
    const searchB = screen.getByPlaceholderText(/search entity b/i);
    fireEvent.change(searchB, { target: { value: "onc" } });
    // Multiple "Oncology" text on page — get the one in the dropdown list
    const oncologyItems = screen.getAllByText("Oncology");
    // Click the last one (in the B dropdown)
    fireEvent.click(oncologyItems[oncologyItems.length - 1]);
    expect(screen.getByText(/cannot merge.*itself/i)).toBeDefined();
  });

  it("validates already-absorbed entity", () => {
    const merges = { "e1": { absorbed: ["e2"], mergedAt: "2026-01-01" } };
    render(<ManageEntitiesModal {...defaultProps} merges={merges} />);
    fireEvent.click(screen.getByText("Merge"));
    const searchA = screen.getByPlaceholderText(/search entity a/i);
    fireEvent.change(searchA, { target: { value: "card" } });
    fireEvent.click(screen.getByText("Cardiology"));
    const searchB = screen.getByPlaceholderText(/search entity b/i);
    fireEvent.change(searchB, { target: { value: "neuro" } });
    fireEvent.click(screen.getByText("Neurology"));
    expect(screen.getByText(/already absorbed/i)).toBeDefined();
  });

  it("calls onMerge with valid selection", () => {
    const onMerge = vi.fn();
    render(<ManageEntitiesModal {...defaultProps} onMerge={onMerge} />);
    fireEvent.click(screen.getByText("Merge"));
    const searchA = screen.getByPlaceholderText(/search entity a/i);
    fireEvent.change(searchA, { target: { value: "onc" } });
    fireEvent.click(screen.getByText("Oncology"));
    const searchB = screen.getByPlaceholderText(/search entity b/i);
    fireEvent.change(searchB, { target: { value: "card" } });
    fireEvent.click(screen.getByText("Cardiology"));
    fireEvent.click(screen.getByText(/confirm merge/i));
    expect(onMerge).toHaveBeenCalledWith("e2", "e1");
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(<ManageEntitiesModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText("\u00D7"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
