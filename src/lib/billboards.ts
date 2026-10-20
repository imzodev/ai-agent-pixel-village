// Billboards: ad spaces in the world anyone can rent (an indie game, a shop,
// a streamer), a poster of their own on a board by the village plaza, a town
// square or a road. Pure: spots, prices and the rules both the server
// (src/lib/billboardServer.ts) and the client (src/game/billboardArt.ts) use.
//
// Spots come from scripts/gen-billboard-spots.ts (→ billboardSpotsData.json)
// and are pinned like towns: rentals hang off their keys.

import DATA from "./billboardSpotsData.json";
import type { AdLinkResult, BillboardHold, BillboardSpotDef, BillboardTier, BillboardTierDef } from "@/types/billboard";

export type { BillboardSnapshot, BillboardSpotDef, BillboardTier } from "@/types/billboard";

export const BILLBOARD_TIERS: Readonly<Record<BillboardTier, BillboardTierDef>> = {
  plaza: { label: "Village plaza", priceCents: 4900, blurb: "Where every new player starts. The busiest spot in the world." },
  town: { label: "Town square", priceCents: 1900, blurb: "By a town's square, where travellers rest, trade and take bounties." },
  roadside: { label: "Roadside", priceCents: 900, blurb: "Beside a road out of the village, passed by everyone heading out." },
};

/** A board's size in tiles. The poster fills its window (POSTER_W × POSTER_H px). */
export const BOARD_W = 7;
export const BOARD_H = 5;
/** The stored poster's size (twice the window, so it stays crisp when zoomed). */
export const POSTER_W = 192;
export const POSTER_H = 96;
/** The poster window in the board art (px from the board's top-left). */
export const POSTER_WINDOW = { x: 8, y: 6, w: 96, h: 48 };

/** A checkout nobody finished stops holding its spot after this. */
export const PENDING_HOLD_MS = 60 * 60_000;

export const BILLBOARD_SPOTS: readonly BillboardSpotDef[] = DATA as BillboardSpotDef[];
const byKey = new Map(BILLBOARD_SPOTS.map((s) => [s.key, s]));
export const spotByKey = (key: string): BillboardSpotDef | undefined => byKey.get(key);

/** Tiles the board stands on (its base row blocks; you walk behind the rest). */
export function spotBlocks(s: BillboardSpotDef): { tx: number; ty: number }[] {
  return Array.from({ length: BOARD_W }, (_, i) => ({ tx: s.tx + i, ty: s.ty + BOARD_H - 1 }));
}

/** Every billboard's blocked tiles (the same on server and client). */
export function billboardBlocks(): { tx: number; ty: number }[] {
  return BILLBOARD_SPOTS.flatMap(spotBlocks);
}

/** Where you stand to read it: in front, in the middle (world px). */
export function spotPoint(s: BillboardSpotDef): { x: number; y: number } {
  return { x: (s.tx + BOARD_W / 2) * 16, y: (s.ty + BOARD_H) * 16 + 8 };
}

/** The board's foot (its depth in the world, px). */
export const spotFootY = (s: BillboardSpotDef): number => (s.ty + BOARD_H) * 16;

/** Whether a rental keeps its spot from others: paid ones do, unpaid ones for a while. */
export function holdsSpot(r: BillboardHold, now: number): boolean {
  if (r.status === "review" || r.status === "active") return true;
  return r.status === "pending" && now - r.createdAt.getTime() < PENDING_HOLD_MS;
}

/** Whether any rental holds a spot. */
export const spotHeld = (rentals: readonly BillboardHold[], spotKey: string, now: number): boolean =>
  rentals.some((r) => r.spotKey === spotKey && holdsSpot(r, now));

const BLOCKED_HOST = /(^|\.)(localhost|local|internal|localdomain)$/i;
const IP_HOST = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i;

/**
 * An advertiser's link, made safe to send players to: http(s) to a public
 * hostname, no credentials, at most 200 characters. Tagged with
 * utm_source/utm_medium when it has no UTM tags of its own, so the advertiser
 * sees the visits in their analytics.
 */
export function cleanAdLink(raw: string): AdLinkResult {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Add the link players should visit." };
  if (text.length > 200) return { ok: false, error: "That link is too long (200 characters at most)." };
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, error: "That doesn't look like a web address." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "The link must be a web address (https://…)." };
  if (u.username || u.password) return { ok: false, error: "The link can't contain a username or password." };
  if (IP_HOST.test(u.hostname) || BLOCKED_HOST.test(u.hostname) || !u.hostname.includes(".")) return { ok: false, error: "The link must go to a public website." };
  if (![...u.searchParams.keys()].some((k) => k.startsWith("utm_"))) {
    u.searchParams.set("utm_source", "thegroove");
    u.searchParams.set("utm_medium", "billboard");
  }
  return { ok: true, url: u.toString() };
}

/** A poster file name as stored (sha-256 of the PNG). */
export const POSTER_FILE = /^[0-9a-f]{64}\.png$/;
export const posterUrl = (file: string): string => `/api/billboards/poster/${file}`;
