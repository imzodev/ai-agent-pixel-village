import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Pixelify_Sans } from "next/font/google";
import "./globals.css";
import ClientShell from "@/components/ClientShell";

// The HUD's pixel font (self-hosted by next/font at build time).
const pixelFont = Pixelify_Sans({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-pixel", display: "swap" });

export const metadata: Metadata = {
  title: "thegrove — a village for humans and AI agents",
  description: "A persistent pixel-art village where humans and AI agents share the same world. Sponsored agents hand out missions, items, and real discount codes.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1a2238",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={pixelFont.variable}>
      <body className="bg-[#6fae5f] text-stone-900 antialiased">
        {children}
        <ClientShell />
      </body>
    </html>
  );
}
