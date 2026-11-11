// Voice chat: who pairs with whom, what a set-up message may carry (no
// player's address ever), the relay budget, and the server's gate (set-up
// only passes between paired players).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PARTY_MAX, VOICE_DROP_PX, VOICE_JOIN_PX, VOICE_MAX_NEAR, cleanIceServers, diffPairs, gainAt, overQuota, pairKey, pickPairs, relayBytes,
  sanitizeCandidate, sanitizeSdp, takeToken,
} from "@/lib/voice";
import type { VoicePair, VoicePlayer } from "@/types/voice";

const dbRows = vi.hoisted(() => ({ queue: [] as unknown[][] }));
vi.mock("@/db", () => {
  const chain = () => {
    const p: Record<string, unknown> = {};
    for (const k of ["from", "innerJoin", "where", "limit", "orderBy"]) p[k] = () => p;
    p.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(dbRows.queue.shift() ?? []).then(res, rej);
    return p;
  };
  return { db: { select: () => chain(), insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [] }) }) }) } };
});

const none = () => false;
const at = (id: number, tx: number, ty = 0): VoicePlayer => ({ id, x: tx * 16, y: ty * 16 });

describe("pairing", () => {
  it("pairs players within reach, not beyond", () => {
    const pairs = pickPairs([at(1, 0), at(2, 10), at(3, 40)], new Map(), none, new Map());
    expect([...pairs.keys()]).toEqual(["1:2"]);
  });

  it("holds a pair past the join distance until the drop distance (no flapping)", () => {
    const d = (VOICE_JOIN_PX + VOICE_DROP_PX) / 2 / 16;
    const fresh = pickPairs([at(1, 0), at(2, d)], new Map(), none, new Map());
    expect(fresh.size).toBe(0);
    const held = pickPairs([at(1, 0), at(2, d)], new Map([["1:2", { a: 1, b: 2, party: false }]]), none, new Map());
    expect(held.has("1:2")).toBe(true);
    const gone = pickPairs([at(1, 0), at(2, VOICE_DROP_PX / 16 + 1)], held, none, new Map());
    expect(gone.size).toBe(0);
  });

  it("connects each player to at most the nearest few, with room on both sides", () => {
    const crowd = Array.from({ length: 20 }, (_, i) => at(i + 1, i % 5, Math.floor(i / 5)));
    const pairs = pickPairs(crowd, new Map(), none, new Map());
    const count = new Map<number, number>();
    for (const p of pairs.values()) { count.set(p.a, (count.get(p.a) ?? 0) + 1); count.set(p.b, (count.get(p.b) ?? 0) + 1); }
    for (const n of count.values()) expect(n).toBeLessThanOrEqual(VOICE_MAX_NEAR);
    expect(pairs.size).toBeGreaterThan(0);
  });

  it("never pairs players who blocked each other, either way", () => {
    const blocked = (a: number, b: number) => pairKey(a, b) === "1:2";
    const pairs = pickPairs([at(1, 0), at(2, 1), at(3, 2)], new Map(), blocked, new Map());
    expect(pairs.has("1:2")).toBe(false);
    expect(pairs.has("1:3")).toBe(true);
  });

  it("pairs a party at any distance, outside the nearby cap", () => {
    const party = new Map([[1, 7], [2, 7]]);
    const pairs = pickPairs([at(1, 0), at(2, 900, 300)], new Map(), none, party);
    expect(pairs.get("1:2")).toEqual({ a: 1, b: 2, party: true });
    expect(PARTY_MAX).toBeLessThanOrEqual(6);
  });

  it("says what changed for each player, and who's polite", () => {
    const prev = new Map<string, VoicePair>([["1:2", { a: 1, b: 2, party: false }], ["1:3", { a: 1, b: 3, party: false }]]);
    const next = new Map<string, VoicePair>([["1:2", { a: 1, b: 2, party: true }], ["2:4", { a: 2, b: 4, party: false }]]);
    const d = diffPairs(prev, next);
    expect(d.get(1)).toEqual({ add: [{ id: 2, polite: true, party: true }], drop: [3] });
    expect(d.get(2)?.add).toContainEqual({ id: 4, polite: true, party: false });
    expect(d.get(4)?.add).toEqual([{ id: 2, polite: false, party: false }]);
    expect(d.get(3)).toEqual({ add: [], drop: [1] });
  });
});

const OFFER = [
  "v=0", "o=- 1 2 IN IP4 127.0.0.1", "s=-", "t=0 0",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111", "c=IN IP4 203.0.113.7", "a=rtcp:9 IN IP4 203.0.113.7",
  "a=candidate:1 1 udp 2122260223 192.168.1.20 54321 typ host",
  "a=candidate:2 1 udp 1686052607 203.0.113.7 54321 typ srflx raddr 192.168.1.20 rport 54321",
  "a=candidate:3 1 udp 41885439 104.30.0.1 3478 typ relay raddr 203.0.113.7 rport 54321",
  "a=rtpmap:111 opus/48000/2", "",
].join("\r\n");

describe("set-up messages", () => {
  it("keeps only the relay's candidate and blanks every player address", () => {
    const out = sanitizeSdp({ type: "offer", sdp: OFFER }, true)!;
    expect(out.sdp).not.toContain("192.168.1.20");
    expect(out.sdp).not.toContain("203.0.113.7");
    expect(out.sdp).toContain("104.30.0.1 3478 typ relay raddr 0.0.0.0 rport 0");
    expect(out.sdp).toContain("c=IN IP4 0.0.0.0");
  });

  it("refuses video, data channels, junk and oversized offers", () => {
    expect(sanitizeSdp({ type: "offer", sdp: OFFER.replace("m=audio", "m=video") }, true)).toBeNull();
    expect(sanitizeSdp({ type: "offer", sdp: `${OFFER}m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n` }, true)).toBeNull();
    expect(sanitizeSdp({ type: "pranswer", sdp: OFFER }, true)).toBeNull();
    expect(sanitizeSdp({ type: "offer", sdp: `${OFFER}${"a=x\r\n".repeat(3000)}` }, true)).toBeNull();
    expect(sanitizeSdp("v=0", true)).toBeNull();
  });

  it("drops trickled host and reflexive candidates, scrubs the relay's", () => {
    expect(sanitizeCandidate({ candidate: "candidate:1 1 udp 2122260223 192.168.1.20 54321 typ host", sdpMid: "0", sdpMLineIndex: 0 }, true)).toBeNull();
    expect(sanitizeCandidate({ candidate: "candidate:2 1 udp 1 203.0.113.7 5 typ srflx raddr 10.0.0.2 rport 5", sdpMid: "0", sdpMLineIndex: 0 }, true)).toBeNull();
    expect(sanitizeCandidate({ candidate: "candidate:3 1 udp 1 104.30.0.1 3478 typ relay raddr 203.0.113.7 rport 5", sdpMid: "0", sdpMLineIndex: 0 }, true))
      .toEqual({ candidate: "candidate:3 1 udp 1 104.30.0.1 3478 typ relay raddr 0.0.0.0 rport 0", sdpMid: "0", sdpMLineIndex: 0 });
    expect(sanitizeCandidate({ candidate: "", sdpMid: "0", sdpMLineIndex: 0 }, true)?.candidate).toBe("");
    expect(sanitizeCandidate({ candidate: "candidate:" + "x".repeat(600) }, true)).toBeNull();
  });

  it("limits how fast one player can send them", () => {
    const b = { rtcTokens: 2, rtcAt: 0 };
    expect(takeToken(b, 0)).toBe(true);
    expect(takeToken(b, 0)).toBe(true);
    expect(takeToken(b, 0)).toBe(false);
    expect(takeToken(b, 100)).toBe(true); // refills
  });

  it("leaves out Cloudflare's port-53 URLs (browsers block them)", () => {
    const s = cleanIceServers([{ urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp"], username: "u", credential: "c" }]);
    expect(s[0].urls).toEqual(["turn:turn.cloudflare.com:3478?transport=udp"]);
  });
});

describe("the relay budget and volume", () => {
  it("counts both directions of a pair, and stops at the cap", () => {
    expect(relayBytes(1)).toBe(10_000);
    expect(overQuota(799e9, 800)).toBe(false);
    expect(overQuota(800e9, 800)).toBe(true);
  });

  it("fades with distance", () => {
    expect(gainAt(0)).toBe(1);
    expect(gainAt(10 * 16)).toBeGreaterThan(0);
    expect(gainAt(10 * 16)).toBeLessThan(1);
    expect(gainAt(16 * 16)).toBe(0);
  });
});

describe("the server's gate", () => {
  type Sent = { type: string; [k: string]: unknown };
  const inbox = new Map<number, Sent[]>();
  const pos = new Map<number, { x: number; y: number }>();
  let srv: typeof import("@/lib/voiceServer");
  let first = true;

  const conn = (playerId: number, userId: number) => ({
    playerId, userId, alive: () => true,
    send: (m: string) => { const l = inbox.get(playerId) ?? []; l.push(JSON.parse(m)); inbox.set(playerId, l); },
  });
  const got = (id: number, type: string) => (inbox.get(id) ?? []).filter((m) => m.type === type);
  const turnOn = async (id: number, user: number, name: string, blocks: unknown[] = []) => {
    dbRows.queue.push([{ name, banned: null }], blocks);
    if (first) { dbRows.queue.push([]); first = false; } // this month's usage, read once
    await srv.voiceSetOn(conn(id, user), true);
  };

  beforeEach(async () => {
    vi.stubEnv("CLOUDFLARE_TURN_KEY_ID", "key");
    vi.stubEnv("CLOUDFLARE_TURN_API_TOKEN", "token");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }, { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53"], username: "u1", credential: "c1" }],
    }), { status: 201 })));
    srv = await import("@/lib/voiceServer");
    srv.resetVoiceForTests();
    inbox.clear();
    pos.clear();
    dbRows.queue.length = 0;
    first = true;
    srv.startVoice({ positionOf: (id) => pos.get(id) ?? null, sendTo: () => true });
    srv.stopVoice(); // ticks are driven by hand
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); srv.resetVoiceForTests(); });

  it("hands out relay-only credentials, without port 53", async () => {
    await turnOn(1, 11, "Ada");
    const [ice] = got(1, "voiceIce");
    expect(ice.relayOnly).toBe(true);
    expect(JSON.stringify(ice.iceServers)).not.toContain(":53");
    expect(JSON.stringify(ice.iceServers)).not.toContain("stun:");
  });

  it("passes set-up only between paired players, cleaned", async () => {
    pos.set(1, { x: 0, y: 0 }); pos.set(2, { x: 80, y: 0 }); pos.set(3, { x: 5000, y: 0 });
    await turnOn(1, 11, "Ada"); await turnOn(2, 12, "Bo"); await turnOn(3, 13, "Cy");
    await srv.voiceTick(Date.now());
    expect(got(1, "voicePeers")[0].add).toEqual([{ id: 2, polite: true, party: false }]);

    srv.voiceRtc(1, { to: 3, sdp: { type: "offer", sdp: OFFER } });
    expect(got(3, "rtc")).toHaveLength(0);

    srv.voiceRtc(1, { to: 2, sdp: { type: "offer", sdp: OFFER } });
    const [rtc] = got(2, "rtc");
    expect(rtc.from).toBe(1);
    expect(JSON.stringify(rtc)).not.toContain("192.168.1.20");
    expect(JSON.stringify(rtc)).not.toContain("203.0.113.7");
  });

  it("drops a pair as soon as one blocks the other", async () => {
    pos.set(1, { x: 0, y: 0 }); pos.set(2, { x: 80, y: 0 });
    await turnOn(1, 11, "Ada"); await turnOn(2, 12, "Bo");
    await srv.voiceTick(Date.now());
    srv.voiceBlocksChanged(11, { characterId: 2 }, true);
    await srv.voiceTick(Date.now() + 1000);
    expect(got(1, "voicePeers").at(-1)?.drop).toEqual([2]);
    srv.voiceRtc(1, { to: 2, sdp: { type: "offer", sdp: OFFER } });
    expect(got(2, "rtc")).toHaveLength(0);
  });

  it("never pairs players blocked before voice came on", async () => {
    pos.set(1, { x: 0, y: 0 }); pos.set(2, { x: 80, y: 0 });
    await turnOn(1, 11, "Ada", [{ a: 12, b: 11 }]); await turnOn(2, 12, "Bo", [{ a: 12, b: 11 }]);
    await srv.voiceTick(Date.now());
    expect(got(1, "voicePeers")).toHaveLength(0);
  });

  it("cuts off a voice-banned player at once", async () => {
    await turnOn(1, 11, "Ada");
    srv.voiceBanChanged(11, true);
    expect(got(1, "voiceOff").at(-1)?.reason).toBe("banned");
  });

  it("notes for a report that two players really were in voice together", async () => {
    pos.set(1, { x: 0, y: 0 }); pos.set(2, { x: 80, y: 0 });
    await turnOn(1, 11, "Ada"); await turnOn(2, 12, "Bo");
    expect(srv.voicePairNote(1, 2)).toBeNull();
    await srv.voiceTick(Date.now());
    expect(srv.voicePairNote(1, 2)).toMatch(/^\[voice\] in voice with the reporter now/);
  });
});
