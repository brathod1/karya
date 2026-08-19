import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Karya — small business operations",
  description: "Replace the spreadsheet you run your business on.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0F766E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /**
     * `suppressHydrationWarning` on <html> and <body> only.
     *
     * Browser extensions — Grammarly, password managers, translators — write
     * their own attributes onto these two elements before React hydrates, which
     * React then reports as a mismatch. It is noise, and it drowns out genuine
     * hydration bugs.
     *
     * The suppression applies to these elements' own attributes and nothing
     * else: every component inside still reports mismatches normally.
     */
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
