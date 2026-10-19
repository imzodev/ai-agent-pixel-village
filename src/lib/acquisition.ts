// Where visitors come from, for the stats (GET /api/admin/stats): a link's
// own tag (?ref=x, or utm_source / utm_campaign), else the page that sent
// them (t.co → x, reddit.com → reddit…), else "direct". Recorded once, on a
// visitor's first page view (src/components/SourceMark.tsx), and carried to
// their signup by a cookie. First-party only; no personal data. Pure.

import type { Acquisition } from "@/types/analytics";

export type { Acquisition } from "@/types/analytics";

/** A tag as we store it: lowercase letters, digits, - and _, at most 24 characters (else nothing). */
export function cleanTag(raw: unknown): string {
  const t = String(raw ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
  return t;
}

/** Referring hosts we name; anything else is "other". */
const HOSTS: readonly [RegExp, string][] = [
  [/(^|\.)(t\.co|x\.com|twitter\.com)$/, "x"],
  [/(^|\.)reddit\.com$|(^|\.)redd\.it$/, "reddit"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)(facebook\.com|fb\.me|fb\.com)$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(discord\.com|discord\.gg|discordapp\.com)$/, "discord"],
  [/(^|\.)news\.ycombinator\.com$/, "hackernews"],
  [/(^|\.)itch\.io$/, "itch"],
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, "linkedin"],
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
];

/** The source a referring page means ("" for none or our own site). */
export function sourceFromReferrer(referrer: string, ownHost: string): string {
  let host: string;
  try { host = new URL(referrer).hostname.toLowerCase(); } catch { return ""; }
  if (!host || host === ownHost.toLowerCase()) return "";
  return HOSTS.find(([re]) => re.test(host))?.[1] ?? "other";
}

/** Where this visit came from: the link's own tag first, then the referring page, else "direct". */
export function landingSource(o: { ref?: string | null; utmSource?: string | null; utmCampaign?: string | null; referrer?: string; ownHost: string }): Acquisition {
  const tagged = cleanTag(o.ref) || cleanTag(o.utmSource);
  const src = tagged || sourceFromReferrer(o.referrer ?? "", o.ownHost) || "direct";
  return { src, campaign: cleanTag(o.utmCampaign) };
}

/** The cookie's value, and back. */
export const encodeAcquisition = (a: Acquisition): string => `${cleanTag(a.src) || "direct"}|${cleanTag(a.campaign)}`;
export function decodeAcquisition(v: string | undefined | null): Acquisition | null {
  if (!v) return null;
  let raw: string;
  try { raw = decodeURIComponent(v); } catch { return null; } // a mangled cookie: no source, never an error
  const [src, campaign = ""] = raw.split("|");
  const s = cleanTag(src);
  return s ? { src: s, campaign: cleanTag(campaign) } : null;
}
