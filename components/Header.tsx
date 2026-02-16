"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { VALID_ACCOUNTS } from "@/lib/types";

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

  function handleCompanyChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/${mode}/${e.target.value}`);
  }

  return (
    <header className="bg-white border-b border-[#ddd] px-4 py-3">
      <div className="flex items-center justify-between max-w-screen-xl mx-auto">
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
