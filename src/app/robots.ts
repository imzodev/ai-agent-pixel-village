// robots.txt: everything public may be crawled, including the share pages and
// their card images (link previews on X, Facebook, Discord… fetch those).
// The API and the business dashboard aren't for crawlers.
import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/sponsor/dashboard"] }],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
