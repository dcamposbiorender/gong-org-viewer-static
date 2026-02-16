"use client";

import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import { useState, useEffect } from "react";
import { VALID_ACCOUNTS, type MatchReviewCompany, type ValidAccount } from "@/lib/types";
import { useKVState } from "@/lib/use-kv-state";

export default function MatchReviewPage() {
  const params = useParams<{ company: string }>();
  const company = params.company;

  if (!VALID_ACCOUNTS.includes(company as ValidAccount)) {
    notFound();
  }

  const { loading: kvLoading } = useKVState(company);
  const [reviewData, setReviewData] = useState<MatchReviewCompany | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  // Load bundled match-review JSON for this company
  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    fetch(`/data/${company}/match-review.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) {
          setReviewData(data);
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
          Loading match review for {company}...
        </div>
      </div>
    );
  }

  if (!reviewData) {
    return (
      <div className="max-w-screen-xl mx-auto p-4">
        <p className="text-gray-500">No match review data available for {company}.</p>
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto p-4">
      {/* Stats bar */}
      <div className="flex items-center gap-6 mb-4 text-sm text-gray-600">
        <h2 className="text-xl font-semibold text-gray-900">
          Match Review — {company.charAt(0).toUpperCase() + company.slice(1)}
        </h2>
        <span>
          <strong>{reviewData.total_unmatched}</strong> unmatched
        </span>
        {reviewData.total_with_suggestions != null && (
          <span>
            <strong>{reviewData.total_with_suggestions}</strong> with suggestions
          </span>
        )}
        <span>
          <strong>{reviewData.items.length}</strong> items
        </span>
      </div>

      {/* Placeholder for Phase 3 match review table */}
      <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-400">
        Match review table will be implemented in Phase 3.
        <br />
        <span className="text-xs">
          {reviewData.items.length} items to review
        </span>
      </div>
    </div>
  );
}
