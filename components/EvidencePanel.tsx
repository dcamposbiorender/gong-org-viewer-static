"use client";

import type { WorkingTreeNode, OrgState, SizeMention, MatchReviewItem, Snippet } from "@/lib/types";
import type { MatchDecisions } from "@/lib/match-helpers";
import { getApprovedMatchesForNode } from "@/lib/match-helpers";
import { getDisplaySize } from "@/lib/tree-ops";
import { findNodeParent } from "@/lib/tree-ops";
import { sanitizeUrl } from "@/lib/utils";

interface Props {
  node: WorkingTreeNode | null;
  company: string;
  state: OrgState;
  decisions: MatchDecisions;
  reviewItems: MatchReviewItem[];
  root: WorkingTreeNode;
  onSizeChipClick: (nodeId: string, sizeIdx: number) => void;
  onCustomSizeChange: (nodeId: string, value: string) => void;
  onClearSize: (nodeId: string) => void;
  onContextClick: (snippet: Snippet) => void;
  onAddChild: (parentId: string) => void;
  onDeleteEntity: (nodeId: string) => void;
}

export default function EvidencePanel({
  node,
  company,
  state,
  decisions,
  reviewItems,
  root,
  onSizeChipClick,
  onCustomSizeChange,
  onClearSize,
  onContextClick,
  onAddChild,
  onDeleteEntity,
}: Props) {
  if (!node) {
    return (
      <div className="p-6 text-center text-gray-400 text-sm">
        Select a node to view evidence
      </div>
    );
  }

  const evidence = node.gongEvidence || {
    snippets: [],
    sizeMentions: [],
    matchedContacts: [],
    totalMentions: 0,
    confidence: "none" as const,
    status: "unverified" as const,
  };

  // Combine base snippets with approved match snippets
  const snippets = [...evidence.snippets];
  const sizeMentions: SizeMention[] = [...evidence.sizeMentions];
  const approvedMatches = getApprovedMatchesForNode(
    node.displayName || node.name,
    node.id,
    decisions,
    reviewItems
  );

  approvedMatches.forEach((match) => {
    if (match.snippet) {
      snippets.push({
        date: match.call_date || "",
        quote: match.snippet,
        entityName: match.gong_entity + " (approved match)",
      });
    }
  });

  const matchedContacts = evidence.matchedContacts;
  const isRoot = !findNodeParent(root, node.id);
  const displaySize = getDisplaySize(node, company, state.sizes);
  const sizeKey = `${company}:${node.id}`.toLowerCase();
  const currentSizeOverride = state.sizes[sizeKey];

  // Aliases from merges
  const merge = state.merges[node.id];
  const aliases = merge?.aliases || [];

  const statusColor =
    evidence.status === "supported"
      ? "text-green-600"
      : evidence.status === "conflicting"
        ? "text-red-600"
        : "text-gray-500";

  return (
    <div className="flex h-full overflow-hidden text-sm">
      {/* Entity info — left column */}
      <div className="w-[280px] shrink-0 border-r border-[#ddd] overflow-y-auto p-3">
        <h4 className="font-semibold text-gray-900 text-base mb-2">
          {node.displayName || node.name}
        </h4>
        <div className="space-y-1.5 mb-3">
          <div className="flex items-center gap-2 text-gray-600">
            <span className="text-[12px] text-[#888] font-medium">Type</span>
            <span>{node.type || "unknown"}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <span className="text-[12px] text-[#888] font-medium">Status</span>
            <span className={statusColor}>
              {evidence.status || "unverified"}
              {approvedMatches.length > 0 && ` (+${approvedMatches.length} approved)`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <span className="text-[12px] text-[#888] font-medium">Mentions</span>
            <span>{evidence.totalMentions + approvedMatches.length}</span>
          </div>

          {/* Team size input */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#888] font-medium">Team size</span>
            <input
              type="text"
              className="border border-gray-300 rounded px-2 py-0.5 w-16 text-center text-sm"
              placeholder="—"
              value={currentSizeOverride?.customValue || (displaySize ? String(displaySize).replace(/[^\d]/g, "") : "")}
              onChange={(e) => onCustomSizeChange(node.id, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
            {currentSizeOverride && (
              <button
                onClick={() => onClearSize(node.id)}
                className="text-xs text-gray-400 hover:text-red-500"
                title="Clear size override"
              >
                &times;
              </button>
            )}
          </div>

          {/* Size chips */}
          {sizeMentions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sizeMentions.map((m, idx) => {
                const isSelected = currentSizeOverride?.selectedSizeIndex === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => onSizeChipClick(node.id, idx)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border cursor-pointer ${
                      isSelected
                        ? "bg-blue-100 border-blue-400 text-blue-700"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}
                    title={isSelected ? "Selected" : "Click to select"}
                  >
                    {isSelected && <span>&#10003;</span>}
                    {m.value}
                    {m.source?.callDate && (
                      <span className="text-gray-400 text-[10px]">
                        {m.source.callDate.substring(0, 10)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Sites */}
          {node.sites && node.sites.length > 0 && (
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-[12px] text-[#888] font-medium">Sites</span>
              <span>{node.sites.join(", ")}</span>
            </div>
          )}

          {/* Aliases */}
          {aliases.length > 0 && (
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-[12px] text-[#888] font-medium">Aliases</span>
              <span>{aliases.join(", ")}</span>
            </div>
          )}

          {/* Contacts */}
          {matchedContacts.length > 0 && (
            <div className="border-t border-gray-200 pt-2 mt-2">
              <h5 className="text-xs text-gray-500 font-medium mb-1">People</h5>
              {matchedContacts.map((c, i) => (
                <div key={i} className="py-1 border-b border-gray-100 last:border-0">
                  <span className="font-medium">{c.name}</span>
                  {c.title && <span className="text-gray-500"> - {c.title}</span>}
                  {c.isDecisionMaker && (
                    <span className="text-green-600 text-[10px] ml-1.5">(DM)</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => onAddChild(node.id)}
            className="flex-1 px-3 py-1.5 text-xs bg-[#2563eb] text-white rounded hover:bg-[#1d4ed8]"
          >
            + Add Child
          </button>
          {!isRoot && (
            <button
              onClick={() => onDeleteEntity(node.id)}
              className="flex-1 px-3 py-1.5 text-xs bg-[#dc2626] text-white rounded hover:bg-[#b91c1c]"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Snippet cards — horizontal scroll */}
      <div className="flex-1 overflow-x-auto p-3">
        {snippets.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            No Gong snippets for this entity
          </div>
        ) : (
          <div className="flex gap-3">
            {snippets.map((s, idx) => (
              <div key={idx} className="min-w-[280px] max-w-[320px] shrink-0 bg-white rounded p-3 border border-[#e5e5e5]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">
                    {s.gongUrl ? (
                      <a
                        href={sanitizeUrl(s.gongUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {s.date || ""} &rarr; Gong
                      </a>
                    ) : (
                      s.date || ""
                    )}
                  </span>
                  {s.contextBefore !== undefined && (
                    <button
                      onClick={() => onContextClick(s)}
                      className="text-[11px] text-[#4b5563] border border-[#d1d5db] rounded px-2 py-0.5 hover:bg-[#f5f5f5]"
                      title="View context"
                    >
                      &#128196; Context
                    </button>
                  )}
                </div>
                <div className="text-[13px] italic text-[#333] leading-[1.4]">&ldquo;{s.quote}&rdquo;</div>
                <div className="text-xs text-gray-500 mt-1">
                  {s.internalName && `Internal: ${s.internalName}`}
                  {s.internalName && s.customerName && " | "}
                  {s.customerName && `Customer: ${s.customerName}`}
                </div>
                {s.entityName && (
                  <div className="text-[11px] text-gray-400 mt-0.5">from: {s.entityName}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
