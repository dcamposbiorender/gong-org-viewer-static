import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import { ToastProvider } from "@/components/Toast";

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
      <body className="bg-[#fefdfb] text-gray-900 min-h-screen font-serif">
        <ToastProvider>
          <Header />
          <main className="max-w-[1600px] mx-auto px-2 py-4">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
