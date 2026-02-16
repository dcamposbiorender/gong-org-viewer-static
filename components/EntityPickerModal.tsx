"use client";

import { useState, useEffect } from "react";
import type { EntityListItem } from "@/lib/match-helpers";

interface Props {
  isOpen: boolean;
  entities: EntityListItem[];
  onSelect: (entity: EntityListItem) => void;
  onClose: () => void;
}

export default function EntityPickerModal({ isOpen, entities, onSelect, onClose }: Props) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setSearch("");
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered = search
    ? entities.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          e.path.toLowerCase().includes(search.toLowerCase())
      )
    : entities;

  return (
    <div
      data-testid="picker-backdrop"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <input
            type="text"
            placeholder="Search entities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-400">
              No entities match &quot;{search}&quot;
            </div>
          ) : (
            filtered.map((entity) => (
              <div
                key={entity.id}
                onClick={() => onSelect(entity)}
                className="px-3 py-2 cursor-pointer hover:bg-blue-50 border-b border-gray-100"
              >
                <div className="text-sm font-medium text-gray-900">{entity.name}</div>
                <div className="text-xs text-gray-500">{entity.path}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
