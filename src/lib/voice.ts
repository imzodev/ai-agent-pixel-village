// Voice chat rules. Pure: every number, who pairs with whom, what a set-up
// message may carry, and how much relay traffic a pair costs.
//
// Audio never touches the game server: it's WebRTC through Cloudflare's TURN
// relay, relay-only, so players only ever see the relay's address. The
// server's job is deciding pairs (players near each other, or friends in a
// voice party; never blocked either way) and passing SDP / ICE between
// pairs only, cleaned by `sanitizeSdp` / `sanitizeCandidate`.

import { buildGrid, nearby } from "@/lib/spatialGrid";
import type { VoiceCandidate, VoicePair, VoicePeer, VoicePeerDiff, VoicePlayer, VoiceSdp } from "@/types/voice";

const TILE = 16;

/** A pair forms within this distance... */
export const VOICE_JOIN_PX = 16 * TILE;
/** ...and holds until they're this far apart (so it doesn't flap at the edge). */
export const VOICE_DROP_PX = 20 * TILE;
/** Full volume this close; silent from VOICE_HEAR_PX. */
export const VOICE_FULL_PX = 4 * TILE;
export const VOICE_HEAR_PX = 16 * TILE;
/** At most this many nearby players connected to one player (party members don't count). */
export const VOICE_MAX_NEAR = 8;
/** Friends in one voice party, at most. */
export const PARTY_MAX = 6;
/** A party invite lapses after this long. */
export const INVITE_MS = 2 * 60_000;
/** One invite per player this often. */
export const INVITE_EVERY_MS = 3000;
/** A party nobody is in (all disconnected) is dropped after this long. */
export const PARTY_EMPTY_MS = 5 * 60_000;
/** How often the server re-pairs. */
export const VOICE_TICK_MS = 1000;
/** Signaling per player: this many messages a second, bursts up to RTC_BURST. */
export const RTC_PER_SEC = 30;
export const RTC_BURST = 60;
/** Relay credentials last this long; renewed this long before they run out; minted at most this often. */
export const ICE_TTL_S = 2 * 60 * 60;
export const ICE_RENEW_MS = 10 * 60_000;
export const ICE_MINT_EVERY_MS = 60_000;
/** The most a browser sends (Opus), bits a second. */
export const VOICE_MAX_BITRATE = 24_000;
/**
 * What one direction of a pair costs in relay egress, bits a second, on
 * average: 24 kbps Opus plus packet and TURN overhead while talking, far
 * less in silence (DTX). On the high side, so the cap errs towards free.
 */
export const EST_BPS = 40_000;
/** Who's been in voice with whom is kept this long (reports). */
export const PAIR_LOG_MS = 15 * 60_000;

export const SDP_MAX = 8192;
export const CANDIDATE_MAX = 512;

export const pairKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * Who should be connected now. Friends in one party always (any distance);
 * then nearby players: pairs already up are kept while within VOICE_DROP_PX
 * (first), new ones form within VOICE_JOIN_PX nearest first, while both
 * sides have room under VOICE_MAX_NEAR. Never a pair `blocked` says no to.
 */
export function pickPairs(
  players: readonly VoicePlayer[],
  current: ReadonlyMap<string, VoicePair>,
  blocked: (a: number, b: number) => boolean,
  partyOf: ReadonlyMap<number, number>,
): Map<string, VoicePair> {
  const next = new Map<string, VoicePair>();
  const byParty = new Map<number, VoicePlayer[]>();
  for (const p of players) {
    const party = partyOf.get(p.id);
    if (party == null) continue;
    const list = byParty.get(party);
    if (list) list.push(p); else byParty.set(party, [p]);
  }
  for (const list of byParty.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = Math.min(list[i].id, list[j].id), b = Math.max(list[i].id, list[j].id);
      if (!blocked(a, b)) next.set(pairKey(a, b), { a, b, party: true });
    }
  }

  const grid = buildGrid(players, (p) => p, VOICE_DROP_PX);
  const cands: { key: string; a: number; b: number; d: number; kept: boolean }[] = [];
  for (const p of players) {
    for (const q of nearby(grid, p.x, p.y, VOICE_DROP_PX)) {
      if (q.id <= p.id) continue;
      const key = pairKey(p.id, q.id);
      if (next.has(key)) continue;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      const kept = current.has(key);
      if (d > (kept ? VOICE_DROP_PX : VOICE_JOIN_PX)) continue;
      if (blocked(p.id, q.id)) continue;
      cands.push({ key, a: p.id, b: q.id, d, kept });
    }
  }
  cands.sort((x, y) => (x.kept === y.kept ? x.d - y.d : x.kept ? -1 : 1));
  const count = new Map<number, number>();
  for (const c of cands) {
    const na = count.get(c.a) ?? 0, nb = count.get(c.b) ?? 0;
    if (na >= VOICE_MAX_NEAR || nb >= VOICE_MAX_NEAR) continue;
    count.set(c.a, na + 1);
    count.set(c.b, nb + 1);
    next.set(c.key, { a: c.a, b: c.b, party: false });
  }
  return next;
}

/** Each player's changes between two pairings. A pair that changed kind (party ↔ nearby) is sent as an add again. */
export function diffPairs(prev: ReadonlyMap<string, VoicePair>, next: ReadonlyMap<string, VoicePair>): Map<number, VoicePeerDiff> {
  const out = new Map<number, VoicePeerDiff>();
  const of = (id: number) => {
    let d = out.get(id);
    if (!d) { d = { add: [], drop: [] }; out.set(id, d); }
    return d;
  };
  const peer = (id: number, other: number, party: boolean): VoicePeer => ({ id: other, polite: id < other, party });
  for (const [k, p] of next) {
    const was = prev.get(k);
    if (was && was.party === p.party) continue;
    of(p.a).add.push(peer(p.a, p.b, p.party));
    of(p.b).add.push(peer(p.b, p.a, p.party));
  }
  for (const [k, p] of prev) {
    if (next.has(k)) continue;
    of(p.a).drop.push(p.b);
    of(p.b).drop.push(p.a);
  }
  return out;
}

/**
 * An SDP offer / answer as it may pass between two players, or null. Audio
 * only (no video, no data channel), not too big. When `relayOnly`, every
 * candidate but the relay's is taken out and the connection lines are
 * blanked, so no player's own address can travel even from a tampered client.
 */
export function sanitizeSdp(raw: unknown, relayOnly: boolean): VoiceSdp | null {
  if (!raw || typeof raw !== "object") return null;
  const { type, sdp } = raw as { type?: unknown; sdp?: unknown };
  if (type !== "offer" && type !== "answer") return null;
  if (typeof sdp !== "string" || sdp.length === 0 || sdp.length > SDP_MAX) return null;
  if (!sdp.startsWith("v=0")) return null;
  const lines = sdp.split(/\r?\n/);
  const out: string[] = [];
  let media = 0;
  for (const line of lines) {
    if (line.startsWith("m=")) {
      if (!line.startsWith("m=audio ")) return null;
      media++;
    }
    if (relayOnly) {
      if (line.startsWith("a=candidate:")) {
        if (/ typ relay(\s|$)/.test(line)) out.push(scrubRaddr(line));
        continue;
      }
      if (line.startsWith("c=IN IP4 ")) { out.push("c=IN IP4 0.0.0.0"); continue; }
      if (line.startsWith("c=IN IP6 ")) { out.push("c=IN IP6 ::"); continue; }
      if (line.startsWith("a=rtcp:")) { out.push(line.replace(/^a=rtcp:(\d+).*$/, "a=rtcp:$1 IN IP4 0.0.0.0")); continue; }
    }
    out.push(line);
  }
  if (media === 0 || media > 2) return null;
  return { type, sdp: out.join("\r\n") };
}

/**
 * A relay candidate's `raddr` is the sender's own public address (what the
 * relay saw it as). It's informational only, never used to connect: blank it.
 */
export const scrubRaddr = (line: string): string => line.replace(/ raddr \S+ rport \d+/, " raddr 0.0.0.0 rport 0");

/** A trickled ICE candidate as it may pass, or null (dropped). `{ candidate: "" }` is end-of-candidates. */
export function sanitizeCandidate(raw: unknown, relayOnly: boolean): VoiceCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const { candidate, sdpMid, sdpMLineIndex } = raw as { candidate?: unknown; sdpMid?: unknown; sdpMLineIndex?: unknown };
  if (typeof candidate !== "string" || candidate.length > CANDIDATE_MAX) return null;
  const mid = typeof sdpMid === "string" && sdpMid.length <= 32 ? sdpMid : null;
  const index = typeof sdpMLineIndex === "number" && Number.isInteger(sdpMLineIndex) && sdpMLineIndex >= 0 && sdpMLineIndex < 4 ? sdpMLineIndex : null;
  if (candidate === "") return { candidate, sdpMid: mid, sdpMLineIndex: index };
  if (!candidate.startsWith("candidate:")) return null;
  if (!relayOnly) return { candidate, sdpMid: mid, sdpMLineIndex: index };
  if (!/ typ relay(\s|$)/.test(candidate)) return null;
  return { candidate: scrubRaddr(candidate), sdpMid: mid, sdpMLineIndex: index };
}

/** Estimated relay egress for this many pair-seconds (both directions). */
export const relayBytes = (pairSeconds: number): number => Math.round((pairSeconds * 2 * EST_BPS) / 8);

/** The UTC month a usage tally belongs to ("2026-11"). */
export const usageMonth = (now: number): string => new Date(now).toISOString().slice(0, 7);

/** Whether this month's relay traffic has reached the cap (GB = 1e9 bytes). */
export const overQuota = (bytes: number, capGb: number): boolean => bytes >= capGb * 1e9;

/** Volume for a nearby player at distance `d` (party members: always 1). Linear from full to silent. */
export function gainAt(d: number): number {
  if (d <= VOICE_FULL_PX) return 1;
  if (d >= VOICE_HEAR_PX) return 0;
  return 1 - (d - VOICE_FULL_PX) / (VOICE_HEAR_PX - VOICE_FULL_PX);
}

/** Left-right pan for a speaker `dx` px to your side (−1…1, gentle). */
export const panAt = (dx: number): number => Math.max(-0.8, Math.min(0.8, dx / VOICE_HEAR_PX));

/** Token bucket: whether one more signaling message may go now (mutates the bucket). */
export function takeToken(b: { rtcTokens: number; rtcAt: number }, now: number): boolean {
  b.rtcTokens = Math.min(RTC_BURST, b.rtcTokens + ((now - b.rtcAt) / 1000) * RTC_PER_SEC);
  b.rtcAt = now;
  if (b.rtcTokens < 1) return false;
  b.rtcTokens -= 1;
  return true;
}

/** Cloudflare's ICE servers, minus port-53 TURN URLs (browsers block that port, so they only time out). */
export function cleanIceServers(servers: readonly { urls: string | string[]; username?: string; credential?: string }[]): { urls: string[]; username?: string; credential?: string }[] {
  return servers
    .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === "string" && !/:53(\?|$)/.test(u)) }))
    .filter((s) => s.urls.length > 0);
}
