// The stats dashboard lives at a secret address: ADMIN_PAGE_PATH, one or
// more segments ("pescado/pollo", slashes at either end are ignored), at least
// 12 characters; `openssl rand -hex 12` makes a good one. Every other address
// that isn't a real page lands here and gets the normal 404, so the dashboard
// can't be found by guessing. It still asks for the admin token (ADMIN_TOKEN)
// before showing anything.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import crypto from "node:crypto";
import StatsDashboard from "@/components/StatsDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "thegroove", robots: { index: false, follow: false } };

/** "/pescado/pollo/" → "pescado/pollo". */
const trimSlashes = (p: string) => p.replace(/^\/+|\/+$/g, "");

/** Is this the dashboard's address? (Constant time; off when unset or too short.) */
function isDashboardPath(path: string): boolean {
  const want = trimSlashes(process.env.ADMIN_PAGE_PATH ?? "");
  if (want.length < 12) return false;
  const slug = trimSlashes(path);
  const a = crypto.createHash("sha256").update(slug).digest();
  const b = crypto.createHash("sha256").update(want).digest();
  return crypto.timingSafeEqual(a, b);
}

export default async function SecretPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  if (!isDashboardPath(slug.map(decodeURIComponent).join("/"))) notFound();
  return <StatsDashboard />;
}
