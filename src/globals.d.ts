// Global type declarations for legacy <script> tag variables.
// These are set by pipeline-generated JS files (data.js, manual-data.js, match-review-data.js)
// loaded via <script> tags before the Vite module entry point.

import type { CompanyData, MatchReviewData } from './types';

declare global {
  // eslint-disable-next-line no-var
  var DATA: Record<string, CompanyData>;
  // eslint-disable-next-line no-var
  var MANUAL_DATA: Record<string, CompanyData>;
  // eslint-disable-next-line no-var
  var MATCH_REVIEW_DATA: MatchReviewData | undefined;
}
