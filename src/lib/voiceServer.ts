// Voice chat, server side: who has voice on, who's paired with whom, the
// friends' parties, relay credentials and the monthly relay budget.
//
// Audio never comes here. Browsers talk WebRTC through Cloudflare's TURN
// relay (relay-only, so nobody sees another player's address). This module
// decides pairs once a second from the live positions the WS server already
// holds, passes SDP / ICE only between paired players (cleaned by
// src/lib/voice.ts), and stops handing out relay credentials once this
// month's estimated relay traffic reaches VOICE_MONTHLY_GB_CAP, so the free
// tier is never exceeded. No database reads per tick: blocks and names are
// read when voice is turned on, friendship on an invite, and the usage tally
// is saved once a minute.
//
// State lives on globalThis: this module is loaded by the custom server and
// again inside Next's bundle (the friends / report / ban routes call it).

import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, friendships, playerBlocks, users, voiceUsage } from "@/db/schema";
import { log } from "@/lib/logger";
import {
  ICE_MINT_EVERY_MS, ICE_RENEW_MS, ICE_TTL_S, INVITE_EVERY_MS, INVITE_MS, PAIR_LOG_MS, PARTY_EMPTY_MS, PARTY_MAX, RTC_BURST,
  VOICE_TICK_MS, cleanIceServers, diffPairs, overQuota, pairKey, pickPairs, relayBytes, sanitizeCandidate, sanitizeSdp, takeToken, usageMonth,
} from "@/lib/voice";
import type {
  IceServer, VoiceConnRef, VoiceHost, VoiceMember, VoiceOffReason, VoiceParty, VoicePartyView, VoicePlayer, VoiceServerMessage, VoiceShared,
} from "@/types/voice";

const KEY_ID = () => process.env.CLOUDFLARE_TURN_KEY_ID ?? "";
const KEY_TOKEN = () => process.env.CLOUDFLARE_TURN_API_TOKEN ?? "";
const CAP_GB = () => Math.max(0, Number(process.env.VOICE_MONTHLY_GB_CAP ?? 800));
const MAX_PLAYERS = () => Math.max(1, Number(process.env.VOICE_MAX_PLAYERS ?? 100));
const USAGE_SAVE_MS = 60_000;
const MEASURE_MS = 60 * 60_000;

/** Relay keys set: the real thing. Without them voice works only outside production, peer to peer, for testing on one machine. */
const hasRelay = () => KEY_ID().length > 0 && KEY_TOKEN().length > 0;
export const voiceRelayOnly = (): boolean => hasRelay();
export const voiceAvailable = (): boolean => process.env.VOICE_ENABLED !== "0" && (hasRelay() || process.env.NODE_ENV !== "production");

const STATE_KEY = "__grove_voice__";
function state(): VoiceShared {
  const g = globalThis as unknown as Record<string, VoiceShared | undefined>;
  let s = g[STATE_KEY];
  if (!s) {
    s = {
      members: new Map(), pairs: new Map(), parties: new Map(), partyOf: new Map(), invites: [], nextParty: 1,
      usage: { month: usageMonth(Date.now()), bytes: 0, unsaved: 0, savedAt: 0, loaded: false, measured: 0, measuredAt: 0 },
      log: new Map(), lastTickAt: 0, host: null, timer: null,
    };
    g[STATE_KEY] = s;
  }
  return s;
}

const json = (m: VoiceServerMessage) => JSON.stringify(m);
const tell = (m: VoiceMember, msg: VoiceServerMessage) => { try { m.send(json(msg)); } catch { /* socket closed */ } };
const notice = (m: VoiceMember, text: string) => tell(m, { type: "voiceNotice", text });

// ── The relay (Cloudflare Realtime TURN) ───────────────────────────────────

async function mintIce(m: VoiceMember): Promise<boolean> {
  const now = Date.now();
  if (!hasRelay()) {
    // Testing on one machine (never production: voiceAvailable): no relay, direct.
    m.ice = { servers: [], username: null, expiresAt: now + ICE_TTL_S * 1000 };
    m.mintedAt = now;
    return true;
  }
  if (m.minting) return false;
  m.minting = true;
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(KEY_ID())}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY_TOKEN()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: ICE_TTL_S }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`TURN credentials: HTTP ${res.status}`);
    const body = (await res.json()) as { iceServers?: IceServer[] | IceServer };
    const raw = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
    const servers = cleanIceServers(raw).filter((s) => s.urls.some((u) => u.startsWith("turn:") || u.startsWith("turns:")));
    if (!servers.length) throw new Error("TURN credentials: no relay servers in the answer");
    const old = m.ice?.username;
    m.ice = { servers, username: servers.find((s) => s.username)?.username ?? null, expiresAt: now + ICE_TTL_S * 1000 };
    m.mintedAt = now;
    if (old && old !== m.ice.username) revoke(old);
    return true;
  } catch (err) {
    log.warn({ err, playerId: m.playerId }, "voice: minting relay credentials failed");
    return false;
  } finally {
    m.minting = false;
  }
}

/** Credentials end with the session: nobody can keep using the relay after leaving voice. */
function revoke(username: string | null | undefined): void {
  if (!username || !hasRelay()) return;
  void fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(KEY_ID())}/credentials/${encodeURIComponent(username)}/revoke`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY_TOKEN()}` },
    signal: AbortSignal.timeout(5000),
  }).catch(() => { /* it expires on its own */ });
}

function sendIce(m: VoiceMember): void {
  if (!m.ice) return;
  tell(m, { type: "voiceIce", iceServers: m.ice.servers, relayOnly: hasRelay(), expiresAt: m.ice.expiresAt });
}

// ── The monthly budget ──────────────────────────────────────────────────────

async function loadUsage(now: number): Promise<void> {
  const u = state().usage;
  const month = usageMonth(now);
  if (u.loaded && u.month === month) return;
  if (u.month !== month && u.unsaved > 0) await saveUsage(now, true); // the old month's last minute
  const [r] = await db.select({ b: voiceUsage.estBytes }).from(voiceUsage).where(eq(voiceUsage.month, month));
  Object.assign(u, { month, bytes: r?.b ?? 0, unsaved: 0, loaded: true, measured: 0, measuredAt: 0 });
}

async function saveUsage(now: number, force = false): Promise<void> {
  const u = state().usage;
  if (!u.unsaved || (!force && now - u.savedAt < USAGE_SAVE_MS)) return;
  const add = u.unsaved;
  u.unsaved = 0;
  u.savedAt = now;
  const [r] = await db.insert(voiceUsage).values({ month: u.month, estBytes: add })
    .onConflictDoUpdate({ target: voiceUsage.month, set: { estBytes: sql`${voiceUsage.estBytes} + ${add}`, updatedAt: new Date(now) } })
    .returning({ b: voiceUsage.estBytes });
  if (r) u.bytes = Math.max(u.bytes, r.b); // other processes add to it too
}

/**
 * The real number, when an analytics token is set: this month's TURN egress
 * from Cloudflare's GraphQL API (dataset callsTurnUsageAdaptiveGroups). The
 * estimate assumes browsers keep to VOICE_MAX_BITRATE; this catches one that doesn't.
 */
async function measureUsage(now: number): Promise<void> {
  const u = state().usage;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_ANALYTICS_TOKEN;
  if (!account || !token || !hasRelay() || now - u.measuredAt < MEASURE_MS) return;
  u.measuredAt = now;
  const from = `${u.month}-01`, to = new Date(now).toISOString().slice(0, 10);
  const query = `query($account: String!, $from: Date!, $to: Date!, $key: String!) { viewer { accounts(filter: { accountTag: $account }) {
    callsTurnUsageAdaptiveGroups(filter: { date_geq: $from, date_leq: $to, keyId: $key }, limit: 1) { sum { egressBytes } } } } }`;
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { account, from, to, key: KEY_ID() } }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as { data?: { viewer?: { accounts?: { callsTurnUsageAdaptiveGroups?: { sum?: { egressBytes?: number } }[] }[] } } };
    const groups = body.data?.viewer?.accounts?.[0]?.callsTurnUsageAdaptiveGroups ?? [];
    u.measured = groups.reduce((n, g) => n + (g.sum?.egressBytes ?? 0), 0);
  } catch (err) {
    log.warn({ err }, "voice: reading TURN usage failed");
  }
}

const usedBytes = () => { const u = state().usage; return Math.max(u.bytes + u.unsaved, u.measured); };
const quotaReached = () => overQuota(usedBytes(), CAP_GB());

/** For the stats page: this month's relay traffic and the cap. */
export function voiceUsageNow(): { month: string; gb: number; capGb: number; on: number; pairs: number } {
  const s = state();
  return { month: s.usage.month, gb: Math.round(usedBytes() / 1e7) / 100, capGb: CAP_GB(), on: [...s.members.values()].filter((m) => m.on).length, pairs: s.pairs.size };
}

// ── Voice on / off ─────────────────────────────────────────────────────────

function off(m: VoiceMember, reason: VoiceOffReason | null): void {
  m.on = false;
  revoke(m.ice?.username);
  m.ice = null;
  if (reason) tell(m, { type: "voiceOff", reason });
}

/** A player turns voice on (or off). The pairing tick connects them within a second. */
export async function voiceSetOn(conn: VoiceConnRef, on: boolean): Promise<void> {
  const s = state();
  let m = s.members.get(conn.playerId);
  if (!on) {
    if (m) { off(m, null); leaveParty(m); s.members.delete(conn.playerId); }
    return;
  }
  if (!voiceAvailable()) { conn.send(json({ type: "voiceOff", reason: "unavailable" })); return; }
  if (!m) {
    const [me] = await db.select({ name: characters.name, banned: users.voiceBannedAt })
      .from(characters).innerJoin(users, eq(users.id, characters.userId)).where(eq(characters.id, conn.playerId));
    const blockRows = await db.select({ a: playerBlocks.blockerUserId, b: playerBlocks.blockedUserId }).from(playerBlocks)
      .where(or(eq(playerBlocks.blockerUserId, conn.userId), eq(playerBlocks.blockedUserId, conn.userId)));
    if (!conn.alive()) return;
    m = s.members.get(conn.playerId) ?? {
      playerId: conn.playerId, userId: conn.userId, name: me?.name ?? "?", on: false, banned: !!me?.banned,
      blocks: new Set(blockRows.map((r) => (r.a === conn.userId ? r.b : r.a))),
      ice: null, mintedAt: 0, minting: false, rtcTokens: RTC_BURST, rtcAt: Date.now(), invitedAt: 0, send: conn.send,
    };
    s.members.set(conn.playerId, m);
  }
  m.send = conn.send; // a reconnect brings a new socket
  if (m.banned) { off(m, "banned"); return; }
  await loadUsage(Date.now());
  if (quotaReached()) { off(m, "quota"); return; }
  if (!m.on && [...s.members.values()].filter((x) => x.on).length >= MAX_PLAYERS()) { off(m, "full"); return; }
  const fresh = m.ice && m.ice.expiresAt - Date.now() > ICE_RENEW_MS;
  if (!fresh && !(await mintIce(m))) { off(m, "unavailable"); return; }
  if (!conn.alive()) return;
  m.on = true;
  sendIce(m);
  const party = s.partyOf.get(m.playerId);
  if (party != null) tell(m, { type: "voiceParty", party: partyView(s.parties.get(party)) });
  ensureTicking();
}

/** A player disconnected: their pairs go on the next tick (their party waits for them a while). */
export function voiceGone(playerId: number): void {
  const s = state();
  const m = s.members.get(playerId);
  if (!m) return;
  revoke(m.ice?.username);
  s.members.delete(playerId);
}

// ── Signaling ──────────────────────────────────────────────────────────────

/** Pass an SDP / ICE message to a paired player, cleaned. Anything else is dropped. */
export function voiceRtc(fromId: number, raw: { to?: unknown; sdp?: unknown; cand?: unknown }): void {
  const s = state();
  const m = s.members.get(fromId);
  const to = Number(raw.to);
  if (!m?.on || !Number.isInteger(to) || !takeToken(m, Date.now())) return;
  if (!s.pairs.has(pairKey(fromId, to))) return; // only between players the server paired
  const peer = s.members.get(to);
  if (!peer?.on) return;
  const relayOnly = hasRelay();
  if (raw.sdp !== undefined) {
    const sdp = sanitizeSdp(raw.sdp, relayOnly);
    if (sdp) tell(peer, { type: "rtc", from: fromId, sdp });
    return;
  }
  if (raw.cand === null) { tell(peer, { type: "rtc", from: fromId, cand: null }); return; }
  const cand = sanitizeCandidate(raw.cand, relayOnly);
  if (cand) tell(peer, { type: "rtc", from: fromId, cand });
}

// ── Blocks and bans ─────────────────────────────────────────────────────────

/**
 * Someone blocked (or unblocked) someone: keep the cached block lists right
 * so the next tick drops (or allows) the pair. Unblocking re-reads both,
 * since the other may have blocked too.
 */
export function voiceBlocksChanged(blockerUserId: number, target: { userId?: number; characterId?: number }, blocked: boolean): void {
  const s = state();
  const all = [...s.members.values()];
  const blocker = all.find((m) => m.userId === blockerUserId);
  const other = all.find((m) => (target.userId != null && m.userId === target.userId) || (target.characterId != null && m.playerId === target.characterId));
  const otherUser = other?.userId ?? target.userId;
  if (blocked) {
    if (blocker && otherUser != null) blocker.blocks.add(otherUser);
    if (other) other.blocks.add(blockerUserId);
    const party = blocker ? s.partyOf.get(blocker.playerId) : undefined;
    if (blocker && other && party != null && s.partyOf.get(other.playerId) === party) leaveParty(blocker);
    return;
  }
  for (const m of [blocker, other]) if (m) void reloadBlocks(m);
}

async function reloadBlocks(m: VoiceMember): Promise<void> {
  const rows = await db.select({ a: playerBlocks.blockerUserId, b: playerBlocks.blockedUserId }).from(playerBlocks)
    .where(or(eq(playerBlocks.blockerUserId, m.userId), eq(playerBlocks.blockedUserId, m.userId)));
  m.blocks = new Set(rows.map((r) => (r.a === m.userId ? r.b : r.a)));
}

/** An admin barred (or allowed) a user from voice: they're cut off at once. */
export function voiceBanChanged(userId: number, banned: boolean): void {
  for (const m of state().members.values()) {
    if (m.userId !== userId) continue;
    m.banned = banned;
    if (banned) { leaveParty(m); off(m, "banned"); }
  }
}

/** For a report: whether the two were in voice together lately (server-side, so it can't be faked). */
export function voicePairNote(reporterId: number, targetId: number, now = Date.now()): string | null {
  const logs = state().log.get(pairKey(reporterId, targetId));
  const last = logs?.[logs.length - 1];
  if (!last) return null;
  const mins = (ms: number) => Math.max(1, Math.round(ms / 60_000));
  if (last.to == null) return `[voice] in voice with the reporter now (${mins(now - last.from)} min so far)`;
  return `[voice] in voice with the reporter ${mins(now - last.to)} min ago, for ${mins(last.to - last.from)} min`;
}

// ── Parties (friends, heard anywhere) ───────────────────────────────────────

function partyView(p: VoiceParty | undefined): VoicePartyView | null {
  return p ? { id: p.id, members: p.members.map((id) => ({ id, name: p.names[id] ?? "?" })) } : null;
}

function tellParty(p: VoiceParty): void {
  const s = state();
  const view = partyView(p);
  for (const id of p.members) { const m = s.members.get(id); if (m) tell(m, { type: "voiceParty", party: view }); }
}

function leaveParty(m: VoiceMember): void {
  const s = state();
  const id = s.partyOf.get(m.playerId);
  if (id == null) return;
  s.partyOf.delete(m.playerId);
  const p = s.parties.get(id);
  tell(m, { type: "voiceParty", party: null });
  if (!p) return;
  p.members = p.members.filter((x) => x !== m.playerId);
  if (p.members.length <= 1) {
    for (const x of p.members) { s.partyOf.delete(x); const o = s.members.get(x); if (o) tell(o, { type: "voiceParty", party: null }); }
    s.parties.delete(id);
    s.invites = s.invites.filter((i) => i.partyId !== id);
    return;
  }
  tellParty(p);
}

async function areFriends(a: number, b: number): Promise<boolean> {
  const [r] = await db.select({ a: friendships.userA }).from(friendships)
    .where(and(eq(friendships.userA, Math.min(a, b)), eq(friendships.userB, Math.max(a, b)))).limit(1);
  return !!r;
}

/** Party commands from a player with voice on. */
export async function voiceParty(playerId: number, msg: { op?: unknown; characterId?: unknown; partyId?: unknown }): Promise<void> {
  const s = state();
  const m = s.members.get(playerId);
  if (!m?.on) return;
  const now = Date.now();
  if (msg.op === "leave") { leaveParty(m); return; }
  if (msg.op === "decline") {
    const partyId = Number(msg.partyId);
    const inv = s.invites.find((i) => i.partyId === partyId && i.to === playerId);
    s.invites = s.invites.filter((i) => i !== inv);
    const from = inv ? s.members.get(inv.from) : undefined;
    if (from) notice(from, `${m.name} said no to the voice party.`);
    return;
  }
  if (msg.op === "invite") {
    const to = Number(msg.characterId);
    if (!Number.isInteger(to) || to === playerId) return;
    if (now - m.invitedAt < INVITE_EVERY_MS) return;
    m.invitedAt = now;
    const [t] = await db.select({ userId: characters.userId, name: characters.name }).from(characters).where(eq(characters.id, to));
    if (!t) return;
    if (m.blocks.has(t.userId) || !(await areFriends(m.userId, t.userId))) { notice(m, "You can only invite friends to a voice party."); return; }
    let partyId = s.partyOf.get(playerId);
    let p = partyId != null ? s.parties.get(partyId) : undefined;
    if (!p) {
      partyId = s.nextParty++;
      p = { id: partyId, members: [playerId], names: { [playerId]: m.name }, users: { [playerId]: m.userId }, emptySince: null };
      s.parties.set(partyId, p);
      s.partyOf.set(playerId, partyId);
    }
    if (p.members.includes(to)) { notice(m, `${t.name} is already in your party.`); return; }
    if (p.members.length >= PARTY_MAX) { notice(m, `A voice party holds ${PARTY_MAX}.`); return; }
    s.invites = s.invites.filter((i) => !(i.partyId === p.id && i.to === to));
    s.invites.push({ partyId: p.id, from: playerId, to, at: now });
    p.names[to] = t.name;
    p.users[to] = t.userId;
    const delivered = s.host?.sendTo(to, json({ type: "voiceInvite", partyId: p.id, from: { id: playerId, name: m.name } })) ?? false;
    tellParty(p);
    notice(m, delivered ? `Invited ${t.name} to your voice party.` : `${t.name} isn't online.`);
    return;
  }
  if (msg.op === "join") {
    const partyId = Number(msg.partyId);
    const inv = s.invites.find((i) => i.partyId === partyId && i.to === playerId && now - i.at <= INVITE_MS);
    const p = s.parties.get(partyId);
    if (!inv || !p) { notice(m, "That invite has run out."); return; }
    if (p.members.length >= PARTY_MAX) { notice(m, "That party is full."); return; }
    if (p.members.some((id) => m.blocks.has(p.users[id]))) { notice(m, "You can't join that party."); return; }
    if (s.partyOf.get(playerId) !== partyId) leaveParty(m);
    s.invites = s.invites.filter((i) => i !== inv);
    p.members.push(playerId);
    p.names[playerId] = m.name;
    p.users[playerId] = m.userId;
    p.emptySince = null;
    s.partyOf.set(playerId, partyId);
    tellParty(p);
  }
}

// ── The pairing tick ────────────────────────────────────────────────────────

/** The WS server hands over live positions and a way to reach players, and the tick starts. */
export function startVoice(host: VoiceHost): void {
  const s = state();
  s.host = host;
  ensureTicking();
}

export function stopVoice(): void {
  const s = state();
  if (s.timer) clearInterval(s.timer);
  s.timer = null;
}

function ensureTicking(): void {
  const s = state();
  if (s.timer || !s.host) return;
  s.lastTickAt = Date.now();
  s.timer = setInterval(() => { void voiceTick().catch((err) => log.error({ err }, "voice tick failed")); }, VOICE_TICK_MS);
}

export async function voiceTick(now = Date.now()): Promise<void> {
  const s = state();
  const host = s.host;
  if (!host) return;
  const dt = Math.min(5, Math.max(0, (now - s.lastTickAt) / 1000));
  s.lastTickAt = now;

  const players: VoicePlayer[] = [];
  for (const m of s.members.values()) {
    if (!m.on || m.banned) continue;
    const at = host.positionOf(m.playerId);
    if (at) players.push({ id: m.playerId, x: at.x, y: at.y });
  }
  const blocked = (a: number, b: number) => {
    const ma = s.members.get(a), mb = s.members.get(b);
    return !ma || !mb || ma.blocks.has(mb.userId) || mb.blocks.has(ma.userId);
  };
  const next = players.length > 1 ? pickPairs(players, s.pairs, blocked, s.partyOf) : new Map();
  const diffs = diffPairs(s.pairs, next);

  // Who's been in voice with whom (reports), and what it cost.
  for (const [k, p] of next) if (!s.pairs.has(k)) {
    const list = s.log.get(k) ?? [];
    list.push({ a: p.a, b: p.b, from: now, to: null });
    s.log.set(k, list);
  }
  for (const [k] of s.pairs) if (!next.has(k)) { const l = s.log.get(k); const last = l?.[l.length - 1]; if (last && last.to == null) last.to = now; }
  for (const [k, list] of s.log) {
    const kept = list.filter((e) => e.to == null || now - e.to <= PAIR_LOG_MS);
    if (kept.length) s.log.set(k, kept); else s.log.delete(k);
  }
  s.usage.unsaved += relayBytes(next.size * dt);
  s.pairs = next;

  for (const [id, d] of diffs) {
    const m = s.members.get(id);
    if (m) tell(m, { type: "voicePeers", add: d.add, drop: d.drop });
  }

  // Credentials about to run out: new ones (the browser swaps them in place).
  for (const m of s.members.values()) {
    if (m.on && m.ice && m.ice.expiresAt - now < ICE_RENEW_MS && now - m.mintedAt >= ICE_MINT_EVERY_MS) {
      void mintIce(m).then((ok) => { if (ok && m.on) sendIce(m); });
    }
  }

  // Parties nobody's been in for a while, and stale invites.
  for (const p of s.parties.values()) {
    const present = p.members.some((id) => s.members.has(id));
    if (present) p.emptySince = null;
    else if (p.emptySince == null) p.emptySince = now;
    else if (now - p.emptySince > PARTY_EMPTY_MS) {
      for (const id of p.members) s.partyOf.delete(id);
      s.parties.delete(p.id);
    }
  }
  s.invites = s.invites.filter((i) => now - i.at <= INVITE_MS && s.parties.has(i.partyId));

  // The budget: save, measure, and switch everyone off at the cap.
  if (usageMonth(now) !== s.usage.month) await loadUsage(now);
  await saveUsage(now);
  await measureUsage(now);
  if (quotaReached()) {
    const on = [...s.members.values()].filter((m) => m.on);
    if (on.length) log.warn({ month: s.usage.month, players: on.length }, "voice: monthly relay cap reached, voice off");
    for (const m of on) off(m, "quota");
  }

  if (s.members.size === 0 && s.pairs.size === 0 && s.parties.size === 0 && s.usage.unsaved === 0) stopVoice();
}

/** For tests: forget everything. */
export function resetVoiceForTests(): void {
  stopVoice();
  delete (globalThis as unknown as Record<string, unknown>)[STATE_KEY];
}
