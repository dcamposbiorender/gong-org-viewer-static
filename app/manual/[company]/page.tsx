"use client";

import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  VALID_ACCOUNTS,
  type CompanyData,
  type ValidAccount,
  type MatchReviewCompany,
  type WorkingTreeNode,
  type Snippet,
} from "@/lib/types";
import { useKVState } from "@/lib/use-kv-state";
import { useMatchReview } from "@/lib/use-match-review";
import { buildWorkingTree } from "@/lib/build-working-tree";
import { buildEntityList, type EntityListItem } from "@/lib/match-helpers";
import {
  findNodeById,
  findNodeParent,
  countNodes,
  getSizeOverrideKey,
} from "@/lib/tree-ops";
import TreeView from "@/components/TreeView";
import TableView from "@/components/TableView";
import EvidencePanel from "@/components/EvidencePanel";
import SnippetContextModal from "@/components/SnippetContextModal";
import ManageEntitiesModal from "@/components/ManageEntitiesModal";
import { setRefreshHandler } from "@/lib/refresh-store";
import { useToast } from "@/components/Toast";

export default function ManualMapPage() {
  const params = useParams<{ company: string }>();
  const company = params.company;

  if (!VALID_ACCOUNTS.includes(company as ValidAccount)) {
    notFound();
  }

  const { state, loading: kvLoading, refreshing, save, isDraggingRef, refresh } = useKVState(company);
  const { showToast } = useToast();
  const { decisions, loading: mrLoading } = useMatchReview(company);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [reviewData, setReviewData] = useState<MatchReviewCompany | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [contextSnippet, setContextSnippet] = useState<Snippet | null>(null);
  const [manageEntitiesOpen, setManageEntitiesOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"tree" | "table">("tree");
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);

  // Load bundled JSON data
  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    Promise.all([
      fetch(`/data/${company}/manual.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/data/${company}/match-review.json`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([manual, review]) => {
      if (!cancelled) {
        setCompanyData(manual);
        setReviewData(review);
        setDataLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setDataLoading(false);
    });
    return () => { cancelled = true; };
  }, [company]);

  // Reset selection on company change
  useEffect(() => {
    setSelectedNodeId(null);
  }, [company]);

  const loading = kvLoading || dataLoading || mrLoading;

  // Build working tree
  const workingTree = useMemo(() => {
    if (!companyData) return null;
    return buildWorkingTree(
      companyData.root,
      state.manualMapOverrides,
      state.manualMapModifications,
      state.merges,
      state.fieldEdits
    );
  }, [companyData, state.manualMapOverrides, state.manualMapModifications, state.merges, state.fieldEdits]);

  // Build entity list for modals
  const entityList = useMemo<EntityListItem[]>(() => {
    if (!workingTree) return [];
    return buildEntityList(workingTree, state.fieldEdits);
  }, [workingTree, state.fieldEdits]);

  // Review items
  const reviewItems = useMemo(() => reviewData?.items || [], [reviewData]);

  // Find selected node in working tree
  const selectedNode = useMemo(() => {
    if (!workingTree || !selectedNodeId) return null;
    return findNodeById(workingTree, selectedNodeId) as WorkingTreeNode | null;
  }, [workingTree, selectedNodeId]);

  // --- Callbacks ---

  const handleSelect = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleDrop = useCallback(
    (draggedId: string, targetId: string) => {
      if (!workingTree) return;
      const draggedNode = findNodeById(workingTree, draggedId);
      const originalParent = findNodeParent(workingTree, draggedId);
      if (!draggedNode || !originalParent) return;

      const targetNode = findNodeById(workingTree, targetId);
      const override = {
        originalParent: originalParent.id,
        newParent: targetId,
        newParentName: targetNode?.name || targetId,
        movedAt: new Date().toISOString().split("T")[0],
      };

      save("manual-map-overrides", { nodeId: draggedId, override });
    },
    [workingTree, save]
  );

  const handleFieldEdit = useCallback(
    (nodeId: string, edits: { name?: string; leaderName?: string; leaderTitle?: string }) => {
      if (!workingTree) return;
      const node = findNodeById(workingTree, nodeId);
      if (!node) return;

      const edit: Record<string, unknown> = {};
      const originalName = node.name;
      const originalLeaderName = node.leader?.name || "";
      const originalLeaderTitle = node.leader?.title || "";

      if (edits.name && edits.name !== originalName) {
        edit.name = { original: originalName, edited: edits.name };
      }
      if (edits.leaderName !== undefined && edits.leaderName !== originalLeaderName) {
        edit.leaderName = { original: originalLeaderName, edited: edits.leaderName };
      }
      if (edits.leaderTitle !== undefined && edits.leaderTitle !== originalLeaderTitle) {
        edit.leaderTitle = { original: originalLeaderTitle, edited: edits.leaderTitle };
      }

      if (Object.keys(edit).length > 0) {
        edit.savedAt = new Date().toISOString();
        save("field-edits", { entityId: nodeId, edit });
      }
    },
    [workingTree, save]
  );

  const handleSizeChipClick = useCallback(
    (nodeId: string, sizeIdx: number) => {
      const key = getSizeOverrideKey(company, nodeId);
      save("sizes", {
        key,
        override: { selectedSizeIndex: sizeIdx, updatedAt: new Date().toISOString() },
      });
    },
    [company, save]
  );

  const handleCustomSizeChange = useCallback(
    (nodeId: string, value: string) => {
      const key = getSizeOverrideKey(company, nodeId);
      save("sizes", {
        key,
        override: { customValue: value || null, updatedAt: new Date().toISOString() },
      });
    },
    [company, save]
  );

  const handleClearSize = useCallback(
    (nodeId: string) => {
      const key = getSizeOverrideKey(company, nodeId);
      save("sizes", {
        key,
        override: { selectedSizeIndex: null, customValue: null, updatedAt: new Date().toISOString() },
      });
    },
    [company, save]
  );

  const handleRefresh = useCallback(async () => {
    // Re-fetch both JSON data files AND KV state
    const [manual, review] = await Promise.all([
      fetch(`/data/${company}/manual.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/data/${company}/match-review.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      refresh(),
    ]);
    if (manual) setCompanyData(manual);
    if (review) setReviewData(review);
    showToast("Data refreshed", "success");
  }, [company, refresh, showToast]);

  const handleContextClick = useCallback((snippet: Snippet) => {
    setContextSnippet(snippet);
  }, []);

  const handleAddChild = useCallback(
    (parentId: string) => {
      const name = prompt("Enter name for new entity:");
      if (!name?.trim()) return;

      const newId = `manual-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const currentMods = state.manualMapModifications || { added: [], deleted: [] };
      const added = Array.isArray(currentMods.added) ? currentMods.added : [];
      const deleted = Array.isArray(currentMods.deleted) ? currentMods.deleted : [];
      const updatedMods = {
        added: [...added, { id: newId, name: name.trim(), parentId, addedAt: new Date().toISOString() }],
        deleted: [...deleted],
      };
      save("manual-map-modifications", { modifications: updatedMods });
    },
    [state.manualMapModifications, save]
  );

  const handleDeleteEntity = useCallback(
    async (nodeId: string) => {
      if (!workingTree) return;
      const node = findNodeById(workingTree, nodeId) as WorkingTreeNode | null;
      if (!node) return;

      const childCount = countNodes(node) - 1;
      let message = `Are you sure you want to delete "${node.displayName || node.name}"?`;
      if (childCount > 0) message += `\n\nThis will also delete ${childCount} child entities.`;

      if (!confirm(message)) return;

      const currentMods = state.manualMapModifications || { added: [], deleted: [] };
      const added = Array.isArray(currentMods.added) ? currentMods.added : [];
      const deleted = Array.isArray(currentMods.deleted) ? currentMods.deleted : [];
      const updatedMods = {
        added: [...added],
        deleted: [...deleted, { id: nodeId, deletedAt: new Date().toISOString() }],
      };
      await save("manual-map-modifications", { modifications: updatedMods });
      setSelectedNodeId(null);
    },
    [workingTree, state.manualMapModifications, save]
  );

  const handleCreateEntity = useCallback(
    (parentId: string, name: string) => {
      const newId = `manual-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const currentMods = state.manualMapModifications || { added: [], deleted: [] };
      const added = Array.isArray(currentMods.added) ? currentMods.added : [];
      const deleted = Array.isArray(currentMods.deleted) ? currentMods.deleted : [];
      const updatedMods = {
        added: [...added, { id: newId, name, parentId, addedAt: new Date().toISOString() }],
        deleted: [...deleted],
      };
      save("manual-map-modifications", { modifications: updatedMods });
    },
    [state.manualMapModifications, save]
  );

  const handleMerge = useCallback(
    async (canonicalId: string, absorbedId: string) => {
      const existingMerge = state.merges[canonicalId];
      const absorbed = [...(existingMerge?.absorbed || []), absorbedId];
      await save("merges", {
        canonicalId,
        merge: { absorbed, mergedAt: new Date().toISOString() },
      });
      showToast("Merge saved", "success");
    },
    [state.merges, save, showToast]
  );

  // Sync refresh handler to external store (read by Header across layout boundary)
  useEffect(() => {
    setRefreshHandler(handleRefresh, refreshing);
    return () => setRefreshHandler(null, false);
  }, [handleRefresh, refreshing]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading {company}...
      </div>
    );
  }

  if (!companyData || !workingTree) {
    return (
      <p className="text-gray-500">No manual map data available for {company}.</p>
    );
  }

  const stats = companyData.stats;
  const matchRate = stats.entities > 0 ? Math.round((stats.matched / stats.entities) * 100) : 0;

  return (
    <>
      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-4 text-sm bg-[#f8f7f5] rounded px-3 py-2">
        <h2 className="text-xl font-semibold text-gray-900">{companyData.company}</h2>
        <span><strong>{stats.entities}</strong> entities</span>
        <span className="text-green-600">
          <strong>{stats.matched}</strong> matched ({matchRate}%)
        </span>
        <span className="text-indigo-600">
          <strong>{stats.snippets}</strong> snippets
        </span>

        {/* Tree/Table toggle */}
        <div className="flex gap-0.5 ml-4 border border-gray-300 rounded overflow-hidden">
          <button
            onClick={() => setViewMode("tree")}
            className={`px-3 py-1 text-xs font-medium ${
              viewMode === "tree" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            Tree
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`px-3 py-1 text-xs font-medium ${
              viewMode === "table" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            Table
          </button>
        </div>

        <button
          onClick={() => setManageEntitiesOpen(true)}
          className="ml-auto px-3 py-1.5 text-xs bg-gray-100 border border-gray-300 rounded hover:bg-gray-200"
        >
          Manage Entities
        </button>
      </div>

      {/* Main layout: Content on top, Evidence at bottom */}
      <div className="flex flex-col" style={{ height: "calc(100vh - 140px)" }}>
        {/* Tree or Table View — takes remaining space */}
        <div className="flex-1 overflow-auto border border-[#ddd] rounded-t-lg p-4 bg-white min-h-0">
          {viewMode === "tree" ? (
            <TreeView
              companyData={companyData}
              company={company}
              state={state}
              decisions={decisions}
              reviewItems={reviewItems}
              selectedNodeId={selectedNodeId}
              onSelect={handleSelect}
              onDrop={handleDrop}
              onFieldEdit={handleFieldEdit}
              isDraggingRef={isDraggingRef}
            />
          ) : (
            <TableView
              tree={workingTree}
              company={company}
              state={state}
              decisions={decisions}
              reviewItems={reviewItems}
              selectedNodeId={selectedNodeId}
              onSelect={handleSelect}
            />
          )}
        </div>

        {/* Evidence Panel — bottom drawer */}
        <div
          className="border border-[#ddd] border-t-0 rounded-b-lg bg-[#faf9f7] overflow-hidden shrink-0"
          style={{ height: evidenceExpanded ? "300px" : "180px", transition: "height 0.2s" }}
        >
          <div
            className="flex items-center justify-between px-4 py-2 bg-[#f8f7f5] border-t border-[#ddd] cursor-pointer"
            onClick={() => setEvidenceExpanded(!evidenceExpanded)}
          >
            <span className="font-medium text-sm text-gray-700">
              Source Evidence
              {selectedNode && (
                <span className="text-gray-400 ml-2 font-normal">
                  — {selectedNode.displayName || selectedNode.name}
                </span>
              )}
            </span>
            <span className="text-xs text-gray-500">
              {evidenceExpanded ? "\u25BC collapse" : "\u25B2 expand"}
            </span>
          </div>
          <div className="overflow-auto" style={{ height: "calc(100% - 33px)" }}>
            <EvidencePanel
              node={selectedNode}
              company={company}
              state={state}
              decisions={decisions}
              reviewItems={reviewItems}
              root={workingTree}
              onSizeChipClick={handleSizeChipClick}
              onCustomSizeChange={handleCustomSizeChange}
              onClearSize={handleClearSize}
              onContextClick={handleContextClick}
              onAddChild={handleAddChild}
              onDeleteEntity={handleDeleteEntity}
            />
          </div>
        </div>
      </div>

      {/* Modals */}
      <SnippetContextModal
        snippet={contextSnippet}
        onClose={() => setContextSnippet(null)}
      />

      <ManageEntitiesModal
        isOpen={manageEntitiesOpen}
        entities={entityList}
        tree={workingTree}
        merges={state.merges}
        onClose={() => setManageEntitiesOpen(false)}
        onCreate={handleCreateEntity}
        onDelete={handleDeleteEntity}
        onMerge={handleMerge}
      />

    </>
  );
}
