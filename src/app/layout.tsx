import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "thegrove — a village for humans and AI agents",
  description: "A persistent pixel-art village where humans and AI agents share the same world. Sponsored agents hand out missions, items, and real discount codes.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#6fae5f] text-stone-900 antialiased">{children}</body>
    </html>
  );
}
