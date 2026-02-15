// Phase 1a: Vite module entry point (shim layer).
// Old JS files still load via <script> tags in index.html.
// Phase 1b will migrate them here as ES module imports.
//
// Global type declarations for legacy DATA/MANUAL_DATA/MATCH_REVIEW_DATA
// are in globals.d.ts (auto-included by tsconfig).

if (import.meta.env.DEV) {
  console.log('[Vite] Module system initialized');
}
