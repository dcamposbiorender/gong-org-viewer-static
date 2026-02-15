// Match review actions: approve, reject, manual match, reset

import { matchReviewState } from './state';
import {
  initMatchReviewState, saveMatchReviewState,
  saveMatchReviewItemToKV, deleteMatchReviewItemFromKV,
} from './kv';

// Lazy import to avoid circular dep
let _renderMatchReview: ((company: string) => void) | null = null;
export function registerMatchRenderer(fn: (company: string) => void): void { _renderMatchReview = fn; }

export function approveMatch(company: string, itemId: string, manualNode: string, manualPath: string): void {
  initMatchReviewState(company);
  delete matchReviewState[company].rejected[itemId];
  delete matchReviewState[company].manual[itemId];
  const decision = { manualNode, manualPath, approvedAt: new Date().toISOString() };
  matchReviewState[company].approved[itemId] = decision;
  saveMatchReviewState(company);
  saveMatchReviewItemToKV(company, itemId, decision, 'approved');
  _renderMatchReview?.(company);
}

export function rejectMatch(company: string, itemId: string): void {
  initMatchReviewState(company);
  delete matchReviewState[company].approved[itemId];
  delete matchReviewState[company].manual[itemId];
  const decision = { rejectedAt: new Date().toISOString() };
  matchReviewState[company].rejected[itemId] = decision;
  saveMatchReviewState(company);
  saveMatchReviewItemToKV(company, itemId, decision, 'rejected');
  _renderMatchReview?.(company);
}

export function manualMatch(company: string, itemId: string, manualNode: string, manualPath: string): void {
  initMatchReviewState(company);
  delete matchReviewState[company].approved[itemId];
  delete matchReviewState[company].rejected[itemId];
  const decision = { manualNode, manualPath, matchedAt: new Date().toISOString() };
  matchReviewState[company].manual[itemId] = decision;
  saveMatchReviewState(company);
  saveMatchReviewItemToKV(company, itemId, decision, 'manual');
  _renderMatchReview?.(company);
}

export function resetMatchItem(company: string, itemId: string): void {
  initMatchReviewState(company);
  delete matchReviewState[company].approved[itemId];
  delete matchReviewState[company].rejected[itemId];
  delete matchReviewState[company].manual[itemId];
  saveMatchReviewState(company);
  deleteMatchReviewItemFromKV(company, itemId);
  _renderMatchReview?.(company);
}
