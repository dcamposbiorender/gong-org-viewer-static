// Phase 1a: Vite module entry point (shim layer).
// Old JS files still load via <script> tags in index.html.
// Phase 1b will migrate them here as ES module imports.

import type { CompanyData, MatchReviewData } from './types';

// Declare globals from legacy <script> tags so TS knows about them
declare global {
  // eslint-disable-next-line no-var
  var DATA: Record<string, CompanyData>;
  // eslint-disable-next-line no-var
  var MANUAL_DATA: Record<string, CompanyData>;
  // eslint-disable-next-line no-var
  var MATCH_REVIEW_DATA: MatchReviewData | undefined;
}

console.log('[Vite] Module system initialized');
