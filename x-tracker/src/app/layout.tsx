import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "X Tracker — live feed",
  description:
    "Near-real-time tracker for a single X account, with a live feed and simple analytics.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface text-gray-200 antialiased">
        {children}
      </body>
    </html>
  );
}
