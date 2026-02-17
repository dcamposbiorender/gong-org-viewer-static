/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { approveMatch, rejectMatch, manualMatch, resetMatchItem } from './match-actions';
import { matchReviewState, setMatchReviewState } from './state';

beforeEach(() => {
  setMatchReviewState({});
});

describe('approveMatch', () => {
  it('adds item to approved with manualNodeId', () => {
    approveMatch('abbvie', 'item-1', 'Oncology', '/R&D/Oncology', 'onc-123');
    expect(matchReviewState.abbvie.approved['item-1']).toBeDefined();
    expect(matchReviewState.abbvie.approved['item-1'].manualNode).toBe('Oncology');
    expect(matchReviewState.abbvie.approved['item-1'].manualNodeId).toBe('onc-123');
    expect(matchReviewState.abbvie.approved['item-1'].approvedAt).toBeTruthy();
  });

  it('removes from rejected when approving', () => {
    matchReviewState.abbvie = { approved: {}, rejected: { 'item-1': { rejectedAt: '2026-01-01' } }, manual: {} };
    approveMatch('abbvie', 'item-1', 'Oncology', '/path');
    expect(matchReviewState.abbvie.rejected['item-1']).toBeUndefined();
    expect(matchReviewState.abbvie.approved['item-1']).toBeDefined();
  });

  it('removes from manual when approving', () => {
    matchReviewState.abbvie = { approved: {}, rejected: {}, manual: { 'item-1': { manualNode: 'X', matchedAt: '2026-01-01' } } };
    approveMatch('abbvie', 'item-1', 'Oncology', '/path');
    expect(matchReviewState.abbvie.manual['item-1']).toBeUndefined();
  });
});

describe('rejectMatch', () => {
  it('adds item to rejected', () => {
    rejectMatch('abbvie', 'item-2');
    expect(matchReviewState.abbvie.rejected['item-2']).toBeDefined();
    expect(matchReviewState.abbvie.rejected['item-2'].rejectedAt).toBeTruthy();
  });

  it('removes from approved when rejecting', () => {
    matchReviewState.abbvie = { approved: { 'item-2': { manualNode: 'X', approvedAt: '2026-01-01' } }, rejected: {}, manual: {} };
    rejectMatch('abbvie', 'item-2');
    expect(matchReviewState.abbvie.approved['item-2']).toBeUndefined();
    expect(matchReviewState.abbvie.rejected['item-2']).toBeDefined();
  });
});

describe('manualMatch', () => {
  it('adds item to manual', () => {
    manualMatch('gsk', 'item-3', 'Immunology', '/R&D/Immunology');
    expect(matchReviewState.gsk.manual['item-3']).toBeDefined();
    expect(matchReviewState.gsk.manual['item-3'].manualNode).toBe('Immunology');
    expect(matchReviewState.gsk.manual['item-3'].matchedAt).toBeTruthy();
  });
});

describe('resetMatchItem', () => {
  it('removes from all categories', () => {
    matchReviewState.lilly = {
      approved: { 'item-4': { manualNode: 'A', approvedAt: '2026-01-01' } },
      rejected: {},
      manual: {},
    };
    resetMatchItem('lilly', 'item-4');
    expect(matchReviewState.lilly.approved['item-4']).toBeUndefined();
    expect(matchReviewState.lilly.rejected['item-4']).toBeUndefined();
    expect(matchReviewState.lilly.manual['item-4']).toBeUndefined();
  });
});

describe('state transitions', () => {
  it('approve → reject: item is ONLY in rejected', () => {
    approveMatch('abbvie', 'item-5', 'Node', '/path');
    expect(matchReviewState.abbvie.approved['item-5']).toBeDefined();

    rejectMatch('abbvie', 'item-5');
    expect(matchReviewState.abbvie.approved['item-5']).toBeUndefined();
    expect(matchReviewState.abbvie.rejected['item-5']).toBeDefined();
  });

  it('reject → approve: item is ONLY in approved', () => {
    rejectMatch('abbvie', 'item-6');
    approveMatch('abbvie', 'item-6', 'Node', '/path');
    expect(matchReviewState.abbvie.rejected['item-6']).toBeUndefined();
    expect(matchReviewState.abbvie.approved['item-6']).toBeDefined();
  });

  it('approve → reset → pending (not in any category)', () => {
    approveMatch('abbvie', 'item-7', 'Node', '/path');
    resetMatchItem('abbvie', 'item-7');
    expect(matchReviewState.abbvie.approved['item-7']).toBeUndefined();
    expect(matchReviewState.abbvie.rejected['item-7']).toBeUndefined();
    expect(matchReviewState.abbvie.manual['item-7']).toBeUndefined();
  });

  it('cross-company isolation: approving in abbvie does not affect gsk', () => {
    approveMatch('abbvie', 'item-8', 'Node', '/path');
    expect(matchReviewState.gsk).toBeUndefined();
  });
});
