"use client";

import { useState, useEffect } from "react";
import type { EntityListItem } from "@/lib/match-helpers";
import type { WorkingTreeNode, EntityMerge } from "@/lib/types";
import { isEntityAbsorbed, findNodeById, countNodes } from "@/lib/tree-ops";

type Tab = "create" | "delete" | "merge";

interface Props {
  isOpen: boolean;
  entities: EntityListItem[];
  tree: WorkingTreeNode;
  merges: Record<string, EntityMerge>;
  onClose: () => void;
  onCreate: (parentId: string, name: string) => void;
  onDelete: (entityId: string) => void;
  onMerge: (canonicalId: string, absorbedId: string) => void;
}

export default function ManageEntitiesModal({
  isOpen,
  entities,
  tree,
  merges,
  onClose,
  onCreate,
  onDelete,
  onMerge,
}: Props) {
  const [tab, setTab] = useState<Tab>("create");

  // Create tab state
  const [createParentSearch, setCreateParentSearch] = useState("");
  const [selectedParent, setSelectedParent] = useState<EntityListItem | null>(null);
  const [createName, setCreateName] = useState("");

  // Delete tab state
  const [deleteSearch, setDeleteSearch] = useState("");
  const [selectedDelete, setSelectedDelete] = useState<EntityListItem | null>(null);

  // Merge tab state
  const [mergeSearchA, setMergeSearchA] = useState("");
  const [mergeSearchB, setMergeSearchB] = useState("");
  const [entityA, setEntityA] = useState<EntityListItem | null>(null);
  const [entityB, setEntityB] = useState<EntityListItem | null>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setTab("create");
      setCreateParentSearch("");
      setSelectedParent(null);
      setCreateName("");
      setDeleteSearch("");
      setSelectedDelete(null);
      setMergeSearchA("");
      setMergeSearchB("");
      setEntityA(null);
      setEntityB(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Create tab helpers
  const filteredParents = createParentSearch
    ? entities.filter(
        (e) =>
          e.name.toLowerCase().includes(createParentSearch.toLowerCase()) ||
          e.path.toLowerCase().includes(createParentSearch.toLowerCase())
      )
    : [];

  const handleCreate = () => {
    if (!selectedParent || !createName.trim()) return;
    onCreate(selectedParent.id, createName.trim());
    onClose();
  };

  // Delete tab helpers
  const filteredDeleteEntities = deleteSearch
    ? entities.filter((e) => e.name.toLowerCase().includes(deleteSearch.toLowerCase()))
    : entities;

  const handleDelete = () => {
    if (!selectedDelete) return;
    onDelete(selectedDelete.id);
    onClose();
  };

  // Merge tab helpers
  const filteredA = mergeSearchA
    ? entities.filter(
        (e) =>
          e.name.toLowerCase().includes(mergeSearchA.toLowerCase()) ||
          e.path.toLowerCase().includes(mergeSearchA.toLowerCase())
      )
    : [];
  const filteredB = mergeSearchB
    ? entities.filter(
        (e) =>
          e.name.toLowerCase().includes(mergeSearchB.toLowerCase()) ||
          e.path.toLowerCase().includes(mergeSearchB.toLowerCase())
      )
    : [];

  let mergeError: string | null = null;
  if (entityA && entityB) {
    if (entityA.id === entityB.id) {
      mergeError = "Cannot merge an entity with itself.";
    } else if (isEntityAbsorbed(entityA.id, merges)) {
      mergeError = `${entityA.name} is already absorbed by another entity.`;
    } else if (isEntityAbsorbed(entityB.id, merges)) {
      mergeError = `${entityB.name} is already absorbed by another entity.`;
    }
  }

  const canMerge = entityA && entityB && !mergeError;

  const handleMerge = () => {
    if (!entityA || !entityB || mergeError) return;
    // A is absorbed into B (B is canonical)
    onMerge(entityB.id, entityA.id);
    onClose();
  };

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium cursor-pointer border-b-2 ${
      tab === t ? "border-blue-500 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Manage Entities</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button className={tabClass("create")} onClick={() => setTab("create")}>Create</button>
          <button className={tabClass("delete")} onClick={() => setTab("delete")}>Delete</button>
          <button className={tabClass("merge")} onClick={() => setTab("merge")}>Merge</button>
        </div>

        {/* Tab content */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* CREATE TAB */}
          {tab === "create" && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Parent Entity</label>
                {selectedParent ? (
                  <div className="flex items-center gap-2 p-2 bg-blue-50 rounded text-sm">
                    <span className="font-medium">{selectedParent.name}</span>
                    <span className="text-xs text-gray-500">{selectedParent.path}</span>
                    <button
                      onClick={() => setSelectedParent(null)}
                      className="ml-auto text-red-500 text-xs"
                    >
                      &times;
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Search parent entity..."
                      value={createParentSearch}
                      onChange={(e) => setCreateParentSearch(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                    />
                    {filteredParents.length > 0 && (
                      <div className="border border-gray-200 rounded mt-1 max-h-40 overflow-y-auto">
                        {filteredParents.map((e) => (
                          <div
                            key={e.id}
                            onClick={() => {
                              setSelectedParent(e);
                              setCreateParentSearch("");
                            }}
                            className="px-3 py-2 cursor-pointer hover:bg-blue-50 border-b border-gray-100 text-sm"
                          >
                            <div className="font-medium">{e.name}</div>
                            <div className="text-xs text-gray-500">{e.path}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Entity Name</label>
                <input
                  type="text"
                  placeholder="Entity name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={!selectedParent || !createName.trim()}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Entity
              </button>
            </div>
          )}

          {/* DELETE TAB */}
          {tab === "delete" && (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Search to filter..."
                value={deleteSearch}
                onChange={(e) => setDeleteSearch(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
              <div className="border border-gray-200 rounded max-h-48 overflow-y-auto">
                {filteredDeleteEntities.map((e) => {
                  const node = findNodeById(tree, e.id);
                  const childCount = node ? node.children.length : 0;
                  return (
                    <div
                      key={e.id}
                      onClick={() => setSelectedDelete(e)}
                      className={`px-3 py-2 cursor-pointer border-b border-gray-100 text-sm ${
                        selectedDelete?.id === e.id ? "bg-blue-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="font-medium">
                        {e.name}
                        {childCount > 0 && (
                          <span className="text-red-500 text-xs ml-1">
                            ({childCount} {childCount === 1 ? "child" : "children"})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{e.path}</div>
                    </div>
                  );
                })}
              </div>
              {selectedDelete && (
                <div className="p-3 bg-red-50 rounded border border-red-200">
                  <p className="text-sm">
                    Delete <strong>{selectedDelete.name}</strong>?
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleDelete}
                      className="px-4 py-1.5 bg-red-600 text-white rounded text-sm"
                    >
                      Confirm Delete
                    </button>
                    <button
                      onClick={() => setSelectedDelete(null)}
                      className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MERGE TAB */}
          {tab === "merge" && (
            <div className="space-y-3">
              {/* Entity A */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Entity A (to be absorbed)</label>
                {entityA ? (
                  <div className="flex items-center gap-2 p-2 bg-blue-50 rounded text-sm">
                    <span className="font-medium">{entityA.name}</span>
                    <button onClick={() => setEntityA(null)} className="ml-auto text-red-500 text-xs">&times;</button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Search Entity A..."
                      value={mergeSearchA}
                      onChange={(e) => setMergeSearchA(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                    />
                    {filteredA.length > 0 && (
                      <div className="border border-gray-200 rounded mt-1 max-h-32 overflow-y-auto">
                        {filteredA.map((e) => (
                          <div
                            key={e.id}
                            onClick={() => { setEntityA(e); setMergeSearchA(""); }}
                            className="px-3 py-2 cursor-pointer hover:bg-blue-50 border-b border-gray-100 text-sm"
                          >
                            <div className="font-medium">{e.name}</div>
                            <div className="text-xs text-gray-500">{e.path}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Entity B */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Entity B (canonical — keeps identity)</label>
                {entityB ? (
                  <div className="flex items-center gap-2 p-2 bg-green-50 rounded text-sm">
                    <span className="font-medium">{entityB.name}</span>
                    <button onClick={() => setEntityB(null)} className="ml-auto text-red-500 text-xs">&times;</button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Search Entity B..."
                      value={mergeSearchB}
                      onChange={(e) => setMergeSearchB(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                    />
                    {filteredB.length > 0 && (
                      <div className="border border-gray-200 rounded mt-1 max-h-32 overflow-y-auto">
                        {filteredB.map((e) => (
                          <div
                            key={e.id}
                            onClick={() => { setEntityB(e); setMergeSearchB(""); }}
                            className="px-3 py-2 cursor-pointer hover:bg-blue-50 border-b border-gray-100 text-sm"
                          >
                            <div className="font-medium">{e.name}</div>
                            <div className="text-xs text-gray-500">{e.path}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Validation / Preview */}
              {mergeError && (
                <div className="p-3 bg-red-50 rounded border border-red-200 text-sm text-red-700">
                  {mergeError}
                </div>
              )}
              {canMerge && (
                <div className="p-3 bg-blue-50 rounded border border-blue-200 text-sm">
                  <strong>{entityA!.name}</strong> will be absorbed into{" "}
                  <strong>{entityB!.name}</strong>
                </div>
              )}

              <button
                onClick={handleMerge}
                disabled={!canMerge}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Merge
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
