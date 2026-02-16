import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-screen-xl mx-auto p-4 text-center mt-20">
      <h2 className="text-2xl font-semibold mb-2">Not Found</h2>
      <p className="text-gray-500 mb-4">
        That company or page doesn&apos;t exist.
      </p>
      <Link
        href="/manual/astrazeneca"
        className="text-blue-600 hover:underline"
      >
        Go to AstraZeneca
      </Link>
    </div>
  );
}
