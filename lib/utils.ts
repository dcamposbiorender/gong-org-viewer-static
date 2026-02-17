// Pure utility functions — no dependencies on app state or DOM.

import { VALID_ACCOUNTS, type ValidAccount } from "./types";

export function safeJsonParse<T>(str: string | null, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export function sanitizeUrl(url: unknown): string {
  if (!url) return "#";
  const str = String(url).trim();
  if (str.startsWith("http://") || str.startsWith("https://")) return str;
  if (str.startsWith("/")) return str;
  return "#";
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function isInDateRange(
  dateStr: string,
  rangeStart?: string,
  rangeEnd?: string
): boolean {
  if (!rangeStart || !rangeEnd) return true;
  const d = new Date(dateStr);
  return d >= new Date(rangeStart) && d <= new Date(rangeEnd);
}

export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[.,;:!?]/g, "")
    .replace(/\b(group|inc|ltd|llc|corp|corporation|limited)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getDateFromPercent(
  percent: number,
  dataRange: { start: string; end: string }
): string {
  const start = new Date(dataRange.start).getTime();
  const end = new Date(dataRange.end).getTime();
  const date = new Date(start + (end - start) * (percent / 100));
  return date.toISOString().split("T")[0];
}

export function truncateSnippet(text: string | undefined, maxLength = 150): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

export function isValidCompany(company: string): company is ValidAccount {
  return VALID_ACCOUNTS.includes(company.toLowerCase() as ValidAccount);
}

/** Generate a KV key for size overrides. */
export function getSizeOverrideKey(company: string, nodeId: string): string {
  return `${company}:${nodeId}`.toLowerCase();
}

/** Generate a KV key for conflict resolutions. */
export function getResolutionKey(
  company: string,
  entityId: string,
  leaderName: string
): string {
  return `${company}:${entityId}:${leaderName}`.toLowerCase();
}
