import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Pixelify_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import ClientShell from "@/components/ClientShell";

// The HUD's pixel font (self-hosted by next/font at build time).
const pixelFont = Pixelify_Sans({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-pixel", display: "swap" });
// Pixelify's digits are easy to misread (5 ≈ S, 0 ≈ O), so numbers use
// VT323's: a digits-only subset (fonts/VT323-OFL.txt), scoped to 0–9 by
// unicode-range and scaled to Pixelify's digit height. No fallback face,
// so every other character falls through to Pixelify.
const digitFont = localFont({
  src: "./fonts/vt323-digits.woff2",
  variable: "--font-digits",
  display: "swap",
  adjustFontFallback: false,
  declarations: [
    { prop: "unicode-range", value: "U+0030-0039" },
    { prop: "size-adjust", value: "118%" },
  ],
});

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
    <html lang="en" className={`${pixelFont.variable} ${digitFont.variable}`}>
      <body className="bg-[#6fae5f] text-stone-900 antialiased">
        {children}
        <ClientShell />
      </body>
    </html>
  );
}
