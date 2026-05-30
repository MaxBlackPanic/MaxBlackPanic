import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AITokenBurn — AI prompt cost & efficiency calculator",
  description:
    "Predict token usage, dollar cost, and prompt efficiency across every major frontier model. Trusted by finance and platform teams for monthly budget forecasting.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
