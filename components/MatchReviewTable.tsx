"use client";

import { useState } from "react";
import type { MatchReviewItem } from "@/lib/types";
import type { MatchDecisions } from "@/lib/match-helpers";
import { getItemStatus } from "@/lib/match-helpers";
import { truncateSnippet } from "@/lib/utils";

interface Props {
  items: MatchReviewItem[];
  decisions: MatchDecisions;
  onApprove: (itemId: string, manualNode: string, manualPath: string, manualNodeId: string) => void;
  onReject: (itemId: string) => void;
  onPickEntity: (itemId: string) => void;
  onReset: (itemId: string) => void;
  onContextClick?: (item: MatchReviewItem) => void;
}

export default function MatchReviewTable({
  items,
  decisions,
  onApprove,
  onReject,
  onPickEntity,
  onReset,
  onContextClick,
}: Props) {
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState("");

  const filteredItems = items.filter((item) => {
    if (searchFilter) {
      const searchText = [
        item.gong_entity,
        item.snippet,
        item.speaker_name,
        item.llm_suggested_match?.manual_node_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!searchText.includes(searchFilter.toLowerCase())) return false;
    }
    const status = getItemStatus(item.id, decisions);
    if (statusFilter && status !== statusFilter) return false;
    if (confidenceFilter) {
      const confidence = item.llm_suggested_match?.confidence || null;
      if (confidenceFilter === "none") {
        if (item.llm_suggested_match) return false;
      } else {
        if (confidence !== confidenceFilter) return false;
      }
    }
    return true;
  });

  // Only count decisions that match actual item IDs (handles ID drift from pipeline re-runs)
  const itemIds = new Set(items.map((i) => i.id));
  const approvedCount =
    Object.keys(decisions.approved).filter((k) => itemIds.has(k)).length +
    Object.keys(decisions.manual).filter((k) => itemIds.has(k)).length;
  const rejectedCount = Object.keys(decisions.rejected).filter((k) => itemIds.has(k)).length;
  const withSuggestions = items.filter((i) => i.llm_suggested_match).length;

  // Log orphaned decisions for debugging
  const totalKvDecisions =
    Object.keys(decisions.approved).length +
    Object.keys(decisions.rejected).length +
    Object.keys(decisions.manual).length;
  const orphanedCount = totalKvDecisions - approvedCount - rejectedCount;
  if (orphanedCount > 0) {
    console.warn(
      `[MatchReview] ${orphanedCount} orphaned decisions (item IDs changed since decision was made)`
    );
  }

  return (
    <div>
      {/* Stats */}
      <div className="flex items-center gap-4 mb-4 text-sm">
        <span>
          Total: <strong data-testid="stat-total">{items.length}</strong>
        </span>
        <span>
          With suggestions: <strong data-testid="stat-suggestions">{withSuggestions}</strong>
        </span>
        <span className="text-green-600">
          Approved: <strong data-testid="stat-approved">{approvedCount}</strong>
        </span>
        <span className="text-red-600">
          Rejected: <strong data-testid="stat-rejected">{rejectedCount}</strong>
        </span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="manual">Manual</option>
        </select>
        <select
          value={confidenceFilter}
          onChange={(e) => setConfidenceFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">All Confidence</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="none">No suggestion</option>
        </select>
      </div>

      {/* Table */}
      {filteredItems.length === 0 ? (
        <div className="text-center text-gray-400 py-8">
          No items match the current filters
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#ddd] text-left text-[10px] uppercase tracking-wider text-[#666]">
                <th className="pb-2 pr-3">Snippet</th>
                <th className="pb-2 pr-3">Person</th>
                <th className="pb-2 pr-3">Gong Entity</th>
                <th className="pb-2 pr-3">Suggestion</th>
                <th className="pb-2 pr-3">Reasoning</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const status = getItemStatus(item.id, decisions);
                const suggestion = item.llm_suggested_match;
                const decisionData =
                  decisions.approved[item.id] ||
                  decisions.manual[item.id];
                const displayedMatch =
                  status === "approved" || status === "manual"
                    ? {
                        manual_node_name: decisionData?.manualNode,
                        manual_node_path: decisionData?.manualPath,
                      }
                    : suggestion;

                return (
                  <tr
                    key={item.id}
                    className={`border-b border-gray-100 ${
                      status === "approved"
                        ? "bg-green-50/50"
                        : status === "rejected"
                          ? "bg-red-50/50"
                          : status === "manual"
                            ? "bg-blue-50/50"
                            : ""
                    }`}
                  >
                    <td className="py-2 pr-3 max-w-[200px]">
                      <div className="text-gray-800" title={item.snippet}>
                        &ldquo;{truncateSnippet(item.snippet, 80)}&rdquo;
                      </div>
                      {item.call_date && (
                        <div className="text-xs text-gray-400">{item.call_date}</div>
                      )}
                      {onContextClick && item.all_snippets?.[0]?.contextBefore && (
                        <button
                          onClick={() => onContextClick(item)}
                          className="mt-1 px-1.5 py-0.5 text-[10px] text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
                        >
                          Context
                        </button>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{item.speaker_name || "Unknown"}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div>{item.gong_entity}</div>
                    </td>
                    <td className="py-2 pr-3">
                      {displayedMatch?.manual_node_name ? (
                        <>
                          <div className="font-medium">{displayedMatch.manual_node_name}</div>
                          <div className="text-xs text-gray-500">
                            {displayedMatch.manual_node_path}
                          </div>
                          {suggestion?.confidence && (
                            <span
                              className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                suggestion.confidence === "high"
                                  ? "bg-[#e8f5e9] text-[#2e7d32]"
                                  : suggestion.confidence === "medium"
                                    ? "bg-[#fff8e1] text-[#f57f17]"
                                    : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {suggestion.confidence}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">No suggestion</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 max-w-[200px]">
                      <div className="text-xs text-gray-500">
                        {suggestion?.reasoning || ""}
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex flex-col gap-1">
                        {status === "pending" ? (
                          <>
                            {suggestion?.manual_node_name && (
                              <>
                                <button
                                  onClick={() =>
                                    onApprove(
                                      item.id,
                                      suggestion.manual_node_name,
                                      suggestion.manual_node_path || "",
                                      suggestion.manual_node_id
                                    )
                                  }
                                  className="px-2 py-1 text-xs bg-white border border-[#4caf50] text-[#2e7d32] rounded hover:bg-[#e8f5e9]"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => onReject(item.id)}
                                  className="px-2 py-1 text-xs bg-white border border-[#f44336] text-[#c62828] rounded hover:bg-[#ffebee]"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => onPickEntity(item.id)}
                              className="px-2 py-1 text-xs bg-white border border-[#ddd] text-[#666] rounded hover:bg-[#f5f5f5]"
                            >
                              Pick Entity
                            </button>
                          </>
                        ) : (
                          <>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-medium text-center ${
                                status === "approved"
                                  ? "bg-[#4caf50] text-white"
                                  : status === "rejected"
                                    ? "bg-[#f44336] text-white"
                                    : "bg-[#2196f3] text-white"
                              }`}
                            >
                              {status}
                            </span>
                            <button
                              onClick={() => onReset(item.id)}
                              className="px-2 py-1 text-xs bg-white border border-[#ddd] text-[#666] rounded hover:bg-[#f5f5f5]"
                            >
                              Reset
                            </button>
                            <button
                              onClick={() => onPickEntity(item.id)}
                              className="px-2 py-1 text-xs bg-white border border-[#ddd] text-[#666] rounded hover:bg-[#f5f5f5]"
                            >
                              Pick Entity
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
