// Where visitors come from: a link's own tag first, then the referring page, else "direct".
import { describe, expect, it } from "vitest";
import { cleanTag, decodeAcquisition, encodeAcquisition, landingSource, sourceFromReferrer } from "@/lib/acquisition";

const own = "thegroove.fun";

describe("where visitors come from", () => {
  it("a link's own tag wins: ?ref, then utm_source, with its campaign", () => {
    expect(landingSource({ ref: "x", referrer: "https://www.reddit.com/r/games", ownHost: own })).toEqual({ src: "x", campaign: "" });
    expect(landingSource({ utmSource: "TikTok", utmCampaign: "promo40", ownHost: own })).toEqual({ src: "tiktok", campaign: "promo40" });
  });
  it("otherwise the referring page: X's t.co, Reddit, search…, and our own pages don't count", () => {
    expect(sourceFromReferrer("https://t.co/abc123", own)).toBe("x");
    expect(sourceFromReferrer("https://x.com/someone/status/1", own)).toBe("x");
    expect(sourceFromReferrer("https://old.reddit.com/r/WebGames/", own)).toBe("reddit");
    expect(sourceFromReferrer("https://www.google.co.uk/", own)).toBe("google");
    expect(sourceFromReferrer("https://news.ycombinator.com/item?id=1", own)).toBe("hackernews");
    expect(sourceFromReferrer("https://someblog.example/post", own)).toBe("other");
    expect(sourceFromReferrer("https://thegroove.fun/guide", own)).toBe("");
    expect(sourceFromReferrer("", own)).toBe("");
    expect(landingSource({ referrer: "", ownHost: own })).toEqual({ src: "direct", campaign: "" });
  });
  it("tags are short and clean; the cookie round-trips", () => {
    expect(cleanTag(" X <script> ")).toBe("xscript");
    expect(cleanTag("a".repeat(40))).toHaveLength(24);
    expect(decodeAcquisition(encodeURIComponent(encodeAcquisition({ src: "x", campaign: "promo40" })))).toEqual({ src: "x", campaign: "promo40" });
    expect(decodeAcquisition("")).toBeNull();
    expect(decodeAcquisition("%%%")).toBeNull();
  });
});
