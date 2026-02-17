"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { OrgState, StateType } from "./types";
import { EMPTY_STATE } from "./types";
import { useToast } from "@/components/Toast";

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

/** Map state type to the body field name used as the entity key (mirrors route.ts). */
function getKeyField(type: StateType): string {
  switch (type) {
    case "corrections":
    case "field-edits":
      return "entityId";
    case "sizes":
    case "resolutions":
      return "key";
    case "merges":
      return "canonicalId";
    case "manual-map-overrides":
      return "nodeId";
    default:
      return "entityId";
  }
}

/** Map state type to the body field name containing the value object (mirrors route.ts). */
function getValueField(type: StateType): string | null {
  switch (type) {
    case "corrections":
      return "override";
    case "field-edits":
      return "edit";
    case "sizes":
      return "override";
    case "merges":
      return "merge";
    case "manual-map-overrides":
      return "override";
    case "resolutions":
      return null;
    default:
      return null;
  }
}

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

export function useKVState(company: string) {
  const { showToast } = useToast();
  const [state, setState] = useState<OrgState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
        showToast("Data updated by another user — refreshing...");
        const data = await fetchAllOrgState(company);
        setState(data);
      }
      lastVersionRef.current = version;
    }, 10_000);
    return () => clearInterval(interval);
  }, [company, showToast]);

  // Apply-and-save mutation with optimistic updates for all state types
  const save = useCallback(
    async (type: StateType, body: Record<string, unknown>) => {
      // Optimistically update local state
      setState((prev) => {
        const key = TYPE_TO_KEY[type];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const next: any = { ...prev };

        if (type === "graduated-map") {
          next[key] = body.map;
        } else if (type === "manual-map-modifications") {
          next[key] = body.modifications;
        } else {
          // Key-value merge types: field-edits, sizes, merges, manual-map-overrides, corrections, resolutions
          const keyFieldName = getKeyField(type);
          const valueFieldName = getValueField(type);
          const entityKey = body[keyFieldName] as string;
          if (entityKey) {
            const existing = { ...(next[key] || {}) };
            if (valueFieldName && body[valueFieldName] != null) {
              existing[entityKey] = body[valueFieldName];
            } else {
              // For resolutions: the body itself (minus the key field) is the value
              const { [keyFieldName]: _, ...rest } = body;
              existing[entityKey] = rest;
            }
            next[key] = existing;
          }
        }
        return next as OrgState;
      });

      const ok = await postOrgState(company, type, body);
      if (!ok) {
        showToast("Save failed — change applied locally but not synced", "error");
      } else {
        // Eagerly refetch to confirm server state
        const confirmed = await fetchAllOrgState(company);
        setState(confirmed);
      }
    },
    [company, showToast]
  );

  // Delete mutation
  const remove = useCallback(
    async (type: StateType, body: Record<string, unknown>) => {
      const ok = await deleteOrgState(company, type, body);
      if (!ok) {
        showToast("Delete failed — not synced", "error");
        return;
      }
      // Refresh state from server after delete
      const data = await fetchAllOrgState(company);
      setState(data);
    },
    [company, showToast]
  );

  // Manual refresh — force full state reload from server
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchAllOrgState(company);
      setState(data);
    } finally {
      setRefreshing(false);
    }
  }, [company]);

  return { state, loading, refreshing, save, remove, isDraggingRef, refresh };
}
