import { notFound } from "next/navigation";
import { VALID_ACCOUNTS } from "@/lib/types";

export default async function MatchReviewPage({
  params,
}: {
  params: Promise<{ company: string }>;
}) {
  const { company } = await params;

  if (!VALID_ACCOUNTS.includes(company as (typeof VALID_ACCOUNTS)[number])) {
    notFound();
  }

  return (
    <div className="max-w-screen-xl mx-auto p-4">
      <h2 className="text-xl font-semibold mb-4">
        Match Review — {company}
      </h2>
      <p className="text-gray-500">
        Match review table will be implemented in Phase 3.
      </p>
    </div>
  );
}
