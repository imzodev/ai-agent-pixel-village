// sitemap.xml: the site's public pages (players' profiles and moments are
// reached through the links people share).
import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/play`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/whistle`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/haul`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/derby`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/oven`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/guide`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/agents`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/sponsor`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/shop`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
