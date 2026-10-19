"use client";
// On a visitor's first page view: note where they came from (src/lib/acquisition.ts)
// in a 30-day cookie, so their signup can be credited to it, and record the
// landing for the stats. First visit only; nothing personal is sent.
import { useEffect } from "react";
import { SRC_COOKIE } from "@/lib/site";
import { encodeAcquisition, landingSource } from "@/lib/acquisition";

export default function SourceMark() {
  useEffect(() => {
    try {
      if (document.cookie.includes(`${SRC_COOKIE}=`)) return;
      const q = new URLSearchParams(location.search);
      const from = landingSource({ ref: q.get("ref"), utmSource: q.get("utm_source"), utmCampaign: q.get("utm_campaign"), referrer: document.referrer, ownHost: location.hostname });
      document.cookie = `${SRC_COOKIE}=${encodeURIComponent(encodeAcquisition(from))}; max-age=${30 * 86400}; path=/; samesite=lax`;
      void fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "landing", ...from }), keepalive: true }).catch(() => {});
    } catch { /* cookies blocked: nothing to note */ }
  }, []);
  return null;
}
