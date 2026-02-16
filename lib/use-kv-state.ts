"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { OrgState, StateType } from "./types";
import { EMPTY_STATE } from "./types";

const STATE_TYPES: StateType[] = [
  "corrections",
  "field-edits",
  "sizes",
  "merges",
  "graduated-map",
  "manual-map-overrides",
  "manual-map-modifications",
  "resolutions",
];

// Map StateType (kebab-case) to OrgState key (camelCase)
const TYPE_TO_KEY: Record<StateType, keyof OrgState> = {
  "corrections": "corrections",
  "field-edits": "fieldEdits",
  "sizes": "sizes",
  "merges": "merges",
  "graduated-map": "graduatedMap",
  "manual-map-overrides": "manualMapOverrides",
  "manual-map-modifications": "manualMapModifications",
  "resolutions": "resolutions",
};

async function fetchAllOrgState(company: string): Promise<OrgState> {
  const results = await Promise.all(
    STATE_TYPES.map(async (type) => {
      try {
        const res = await fetch(
          `/api/org-state?account=${company}&type=${type}`
        );
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    })
  );

  const state: OrgState = { ...EMPTY_STATE };
  STATE_TYPES.forEach((type, i) => {
    const key = TYPE_TO_KEY[type];
    if (results[i] != null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state as any)[key] = results[i];
    }
  });
  return state;
}

async function fetchSyncVersion(company: string): Promise<string> {
  try {
    const res = await fetch(`/api/sync-version?account=${company}`);
    if (!res.ok) return "";
    const { version } = await res.json();
    return version || "";
  } catch {
    return "";
  }
}

async function postOrgState(
  company: string,
  type: StateType,
  body: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/org-state?account=${company}&type=${type}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function deleteOrgState(
  company: string,
  type: StateType,
  body: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/org-state?account=${company}&type=${type}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

function showToast(message: string) {
  // Simple toast — 20-line custom implementation deferred to Phase 4.
  // For now, console.warn so it's visible in devtools.
  console.warn(`[Toast] ${message}`);
}

export function useKVState(company: string) {
  const [state, setState] = useState<OrgState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const lastVersionRef = useRef<string>("");
  const isDraggingRef = useRef(false);

  // Load all KV state on company change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAllOrgState(company).then((data) => {
      if (!cancelled) {
        setState(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [company]);

  // 10-second sync polling
  useEffect(() => {
    const interval = setInterval(async () => {
      if (document.hidden || isDraggingRef.current) return;
      const version = await fetchSyncVersion(company);
      if (version && version !== lastVersionRef.current && lastVersionRef.current !== "") {
        const data = await fetchAllOrgState(company);
        setState(data);
      }
      lastVersionRef.current = version;
    }, 10_000);
    return () => clearInterval(interval);
  }, [company]);

  // Apply-and-save mutation (no rollback)
  const save = useCallback(
    async (type: StateType, body: Record<string, unknown>) => {
      // Optimistically update local state
      setState((prev) => {
        const key = TYPE_TO_KEY[type];
        const next = { ...prev };
        // For full-replacement types, set directly
        if (type === "graduated-map" || type === "manual-map-modifications") {
          const value = type === "graduated-map" ? body.map : body.modifications;
          (next as Record<string, unknown>)[key] = value;
        }
        // For key-value types, we don't have enough info to merge locally
        // without duplicating server logic — just keep current state.
        // The sync poll will pick up the change within 10s.
        return next;
      });
      const ok = await postOrgState(company, type, body);
      if (!ok) showToast("Save failed — change applied locally but not synced");
    },
    [company]
  );

  // Delete mutation
  const remove = useCallback(
    async (type: StateType, body: Record<string, unknown>) => {
      const ok = await deleteOrgState(company, type, body);
      if (!ok) {
        showToast("Delete failed — not synced");
        return;
      }
      // Refresh state from server after delete
      const data = await fetchAllOrgState(company);
      setState(data);
    },
    [company]
  );

  return { state, loading, save, remove, isDraggingRef };
}
