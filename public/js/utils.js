// Pure utility functions

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

function isModalOpen() {
  const modals = document.querySelectorAll('[id$="Modal"]');
  for (const m of modals) {
    if (m.style.display === 'flex' || m.style.display === 'block') return true;
  }
  return false;
}
