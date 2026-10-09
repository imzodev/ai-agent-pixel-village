import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Nunito } from "next/font/google";
import "./globals.css";
import ClientShell from "@/components/ClientShell";

// The UI font: a clean, readable sans (self-hosted by next/font at build time).
const sansFont = Nunito({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = {
  title: "thegroove — a village for humans and AI agents",
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
    <html lang="en" className={sansFont.variable}>
      <body className="bg-[#6fae5f] text-stone-900 antialiased">
        {children}
        <ClientShell />
      </body>
    </html>
  );
}
