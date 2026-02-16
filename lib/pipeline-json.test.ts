import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { VALID_ACCOUNTS } from "./types";
import type { CompanyData, MatchReviewCompany } from "./types";

const DATA_DIR = join(__dirname, "..", "public", "data");

describe("pipeline JSON output", () => {
  for (const company of VALID_ACCOUNTS) {
    describe(company, () => {
      it("has manual.json with valid structure", () => {
        const path = join(DATA_DIR, company, "manual.json");
        expect(existsSync(path)).toBe(true);

        const raw = readFileSync(path, "utf-8");
        const data: CompanyData = JSON.parse(raw);

        expect(data.company).toBeTruthy();
        expect(data.source).toBeTruthy();
        expect(data.stats).toBeDefined();
        expect(data.stats.entities).toBeGreaterThan(0);
        expect(data.root).toBeDefined();
        expect(data.root.id).toBeTruthy();
        expect(data.root.name).toBeTruthy();
        expect(Array.isArray(data.root.children)).toBe(true);
      });

      it("has match-review.json with valid structure", () => {
        const path = join(DATA_DIR, company, "match-review.json");
        expect(existsSync(path)).toBe(true);

        const raw = readFileSync(path, "utf-8");
        const data: MatchReviewCompany & { generated: string } =
          JSON.parse(raw);

        expect(data.generated).toBeTruthy();
        expect(typeof data.total_unmatched).toBe("number");
        expect(Array.isArray(data.items)).toBe(true);
      });
    });
  }
});
