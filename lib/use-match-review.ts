"use client";

import { useState, useEffect, useCallback } from "react";
import type { MatchDecisions } from "./match-helpers";
import { EMPTY_DECISIONS } from "./match-helpers";

async function fetchDecisions(company: string): Promise<MatchDecisions> {
  try {
    const res = await fetch(`/api/match-review?account=${company}`);
    if (!res.ok) return EMPTY_DECISIONS;
    return res.json();
  } catch {
    return EMPTY_DECISIONS;
  }
}

async function postDecision(
  company: string,
  itemId: string,
  decision: Record<string, unknown>,
  category: "approved" | "rejected" | "manual"
): Promise<boolean> {
  try {
    const res = await fetch(`/api/match-review?account=${company}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, decision, category }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function deleteDecision(
  company: string,
  itemId: string
): Promise<boolean> {
  try {
    const res = await fetch(`/api/match-review?account=${company}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function useMatchReview(company: string) {
  const [decisions, setDecisions] = useState<MatchDecisions>(EMPTY_DECISIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDecisions(company).then((data) => {
      if (!cancelled) {
        setDecisions(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [company]);

  const approve = useCallback(
    (itemId: string, manualNode: string, manualPath: string, manualNodeId: string) => {
      const decision = {
        manualNode,
        manualNodeId,
        manualPath,
        approvedAt: new Date().toISOString(),
      };
      setDecisions((prev) => {
        const next = {
          approved: { ...prev.approved },
          rejected: { ...prev.rejected },
          manual: { ...prev.manual },
        };
        delete next.rejected[itemId];
        delete next.manual[itemId];
        next.approved[itemId] = decision;
        return next;
      });
      postDecision(company, itemId, decision, "approved");
    },
    [company]
  );

  const reject = useCallback(
    (itemId: string) => {
      const decision = { rejectedAt: new Date().toISOString(), manualNode: "", manualNodeId: "" };
      setDecisions((prev) => {
        const next = {
          approved: { ...prev.approved },
          rejected: { ...prev.rejected },
          manual: { ...prev.manual },
        };
        delete next.approved[itemId];
        delete next.manual[itemId];
        next.rejected[itemId] = decision;
        return next;
      });
      postDecision(company, itemId, decision, "rejected");
    },
    [company]
  );

  const manualMatch = useCallback(
    (itemId: string, manualNode: string, manualPath: string, manualNodeId: string) => {
      const decision = {
        manualNode,
        manualNodeId,
        manualPath,
        matchedAt: new Date().toISOString(),
      };
      setDecisions((prev) => {
        const next = {
          approved: { ...prev.approved },
          rejected: { ...prev.rejected },
          manual: { ...prev.manual },
        };
        delete next.approved[itemId];
        delete next.rejected[itemId];
        next.manual[itemId] = decision;
        return next;
      });
      postDecision(company, itemId, decision, "manual");
    },
    [company]
  );

  const reset = useCallback(
    (itemId: string) => {
      setDecisions((prev) => {
        const next = {
          approved: { ...prev.approved },
          rejected: { ...prev.rejected },
          manual: { ...prev.manual },
        };
        delete next.approved[itemId];
        delete next.rejected[itemId];
        delete next.manual[itemId];
        return next;
      });
      deleteDecision(company, itemId);
    },
    [company]
  );

  return { decisions, loading, approve, reject, manualMatch, reset };
}
