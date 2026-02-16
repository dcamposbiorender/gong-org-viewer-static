"use client";

import { useEffect } from "react";
import type { Snippet } from "@/lib/types";
import { buildSpeakerMap, resolveSpeakers } from "@/lib/speaker-resolution";
import { sanitizeUrl } from "@/lib/utils";

interface Props {
  snippet: Snippet | null;
  onClose: () => void;
}

export default function SnippetContextModal({ snippet, onClose }: Props) {
  useEffect(() => {
    if (!snippet) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [snippet, onClose]);

  if (!snippet) return null;

  const fullContext =
    (snippet.contextBefore || "") + snippet.quote + (snippet.contextAfter || "");
  const speakerMap = buildSpeakerMap(fullContext, snippet);

  return (
    <div
      data-testid="modal-backdrop"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-[700px] w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">
              {snippet.callTitle || "Call Context"}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              &times;
            </button>
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {snippet.date || ""}
            {snippet.customerName && ` \u00B7 ${snippet.customerName}`}
            {snippet.internalName && ` / ${snippet.internalName}`}
          </div>
          {snippet.gongUrl && (
            <a
              href={sanitizeUrl(snippet.gongUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline mt-1 inline-block"
            >
              Open in Gong &rarr;
            </a>
          )}
        </div>
        <div data-testid="context-body" className="p-4 space-y-3 text-sm font-serif leading-[1.7]">
          {snippet.contextBefore && (
            <div className="text-gray-600 whitespace-pre-wrap">
              {resolveSpeakers(snippet.contextBefore, speakerMap)}
            </div>
          )}
          <div className="bg-[#fef3c7] border-l-[3px] border-[#f59e0b] px-3 py-2 text-gray-900 font-medium whitespace-pre-wrap">
            {snippet.quote}
          </div>
          {snippet.contextAfter && (
            <div className="text-gray-600 whitespace-pre-wrap">
              {resolveSpeakers(snippet.contextAfter, speakerMap)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
