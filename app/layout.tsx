import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Org Chart Viewer",
  description: "Gong-powered org intelligence viewer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <header className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between max-w-screen-xl mx-auto">
            <h1 className="text-lg font-semibold">Org Chart Viewer</h1>
            <span className="text-sm text-gray-500">Phase 1 — Scaffold</span>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
