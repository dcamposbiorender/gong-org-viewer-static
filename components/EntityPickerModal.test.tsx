import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import EntityPickerModal from "./EntityPickerModal";
import type { EntityListItem } from "@/lib/match-helpers";

afterEach(() => cleanup());

const entities: EntityListItem[] = [
  { id: "e1", name: "Oncology", path: "Root / Oncology" },
  { id: "e2", name: "Cardiology", path: "Root / Cardiology" },
  { id: "e3", name: "Neurology", path: "Root / Neurology" },
];

describe("EntityPickerModal", () => {
  it("renders nothing when not open", () => {
    const { container } = render(
      <EntityPickerModal isOpen={false} entities={entities} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders all entities when open", () => {
    render(
      <EntityPickerModal isOpen={true} entities={entities} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText("Oncology")).toBeDefined();
    expect(screen.getByText("Cardiology")).toBeDefined();
    expect(screen.getByText("Neurology")).toBeDefined();
  });

  it("filters entities by search input", () => {
    render(
      <EntityPickerModal isOpen={true} entities={entities} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    const input = screen.getByPlaceholderText("Search entities...");
    fireEvent.change(input, { target: { value: "onc" } });
    expect(screen.getByText("Oncology")).toBeDefined();
    expect(screen.queryByText("Cardiology")).toBeNull();
  });

  it("calls onSelect with entity when clicked", () => {
    const onSelect = vi.fn();
    render(
      <EntityPickerModal isOpen={true} entities={entities} onSelect={onSelect} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByText("Cardiology"));
    expect(onSelect).toHaveBeenCalledWith(entities[1]);
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(
      <EntityPickerModal isOpen={true} entities={entities} onSelect={vi.fn()} onClose={onClose} />
    );
    const backdrop = screen.getByTestId("picker-backdrop");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(
      <EntityPickerModal isOpen={true} entities={entities} onSelect={vi.fn()} onClose={onClose} />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows no results message when search has no matches", () => {
    render(
      <EntityPickerModal isOpen={true} entities={entities} onSelect={vi.fn()} onClose={vi.fn()} />
    );
    const input = screen.getByPlaceholderText("Search entities...");
    fireEvent.change(input, { target: { value: "zzzzz" } });
    expect(screen.getByText(/no entities match/i)).toBeDefined();
  });
});
