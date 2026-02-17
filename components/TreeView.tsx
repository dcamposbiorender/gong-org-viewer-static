"use client";

import { useMemo, useState, useRef, useCallback } from "react";
import type {
  CompanyData,
  OrgState,
  WorkingTreeNode,
  MatchReviewItem,
} from "@/lib/types";
import type { MatchDecisions } from "@/lib/match-helpers";
import { getApprovedMatchesForNode } from "@/lib/match-helpers";
import { buildWorkingTree } from "@/lib/build-working-tree";
import { getDisplaySize, isDescendant } from "@/lib/tree-ops";

interface Props {
  companyData: CompanyData;
  company: string;
  state: OrgState;
  decisions: MatchDecisions;
  reviewItems: MatchReviewItem[];
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  onDrop: (draggedId: string, targetId: string) => void;
  onFieldEdit: (nodeId: string, edits: { name?: string; leaderName?: string; leaderTitle?: string }) => void;
  isDraggingRef: React.MutableRefObject<boolean>;
}

interface EditState {
  nodeId: string;
  name: string;
  leaderName: string;
  leaderTitle: string;
}

export default function TreeView({
  companyData,
  company,
  state,
  decisions,
  reviewItems,
  selectedNodeId,
  onSelect,
  onDrop,
  onFieldEdit,
  isDraggingRef,
}: Props) {
  const [editingNode, setEditingNode] = useState<EditState | null>(null);
  const draggedNodeIdRef = useRef<string | null>(null);

  const workingTree = useMemo(
    () =>
      buildWorkingTree(
        companyData.root,
        state.manualMapOverrides,
        state.manualMapModifications,
        state.merges,
        state.fieldEdits
      ),
    [companyData.root, state.manualMapOverrides, state.manualMapModifications, state.merges, state.fieldEdits]
  );

  const handleEditStart = useCallback(
    (node: WorkingTreeNode) => {
      setEditingNode({
        nodeId: node.id,
        name: node.displayName || node.name,
        leaderName: node.displayLeaderName || node.leader?.name || "",
        leaderTitle: node.displayLeaderTitle || node.leader?.title || "",
      });
    },
    []
  );

  const handleEditSave = useCallback(() => {
    if (!editingNode) return;
    onFieldEdit(editingNode.nodeId, {
      name: editingNode.name,
      leaderName: editingNode.leaderName,
      leaderTitle: editingNode.leaderTitle,
    });
    setEditingNode(null);
  }, [editingNode, onFieldEdit]);

  const handleEditCancel = useCallback(() => {
    setEditingNode(null);
  }, []);

  return (
    <div className="tree-container overflow-x-auto">
      <div className="min-w-max inline-flex justify-center w-full">
      <TreeNode
        node={workingTree}
        level={0}
        company={company}
        state={state}
        decisions={decisions}
        reviewItems={reviewItems}
        selectedNodeId={selectedNodeId}
        editingNode={editingNode}
        onSelect={onSelect}
        onEditStart={handleEditStart}
        onEditSave={handleEditSave}
        onEditCancel={handleEditCancel}
        setEditingNode={setEditingNode}
        onDrop={onDrop}
        draggedNodeIdRef={draggedNodeIdRef}
        isDraggingRef={isDraggingRef}
        workingTree={workingTree}
      />
      </div>
    </div>
  );
}

interface TreeNodeProps {
  node: WorkingTreeNode;
  level: number;
  company: string;
  state: OrgState;
  decisions: MatchDecisions;
  reviewItems: MatchReviewItem[];
  selectedNodeId: string | null;
  editingNode: EditState | null;
  onSelect: (nodeId: string) => void;
  onEditStart: (node: WorkingTreeNode) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  setEditingNode: React.Dispatch<React.SetStateAction<EditState | null>>;
  onDrop: (draggedId: string, targetId: string) => void;
  draggedNodeIdRef: React.MutableRefObject<string | null>;
  isDraggingRef: React.MutableRefObject<boolean>;
  workingTree: WorkingTreeNode;
}

/** Returns Tailwind classes + inline style for level-dependent node name typography */
function getNodeNameStyle(level: number): { className: string; style?: React.CSSProperties } {
  switch (level) {
    case 0:
      return { className: "text-base font-semibold text-gray-900 leading-tight" };
    case 1:
      return {
        className: "text-[13px] font-medium text-gray-900 leading-tight",
        style: { fontVariant: "small-caps", letterSpacing: "0.5px", textTransform: "lowercase" as const },
      };
    case 2:
      return { className: "text-[13px] font-semibold text-gray-900 leading-tight" };
    case 3:
      return { className: "text-xs font-normal text-gray-900 leading-tight" };
    default:
      return { className: "text-[11px] font-normal text-[#555] leading-tight" };
  }
}

function TreeNode({
  node,
  level,
  company,
  state,
  decisions,
  reviewItems,
  selectedNodeId,
  editingNode,
  onSelect,
  onEditStart,
  onEditSave,
  onEditCancel,
  setEditingNode,
  onDrop,
  draggedNodeIdRef,
  isDraggingRef,
  workingTree,
}: TreeNodeProps) {
  const [dragOver, setDragOver] = useState(false);
  const [dragInvalid, setDragInvalid] = useState(false);

  // Skip absorbed nodes
  if (node.absorbed) return null;

  const evidence = node.gongEvidence || {
    snippets: [],
    sizeMentions: [],
    matchedContacts: [],
    totalMentions: 0,
    confidence: "none" as const,
    status: "unverified" as const,
  };

  const approvedMatches = getApprovedMatchesForNode(
    node.displayName || node.name,
    node.id,
    decisions,
    reviewItems
  );

  let status = evidence.status || "unverified";
  if (approvedMatches.length > 0 && status === "unverified") {
    status = "supported";
  }

  const displayName = node.displayName || node.name;
  const displaySize = getDisplaySize(node, company, state.sizes);
  const leader = node.leader;
  const displayLeaderName = node.displayLeaderName || leader?.name;
  const displayLeaderTitle = node.displayLeaderTitle || leader?.title;
  const isSelected = selectedNodeId === node.id;
  const isEditing = editingNode?.nodeId === node.id;
  const hasOverride = !!node.override;
  const totalMentions = evidence.totalMentions + approvedMatches.length;

  // Meta parts
  const metaParts: string[] = [];
  if (displaySize) metaParts.push(String(displaySize));
  if (totalMentions > 0) metaParts.push(`${totalMentions} mentions`);
  if (node.sites?.length) metaParts.push(node.sites[0]);

  const visibleChildren = node.children.filter((c) => !c.absorbed);

  return (
    <div className="flex flex-col items-center">
      {/* Node box */}
      <div
        data-node-id={node.id}
        draggable={level > 0}
        className={`relative px-3 py-2 rounded border cursor-pointer text-center min-w-[140px] max-w-[220px] transition-all ${
          isSelected ? "border-blue-300 bg-[rgba(37,99,235,0.06)]" : "border-[#ddd] bg-white hover:bg-[rgba(0,0,0,0.02)]"
        } ${hasOverride ? "border-l-2 border-l-[#3b5998]" : ""} ${
          dragOver ? "ring-2 ring-green-500 bg-green-50" : ""
        } ${dragInvalid ? "ring-2 ring-red-400 bg-red-50" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!isEditing) onSelect(node.id);
        }}
        onDragStart={(e) => {
          if (level === 0) { e.preventDefault(); return; }
          draggedNodeIdRef.current = node.id;
          isDraggingRef.current = true;
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          draggedNodeIdRef.current = null;
          isDraggingRef.current = false;
        }}
        onDragOver={(e) => {
          e.preventDefault();
          const draggedId = draggedNodeIdRef.current;
          if (!draggedId || draggedId === node.id) return;
          if (isDescendant(draggedId, node.id, workingTree)) {
            setDragInvalid(true);
            setDragOver(false);
          } else {
            setDragOver(true);
            setDragInvalid(false);
          }
        }}
        onDragLeave={() => {
          setDragOver(false);
          setDragInvalid(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          setDragInvalid(false);
          const draggedId = draggedNodeIdRef.current;
          if (!draggedId || draggedId === node.id) return;
          if (isDescendant(draggedId, node.id, workingTree)) return;
          onDrop(draggedId, node.id);
        }}
      >
        {/* Status indicators — top-right corner */}
        <div className="absolute -top-1 -right-1 flex flex-col gap-0.5">
          {evidence.snippets.length > 0 && (
            <div
              data-status-dot
              className="w-1.5 h-1.5 rounded-full bg-purple-500"
              title={`${evidence.snippets.length} snippets`}
            />
          )}
          {(approvedMatches.length > 0 || (status === "supported" && evidence.snippets.length === 0)) && (
            <div
              data-status-dot
              className="w-1.5 h-1.5 rounded-full bg-green-500"
              title={approvedMatches.length > 0 ? `${approvedMatches.length} approved matches` : "Supported by Gong data"}
            />
          )}
          {status === "conflicting" && (
            <div
              data-status-dot
              className="w-1.5 h-1.5 rounded-full bg-red-500"
              title="Conflicts with Gong data"
            />
          )}
        </div>

        {/* Edit button */}
        <button
          data-edit-btn
          onClick={(e) => {
            e.stopPropagation();
            onEditStart(node);
          }}
          className="absolute top-0.5 left-0.5 text-[10px] text-gray-400 hover:text-gray-700"
          title="Edit entity"
        >
          &#9998;
        </button>

        {isEditing ? (
          /* Inline edit form */
          <div className="text-left space-y-1.5 bg-[#fff3e0] -mx-3 -my-2 px-3 py-2 rounded" onClick={(e) => e.stopPropagation()}>
            <label className="block text-[10px] text-gray-400">Name</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:border-[#ff9800] focus:outline-none focus:ring-1 focus:ring-[#ff9800]"
              value={editingNode!.name}
              onChange={(e) =>
                setEditingNode((prev) => prev && { ...prev, name: e.target.value })
              }
              onClick={(e) => e.stopPropagation()}
            />
            <label className="block text-[10px] text-gray-400">Leader</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:border-[#ff9800] focus:outline-none focus:ring-1 focus:ring-[#ff9800]"
              value={editingNode!.leaderName}
              onChange={(e) =>
                setEditingNode((prev) => prev && { ...prev, leaderName: e.target.value })
              }
              onClick={(e) => e.stopPropagation()}
            />
            <label className="block text-[10px] text-gray-400">Title</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:border-[#ff9800] focus:outline-none focus:ring-1 focus:ring-[#ff9800]"
              value={editingNode!.leaderTitle}
              onChange={(e) =>
                setEditingNode((prev) => prev && { ...prev, leaderTitle: e.target.value })
              }
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex gap-1 pt-1">
              <button
                onClick={(e) => { e.stopPropagation(); onEditSave(); }}
                className="px-2 py-0.5 text-[10px] bg-green-600 text-white rounded"
              >
                Save
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onEditCancel(); }}
                className="px-2 py-0.5 text-[10px] bg-gray-500 text-white rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* Normal display */
          <>
            <div className={getNodeNameStyle(level).className} style={getNodeNameStyle(level).style}>
              {displayName}
            </div>
            {displayLeaderName && (
              <div className="text-[13px] italic text-[#444] mt-0.5">
                {displayLeaderName}
                {displayLeaderTitle && `, ${displayLeaderTitle}`}
              </div>
            )}
            {metaParts.length > 0 && (
              <div className="text-[11px] text-gray-400 mt-0.5">
                {metaParts.map((part, i) => (
                  <span key={i}>
                    {i > 0 && " \u00B7 "}
                    {part === String(displaySize) ? <strong>{part}</strong> : part}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Children */}
      {visibleChildren.length > 0 && (
        <div className="mt-4 relative">
          {/* Vertical connector from parent */}
          <div className="absolute left-1/2 -top-4 w-px h-4 bg-gray-300" />
          {/* Horizontal connector bar */}
          {visibleChildren.length > 1 && (
            <div className="absolute top-0 bg-gray-300 h-px" style={{
              left: `${100 / (visibleChildren.length * 2)}%`,
              right: `${100 / (visibleChildren.length * 2)}%`,
            }} />
          )}
          <div className="flex gap-6 justify-center">
            {visibleChildren.map((child) => (
              <div key={child.id} className="relative">
                {/* Vertical connector to child */}
                <div className="absolute left-1/2 -top-0 w-px h-4 bg-gray-300" />
                <div className="pt-4">
                  <TreeNode
                    node={child}
                    level={level + 1}
                    company={company}
                    state={state}
                    decisions={decisions}
                    reviewItems={reviewItems}
                    selectedNodeId={selectedNodeId}
                    editingNode={editingNode}
                    onSelect={onSelect}
                    onEditStart={onEditStart}
                    onEditSave={onEditSave}
                    onEditCancel={onEditCancel}
                    setEditingNode={setEditingNode}
                    onDrop={onDrop}
                    draggedNodeIdRef={draggedNodeIdRef}
                    isDraggingRef={isDraggingRef}
                    workingTree={workingTree}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
