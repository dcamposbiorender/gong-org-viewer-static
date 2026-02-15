// Pure utility functions — no dependencies on app state

export function safeJsonParse<T>(str: string | null, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str); }
  catch (e) { console.warn('[safeJsonParse] Failed:', (e as Error).message); return fallback; }
}

export function escapeHtml(text: unknown): string {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function sanitizeUrl(url: unknown): string {
  if (!url) return '#';
  const str = String(url).trim();
  if (str.startsWith('http://') || str.startsWith('https://')) return str;
  if (str.startsWith('/')) return str;
  return '#';
}

export function getDateFromPercent(percent: number, dataRange: { start: string; end: string }): string {
  const start = new Date(dataRange.start).getTime();
  const end = new Date(dataRange.end).getTime();
  const date = new Date(start + (end - start) * (percent / 100));
  return date.toISOString().split('T')[0];
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function isInDateRange(dateStr: string, rangeStart?: string, rangeEnd?: string): boolean {
  if (!rangeStart || !rangeEnd) return true;
  const d = new Date(dateStr);
  return d >= new Date(rangeStart) && d <= new Date(rangeEnd);
}

export function normalizeEntityName(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[.,;:!?]/g, '')
    .replace(/\b(group|inc|ltd|llc|corp|corporation|limited)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mrTruncateSnippet(text: string | undefined, maxLength = 150): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function showToast(message: string, type: 'info' | 'error' | 'success' = 'info'): void {
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

export function boldSizeMentions(text: string | undefined): string {
  if (!text) return '';
  return text.replace(
    /(\d+[\s-]*(?:to|-)?\s*\d*\s*(?:people|person|scientists|folks|team members|headcount|FTEs?|licenses?)|\~?\d+\+?)/gi,
    '<strong>$1</strong>'
  );
}

export function flushConnectorMeasurements(): void {
  requestAnimationFrame(() => {
    const pending = (window as any)._pendingConnectorMeasurements || [];
    (window as any)._pendingConnectorMeasurements = [];
    const measurements = pending.map((el: HTMLElement) => {
      const first = el.firstElementChild;
      const last = el.lastElementChild;
      if (first && last) {
        const firstRect = first.getBoundingClientRect();
        const lastRect = last.getBoundingClientRect();
        return { el, hw: ((lastRect.left + lastRect.width / 2) - (firstRect.left + firstRect.width / 2)) / 2 };
      }
      return null;
    }).filter(Boolean);
    measurements.forEach(({ el, hw }: { el: HTMLElement; hw: number }) => el.style.setProperty('--half-width', hw + 'px'));
  });
}

export function isModalOpen(): boolean {
  const modals = document.querySelectorAll('[id$="Modal"]');
  for (const m of modals) {
    if ((m as HTMLElement).style.display === 'flex' || (m as HTMLElement).style.display === 'block') return true;
  }
  return false;
}
