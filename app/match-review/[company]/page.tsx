"use client";

import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  VALID_ACCOUNTS,
  type CompanyData,
  type ValidAccount,
  type MatchReviewCompany,
} from "@/lib/types";
import { useKVState } from "@/lib/use-kv-state";
import { useMatchReview } from "@/lib/use-match-review";
import { buildEntityList, type EntityListItem } from "@/lib/match-helpers";
import { buildWorkingTree } from "@/lib/build-working-tree";
import MatchReviewTable from "@/components/MatchReviewTable";
import EntityPickerModal from "@/components/EntityPickerModal";
import { setRefreshHandler } from "@/lib/refresh-store";
import { useToast } from "@/components/Toast";

export default function MatchReviewPage() {
  const params = useParams<{ company: string }>();
  const company = params.company;

  if (!VALID_ACCOUNTS.includes(company as ValidAccount)) {
    notFound();
  }

  const { state, loading: kvLoading, refreshing, refresh } = useKVState(company);
  const { showToast } = useToast();
  const { decisions, loading: mrLoading, approve, reject, manualMatch, reset } =
    useMatchReview(company);
  const [reviewData, setReviewData] = useState<MatchReviewCompany | null>(null);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [pickerItemId, setPickerItemId] = useState<string | null>(null);

  // Load bundled JSON data
  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    Promise.all([
      fetch(`/data/${company}/match-review.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/data/${company}/manual.json`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([review, manual]) => {
      if (!cancelled) {
        setReviewData(review);
        setCompanyData(manual);
        setDataLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setDataLoading(false);
    });
    return () => { cancelled = true; };
  }, [company]);

  const loading = kvLoading || dataLoading || mrLoading;

  const handleRefresh = useCallback(async () => {
    const [review, manual] = await Promise.all([
      fetch(`/data/${company}/match-review.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/data/${company}/manual.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      refresh(),
    ]);
    if (review) setReviewData(review);
    if (manual) setCompanyData(manual);
    showToast("Data refreshed", "success");
  }, [company, refresh, showToast]);

  // Sync refresh handler to external store (read by Header across layout boundary)
  useEffect(() => {
    setRefreshHandler(handleRefresh, refreshing);
    return () => setRefreshHandler(null, false);
  }, [handleRefresh, refreshing]);

  // Build entity list for picker modal
  const entityList = useMemo<EntityListItem[]>(() => {
    if (!companyData) return [];
    const workingTree = buildWorkingTree(
      companyData.root,
      state.manualMapOverrides,
      state.manualMapModifications,
      state.merges,
      state.fieldEdits
    );
    return buildEntityList(workingTree, state.fieldEdits);
  }, [companyData, state.manualMapOverrides, state.manualMapModifications, state.merges, state.fieldEdits]);

  const reviewItems = useMemo(() => reviewData?.items || [], [reviewData]);

  // Callbacks
  const handleApprove = useCallback(
    (itemId: string, manualNode: string, manualPath: string, manualNodeId: string) => {
      approve(itemId, manualNode, manualPath, manualNodeId);
    },
    [approve]
  );

  const handleReject = useCallback(
    (itemId: string) => {
      reject(itemId);
    },
    [reject]
  );

  const handlePickEntity = useCallback((itemId: string) => {
    setPickerItemId(itemId);
  }, []);

  const handleReset = useCallback(
    (itemId: string) => {
      reset(itemId);
    },
    [reset]
  );

  const handleEntitySelected = useCallback(
    (entity: EntityListItem) => {
      if (!pickerItemId) return;
      manualMatch(pickerItemId, entity.name, entity.path, entity.id);
      setPickerItemId(null);
    },
    [pickerItemId, manualMatch]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading match review for {company}...
      </div>
    );
  }

  if (!reviewData) {
    return (
      <p className="text-gray-500">No match review data available for {company}.</p>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-6 mb-4 text-sm text-gray-600">
        <h2 className="text-xl font-semibold text-gray-900">
          Match Review &mdash; {company.charAt(0).toUpperCase() + company.slice(1)}
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
          <strong>{reviewItems.length}</strong> items
        </span>
      </div>

      {/* Match Review Table */}
      <MatchReviewTable
        items={reviewItems}
        decisions={decisions}
        onApprove={handleApprove}
        onReject={handleReject}
        onPickEntity={handlePickEntity}
        onReset={handleReset}
      />

      {/* Entity Picker Modal */}
      <EntityPickerModal
        isOpen={pickerItemId !== null}
        entities={entityList}
        onSelect={handleEntitySelected}
        onClose={() => setPickerItemId(null)}
      />
    </>
  );
}
