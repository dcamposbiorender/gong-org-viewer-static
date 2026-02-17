"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { VALID_ACCOUNTS } from "@/lib/types";
import { useRefreshStore } from "@/lib/refresh-store";

function parseRoute(pathname: string): { company: string; mode: string } {
  // e.g. /manual/astrazeneca → { mode: "manual", company: "astrazeneca" }
  // e.g. /match-review/gsk → { mode: "match-review", company: "gsk" }
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return { mode: parts[0], company: parts[1] };
  }
  return { mode: "manual", company: "astrazeneca" };
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { company, mode } = parseRoute(pathname);
  const { onRefresh, refreshing } = useRefreshStore();

  function handleCompanyChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/${mode}/${e.target.value}`);
  }

  return (
    <header className="bg-white border-b border-[#ddd] px-4 py-3">
      <div className="flex items-center justify-between max-w-[1600px] mx-auto">
        {/* Left: title + company selector */}
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-gray-900">
            Org Chart Viewer
          </h1>
          <select
            value={company}
            onChange={handleCompanyChange}
            className="text-lg font-semibold bg-transparent border-none cursor-pointer focus:outline-none appearance-none"
          >
            {VALID_ACCOUNTS.map((acct) => (
              <option key={acct} value={acct}>
                {acct.charAt(0).toUpperCase() + acct.slice(1)}
              </option>
            ))}
          </select>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="ml-1 px-2 py-1 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded disabled:opacity-50 transition-colors flex items-center gap-1"
              title="Refresh all data"
            >
              {refreshing ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <>
                  <span className="text-lg leading-none">&#8635;</span>
                  <span className="text-xs font-medium uppercase tracking-wide">Refresh</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Right: mode tabs */}
        <nav className="flex gap-1">
          <Link
            href={`/manual/${company}`}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              mode === "manual"
                ? "bg-[#1a1a1a] text-white"
                : "text-[#666] hover:bg-[#f5f5f5]"
            }`}
          >
            Org Map
          </Link>
          <Link
            href={`/match-review/${company}`}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              mode === "match-review"
                ? "bg-[#1a1a1a] text-white"
                : "text-[#666] hover:bg-[#f5f5f5]"
            }`}
          >
            Match Review
          </Link>
        </nav>
      </div>
    </header>
  );
}
