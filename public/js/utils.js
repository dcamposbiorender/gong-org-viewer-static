// Pure utility functions

// Safe JSON parse with fallback — prevents app crash on corrupted localStorage
function safeJsonParse(str, fallback = null) {
  try { return JSON.parse(str); }
  catch (e) { console.warn('[safeJsonParse] Failed:', e.message); return fallback; }
}

function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Validate URL is safe for href (blocks javascript:, data:, etc.)
function sanitizeUrl(url) {
  if (!url) return '#';
  const str = String(url).trim();
  if (str.startsWith('http://') || str.startsWith('https://')) return str;
  if (str.startsWith('/')) return str;
  return '#';
}

// Start editing a Manual Map node

function getDateFromPercent(percent, dataRange) {
  const start = new Date(dataRange.start).getTime();
  const end = new Date(dataRange.end).getTime();
  const date = new Date(start + (end - start) * (percent / 100));
  return date.toISOString().split('T')[0];
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function isInDateRange(dateStr, rangeStart, rangeEnd) {
  if (!rangeStart || !rangeEnd) return true; // No range = show all
  const d = new Date(dateStr);
  return d >= new Date(rangeStart) && d <= new Date(rangeEnd);
}


function normalizeEntityName(name) {
  return name.toLowerCase().trim()
    .replace(/[.,;:!?]/g, '')
    .replace(/\b(group|inc|ltd|llc|corp|corporation|limited)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ===== END MANAGE ENTITIES MODAL =====

// Truncate snippet text
function mrTruncateSnippet(text, maxLength = 150) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}


function showToast(message, type = 'info') {
  // Remove existing toast
  const existing = document.querySelector('.toast-message');
  if (existing) existing.remove();

  const bgColor = type === 'error' ? '#d32f2f' : type === 'success' ? '#2e7d32' : '#333';
  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.style.cssText = `position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); background: ${bgColor}; color: white; padding: 12px 24px; border-radius: 8px; z-index: 10000; font-size: 14px;`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), type === 'error' ? 4000 : 2000);
}


function boldSizeMentions(text) {
  if (!text) return '';
  // Match patterns like "10 people", "~30", "100+", "50-60", etc.
  return text.replace(/(\d+[\s-]*(?:to|-)?\s*\d*\s*(?:people|person|scientists|folks|team members|headcount|FTEs?|licenses?)|\~?\d+\+?)/gi, '<strong>$1</strong>');
}

// Show evidence for manual node
// Get approved match items for a manual node

// Batch all pending connector width measurements in a single rAF (avoids layout thrashing)
function flushConnectorMeasurements() {
  requestAnimationFrame(() => {
    const pending = window._pendingConnectorMeasurements || [];
    window._pendingConnectorMeasurements = [];
    // Batch all reads first
    const measurements = pending.map(el => {
      const first = el.firstElementChild;
      const last = el.lastElementChild;
      if (first && last) {
        const firstRect = first.getBoundingClientRect();
        const lastRect = last.getBoundingClientRect();
        return { el, hw: ((lastRect.left + lastRect.width/2) - (firstRect.left + firstRect.width/2)) / 2 };
      }
      return null;
    }).filter(Boolean);
    // Then batch all writes
    measurements.forEach(({ el, hw }) => el.style.setProperty('--half-width', hw + 'px'));
  });
}

function isModalOpen() {
  const modals = document.querySelectorAll('[id$="Modal"]');
  for (const m of modals) {
    if (m.style.display === 'flex' || m.style.display === 'block') return true;
  }
  return false;
}
