"use client";

import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import { useState, useEffect } from "react";
import { VALID_ACCOUNTS, type CompanyData, type ValidAccount } from "@/lib/types";
import { useKVState } from "@/lib/use-kv-state";

export default function ManualMapPage() {
  const params = useParams<{ company: string }>();
  const company = params.company;

  if (!VALID_ACCOUNTS.includes(company as ValidAccount)) {
    notFound();
  }

  const { state, loading: kvLoading } = useKVState(company);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  // Load bundled JSON data for this company
  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    fetch(`/data/${company}/manual.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) {
          setCompanyData(data);
          setDataLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [company]);

  const loading = kvLoading || dataLoading;

  if (loading) {
    return (
      <div className="max-w-screen-xl mx-auto p-4">
        <div className="flex items-center gap-2 text-gray-500">
          <svg
            className="animate-spin h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Loading {company}...
        </div>
      </div>
    );
  }

  if (!companyData) {
    return (
      <div className="max-w-screen-xl mx-auto p-4">
        <p className="text-gray-500">No manual map data available for {company}.</p>
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto p-4">
      {/* Stats bar */}
      <div className="flex items-center gap-6 mb-4 text-sm text-gray-600">
        <h2 className="text-xl font-semibold text-gray-900">
          {companyData.company}
        </h2>
        <span>
          <strong>{companyData.stats.entities}</strong> entities
        </span>
        <span>
          <strong>{companyData.stats.matched}</strong> matched
        </span>
        <span>
          <strong>{companyData.stats.snippets}</strong> snippets
        </span>
        <span className="text-xs text-gray-400">
          KV: {Object.keys(state.corrections).length} corrections,{" "}
          {Object.keys(state.fieldEdits).length} edits,{" "}
          {Object.keys(state.merges).length} merges
        </span>
      </div>

      {/* Placeholder for Phase 3 tree/table view */}
      <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-400">
        Tree view and evidence panel will be implemented in Phase 3.
        <br />
        <span className="text-xs">
          Root: {companyData.root.name} ({companyData.root.children.length}{" "}
          children)
        </span>
      </div>
    </div>
  );
}
