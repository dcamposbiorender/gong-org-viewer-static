import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SnippetContextModal from "./SnippetContextModal";
import type { Snippet } from "@/lib/types";

afterEach(() => cleanup());

const snippet: Snippet = {
  quote: "About 50 people on the oncology team.",
  date: "2025-12-01",
  gongUrl: "https://app.gong.io/call?id=123",
  callTitle: "Q4 Review Call",
  contextBefore: "[Speaker 1] How big is the team?",
  contextAfter: "[Speaker 2] That sounds right.",
  customerName: "Jane Doe",
  internalName: "Alice Smith",
  speakerId: "1",
};

describe("SnippetContextModal", () => {
  it("renders nothing when snippet is null", () => {
    const { container } = render(
      <SnippetContextModal snippet={null} onClose={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders call title and date", () => {
    render(<SnippetContextModal snippet={snippet} onClose={vi.fn()} />);
    expect(screen.getByText("Q4 Review Call")).toBeDefined();
    expect(screen.getByText(/2025-12-01/)).toBeDefined();
  });

  it("renders highlighted quote", () => {
    render(<SnippetContextModal snippet={snippet} onClose={vi.fn()} />);
    expect(screen.getByText(snippet.quote)).toBeDefined();
  });

  it("renders context before and after", () => {
    render(<SnippetContextModal snippet={snippet} onClose={vi.fn()} />);
    const body = document.querySelector("[data-testid='context-body']");
    expect(body?.textContent).toContain("How big is the team?");
    expect(body?.textContent).toContain("That sounds right.");
  });

  it("renders Gong link when gongUrl present", () => {
    render(<SnippetContextModal snippet={snippet} onClose={vi.fn()} />);
    const link = screen.getByText(/open in gong/i);
    expect(link.closest("a")?.getAttribute("href")).toBe(
      "https://app.gong.io/call?id=123"
    );
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(<SnippetContextModal snippet={snippet} onClose={onClose} />);
    const backdrop = screen.getByTestId("modal-backdrop");
    // Click the backdrop directly (not a child)
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(<SnippetContextModal snippet={snippet} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
