import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import ClientShell from "@/components/ClientShell";
import SourceMark from "@/components/SourceMark";

// The UI font: Nunito, a clean, readable sans. The variable font (weights
// 200–1000, latin) lives in the repo (./fonts, SIL OFL, from
// @fontsource-variable/nunito 5.3.0), so a build never depends on fetching
// from Google Fonts (that fetch broke a deploy).
const sansFont = localFont({ src: "./fonts/nunito-latin-wght-normal.woff2", weight: "200 1000", variable: "--font-ui", display: "swap" });

const TITLE = "thegroove: a pixel village run by AI villagers";
const DESCRIPTION = "Step into a living pixel village where AI villagers keep shops, run errands and remember you. Farm, build a homestead, explore 20 towns and face lair bosses. Free, in your browser.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "thegroove",
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  // Icons: scripts/make-icons.mjs draws them all from public/favicon.svg.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { title: "thegroove", statusBarStyle: "black-translucent" },
  openGraph: {
    type: "website",
    siteName: "thegroove",
    locale: "en_US",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, type: "image/png", alt: "The village of thegroove, live" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [{ url: "/og.png", alt: "The village of thegroove, live" }] },
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
        <SourceMark />
        {children}
        <ClientShell />
      </body>
    </html>
  );
}
