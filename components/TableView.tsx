"use client";

import { useState, useMemo } from "react";
import type { WorkingTreeNode, OrgState, MatchReviewItem } from "@/lib/types";
import type { MatchDecisions } from "@/lib/match-helpers";
import { getApprovedMatchesForNode } from "@/lib/match-helpers";
import { getDisplaySize, collectAllNodes } from "@/lib/tree-ops";

interface Props {
  tree: WorkingTreeNode;
  company: string;
  state: OrgState;
  decisions: MatchDecisions;
  reviewItems: MatchReviewItem[];
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
}

type SortField = "name" | "type" | "leader" | "size" | "mentions" | "confidence" | "sites";
type SortDir = "asc" | "desc";

interface FlatEntity {
  id: string;
  name: string;
  type: string;
  leader: string;
  size: string;
  mentions: number;
  confidence: string;
  sites: string;
  path: string;
}

export default function TableView({
  tree,
  company,
  state,
  decisions,
  reviewItems,
  selectedNodeId,
  onSelect,
}: Props) {
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filter, setFilter] = useState("");

  const flatEntities = useMemo<FlatEntity[]>(() => {
    const allNodes = collectAllNodes(tree) as WorkingTreeNode[];
    return allNodes
      .filter((n) => !n.absorbed)
      .map((n) => {
        const evidence = n.gongEvidence || {
          snippets: [],
          sizeMentions: [],
          matchedContacts: [],
          totalMentions: 0,
          confidence: "none" as const,
          status: "unverified" as const,
        };
        const approvedMatches = getApprovedMatchesForNode(
          n.displayName || n.name,
          n.id,
          decisions,
          reviewItems
        );
        const displaySize = getDisplaySize(n, company, state.sizes);

        // Build path
        function buildPath(node: WorkingTreeNode, root: WorkingTreeNode, trail: string[] = []): string[] {
          if (root.id === node.id) return [...trail, root.displayName || root.name];
          for (const child of root.children as WorkingTreeNode[]) {
            const found = buildPath(node, child, [...trail, root.displayName || root.name]);
            if (found.length > trail.length + 1) return found;
          }
          return trail;
        }
        const pathParts = buildPath(n, tree);

        return {
          id: n.id,
          name: n.displayName || n.name,
          type: n.type || "unknown",
          leader: n.displayLeaderName || n.leader?.name || "",
          size: displaySize ? String(displaySize) : "",
          mentions: evidence.totalMentions + approvedMatches.length,
          confidence: evidence.confidence || "none",
          sites: n.sites?.join(", ") || "",
          path: pathParts.join(" / "),
        };
      });
  }, [tree, company, state.sizes, decisions, reviewItems]);

  const filtered = useMemo(() => {
    if (!filter) return flatEntities;
    const lc = filter.toLowerCase();
    return flatEntities.filter(
      (e) =>
        e.name.toLowerCase().includes(lc) ||
        e.leader.toLowerCase().includes(lc) ||
        e.type.toLowerCase().includes(lc) ||
        e.sites.toLowerCase().includes(lc) ||
        e.path.toLowerCase().includes(lc)
    );
  }, [flatEntities, filter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sortArrow = (field: SortField) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  const columns: { key: SortField; label: string }[] = [
    { key: "name", label: "Entity" },
    { key: "type", label: "Type" },
    { key: "leader", label: "Leader" },
    { key: "size", label: "Size" },
    { key: "mentions", label: "Mentions" },
    { key: "confidence", label: "Confidence" },
    { key: "sites", label: "Sites" },
  ];

  return (
    <div>
      <input
        type="text"
        placeholder="Filter entities..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full mb-3 border border-gray-300 rounded px-3 py-1.5 text-sm"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="pb-2 pr-3 cursor-pointer hover:text-gray-700 select-none"
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}{sortArrow(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((entity) => (
              <tr
                key={entity.id}
                onClick={() => onSelect(entity.id)}
                className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                  selectedNodeId === entity.id ? "bg-blue-50/50" : ""
                }`}
              >
                <td className="py-1.5 pr-3">
                  <div className="font-medium">{entity.name}</div>
                  <div className="text-[11px] text-gray-400">{entity.path}</div>
                </td>
                <td className="py-1.5 pr-3 text-gray-600">{entity.type}</td>
                <td className="py-1.5 pr-3 text-gray-600">{entity.leader}</td>
                <td className="py-1.5 pr-3 text-gray-600">{entity.size}</td>
                <td className="py-1.5 pr-3 text-gray-600">{entity.mentions}</td>
                <td className="py-1.5 pr-3">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      entity.confidence === "high"
                        ? "bg-green-100 text-green-700"
                        : entity.confidence === "medium"
                          ? "bg-yellow-100 text-yellow-700"
                          : entity.confidence === "low"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {entity.confidence}
                  </span>
                </td>
                <td className="py-1.5 text-gray-600">{entity.sites}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-gray-400 mt-2">
        Showing {sorted.length} of {flatEntities.length} entities
      </div>
    </div>
  );
}
