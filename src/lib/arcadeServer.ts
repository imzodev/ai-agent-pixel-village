// The arcade on the server (the games: src/lib/arcade/games.ts). A run starts
// with a signed token (which game, when, who), and its inputs come back at the
// end. The server replays them on the day's course (in the replay worker,
// src/lib/arcade/replayPool.ts) and stores the score it gets itself, never the
// browser's. Boards, per game: each player's best run of the day, and the
// week's total of each day's best (Monday to Sunday, UTC). tickd awards each
// game's week's top three once (awardWeek): gems, a title, a prize to wear and a moment.

import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { arcadePrizes, arcadeRuns, characters, cosmeticOwnerships, gemTransactions, users } from "@/db/schema";
import { ARCADE_GAMES, ARCADE_KEYS, courseNumber } from "./arcade/games";
import { addDays, arcadeDay, msToNextCourse, weekOf } from "./arcade/days";
import { replayRun } from "./arcade/replayPool";
import { createMoment, momentId } from "./momentsServer";
import { track } from "./track";
import type { ArcadeBoardRow, ArcadeGameKey, ArcadeHubGame, ArcadeRunView, ArcadeStart, ArcadeSubmitResult, ArcadeView } from "@/types/arcade";

/** A run's token is good for this long after it starts. */
const RUN_TOKEN_MS = 15 * 60_000;

export class ArcadeError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

// ── The secret: signs run tokens and salts the courses ──
let generated: string | null = null;
const configured = (): string | null => {
  const s = process.env.WHISTLE_SECRET || process.env.ADMIN_TOKEN;
  return s && s.length >= 16 ? s : null;
};
function secret(): string {
  const s = configured();
  if (s) return s;
  generated ??= crypto.randomBytes(32).toString("hex"); // runs in flight across a restart are refused
  return generated;
}
const sign = (body: string): string => crypto.createHmac("sha256", secret()).update(`whistle:${body}`).digest("base64url").slice(0, 32);

/**
 * A game's course for a day, salted with the secret so it can't be known ahead
 * of its day (without a configured secret, as in development, the plain course).
 */
export function courseOf(game: ArcadeGameKey, day: string): unknown {
  const s = configured();
  return ARCADE_GAMES[game].courseFor(day, s ? crypto.createHash("sha256").update(`${game}-course:${s}`).digest("hex").slice(0, 16) : "");
}

// ── Runs ──

/** Start a run: today's course and a token to send back with the inputs. */
export function startRun(game: ArcadeGameKey, characterId: number | null, nowMs = Date.now()): ArcadeStart {
  const body = `${game}.${nowMs}.${characterId ?? 0}`;
  track("arcade_play", characterId, { game });
  const day = arcadeDay(nowMs);
  return { day, course: courseOf(game, day), token: `${body}.${sign(body)}` };
}

/** A token's game, start time and character (0: started before signing in), or null if it isn't ours. */
function readToken(token: string): { game: string; startedAt: number; characterId: number } | null {
  const m = /^([a-z]{2,16})\.(\d{13})\.(\d{1,10})\.([\w-]{32})$/.exec(token);
  if (!m) return null;
  const body = `${m[1]}.${m[2]}.${m[3]}`;
  const want = Buffer.from(sign(body)), got = Buffer.from(m[4]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  return { game: m[1], startedAt: Number(m[2]), characterId: Number(m[3]) };
}

/** Tokens already used (in memory: a resend after a restart only adds a duplicate row). */
const used = new Map<string, number>();
function spendToken(token: string, nowMs: number): boolean {
  if (used.has(token)) return false;
  if (used.size > 5000) for (const [k, at] of used) if (nowMs - at > RUN_TOKEN_MS) used.delete(k);
  used.set(token, nowMs);
  return true;
}

/** Finish a run: replay its inputs on the day's course and keep the score that comes out. */
export async function submitRun(game: ArcadeGameKey, characterId: number, token: string, rawInputs: unknown, nowMs = Date.now()): Promise<ArcadeSubmitResult> {
  const def = ARCADE_GAMES[game];
  const t = readToken(String(token ?? ""));
  if (!t || t.game !== game) throw new ArcadeError("That run can't be checked. Start a new one.");
  if (t.characterId && t.characterId !== characterId) throw new ArcadeError("That run was someone else's.");
  if (nowMs - t.startedAt > RUN_TOKEN_MS || nowMs < t.startedAt) throw new ArcadeError("That run is too old to count. Start a new one.");
  const inputs = def.cleanInputs(rawInputs);
  if (!inputs) throw new ArcadeError("That run can't be checked. Start a new one.");
  const day = arcadeDay(t.startedAt);
  const result = await replayRun(game, courseOf(game, day), inputs);
  if (!result) throw new ArcadeError("Couldn't check that run just now. Try again in a moment.", 503);
  // A run can't finish faster than it plays (a little slack for timers).
  if (nowMs - t.startedAt < result.ticks * def.tickMs * 0.9) throw new ArcadeError("That was quicker than the run itself. Start a new one.");
  if (!spendToken(token, nowMs)) throw new ArcadeError("That run is already in.");
  const id = momentId();
  await db.insert(arcadeRuns).values({ id, game, characterId, day, score: result.score, detail: result.detail, ticks: result.ticks, inputs });
  const best = await bestOf(game, characterId, day);
  track("arcade_submit", characterId, { game, day, score: result.score });
  return { ...result, runId: id, best, rank: await rankOf(game, day, best), shareUrl: `${def.path}/r/${id}` };
}

// ── Boards ──
type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>): Promise<Row[]> => (await db.execute(q)).rows as Row[];

async function bestOf(game: ArcadeGameKey, characterId: number, day: string): Promise<number> {
  const [r] = await db.select({ best: sql<number>`coalesce(max(${arcadeRuns.score}), 0)::int` }).from(arcadeRuns)
    .where(and(eq(arcadeRuns.game, game), eq(arcadeRuns.characterId, characterId), eq(arcadeRuns.day, day), eq(arcadeRuns.hidden, false)));
  return r?.best ?? 0;
}

/** 1 + how many players did better than `score` on that day. */
async function rankOf(game: ArcadeGameKey, day: string, score: number): Promise<number> {
  const [r] = await rows(sql`
    SELECT count(*)::int AS n FROM (
      SELECT character_id, max(score) AS best FROM arcade_runs WHERE game = ${game} AND day = ${day} AND NOT hidden GROUP BY character_id
    ) b WHERE b.best > ${score}`);
  return Number(r?.n ?? 0) + 1;
}

/** The day's board: each player's best run (the earliest of equal ones). */
export async function dayBoard(game: ArcadeGameKey, day: string, limit = 20): Promise<(ArcadeBoardRow & { characterId: number })[]> {
  const r = await rows(sql`
    SELECT b.character_id, b.score, b.id, c.name FROM (
      SELECT DISTINCT ON (character_id) character_id, score, id, created_at FROM arcade_runs
      WHERE game = ${game} AND day = ${day} AND NOT hidden ORDER BY character_id, score DESC, created_at ASC
    ) b JOIN characters c ON c.id = b.character_id JOIN users u ON u.id = c.user_id AND u.banned_at IS NULL
    ORDER BY b.score DESC, b.created_at ASC LIMIT ${limit}`);
  return r.map((x, i) => ({ rank: i + 1, characterId: Number(x.character_id), name: String(x.name), score: Number(x.score), runId: String(x.id) }));
}

/** The week's board: each player's total of their best score each day. */
export async function weekBoard(game: ArcadeGameKey, week: string, limit = 20): Promise<(ArcadeBoardRow & { characterId: number })[]> {
  const end = addDays(week, 6);
  const r = await rows(sql`
    SELECT d.character_id, sum(d.best)::int AS total, c.name, min(d.first_at) AS first_at FROM (
      SELECT character_id, day, max(score) AS best, min(created_at) AS first_at FROM arcade_runs
      WHERE game = ${game} AND day >= ${week} AND day <= ${end} AND NOT hidden GROUP BY character_id, day
    ) d JOIN characters c ON c.id = d.character_id JOIN users u ON u.id = c.user_id AND u.banned_at IS NULL
    GROUP BY d.character_id, c.name ORDER BY total DESC, first_at ASC LIMIT ${limit}`);
  return r.map((x, i) => ({ rank: i + 1, characterId: Number(x.character_id), name: String(x.name), score: Number(x.total) }));
}

/** A week's prize winners (awarded), best first. */
async function champions(game: ArcadeGameKey, week: string): Promise<ArcadeBoardRow[]> {
  const r = await db.select({ rank: arcadePrizes.rank, score: arcadePrizes.score, name: characters.name }).from(arcadePrizes)
    .innerJoin(characters, eq(characters.id, arcadePrizes.characterId))
    .where(and(eq(arcadePrizes.game, game), eq(arcadePrizes.week, week))).orderBy(arcadePrizes.rank);
  return r.map((x) => ({ rank: x.rank, name: x.name, score: x.score }));
}

const lastWeek = (nowMs: number): string => addDays(weekOf(arcadeDay(nowMs)), -7);

/** What a game's page shows. */
export async function arcadeView(game: ArcadeGameKey, me: { id: number; name: string } | null, nowMs = Date.now()): Promise<ArcadeView> {
  const day = arcadeDay(nowMs), week = weekOf(day);
  const [today, wk, champs] = await Promise.all([dayBoard(game, day), weekBoard(game, week), champions(game, lastWeek(nowMs))]);
  const mark = (list: (ArcadeBoardRow & { characterId: number })[]): ArcadeBoardRow[] =>
    list.map(({ characterId, ...r }) => (me && characterId === me.id ? { ...r, me: true } : r));
  let mine: ArcadeView["me"] = null;
  if (me) {
    const best = await bestOf(game, me.id, day);
    const weekRow = wk.find((r) => r.characterId === me.id);
    mine = { name: me.name, best: best || null, rank: best ? await rankOf(game, day, best) : null, weekRank: weekRow?.rank ?? null };
  }
  return { game, day, number: courseNumber(game, day), course: courseOf(game, day), nextInMs: msToNextCourse(nowMs), today: mark(today), week: mark(wk), champions: champs, me: mine };
}

/** The /play hub: each game's number today, its leader and how many have played. */
export async function arcadeHub(nowMs = Date.now()): Promise<ArcadeHubGame[]> {
  const day = arcadeDay(nowMs);
  return Promise.all(ARCADE_KEYS.map(async (key) => {
    const g = ARCADE_GAMES[key];
    const [board, [count]] = await Promise.all([
      dayBoard(key, day, 1),
      rows(sql`SELECT count(DISTINCT character_id)::int AS n FROM arcade_runs WHERE game = ${key} AND day = ${day} AND NOT hidden`),
    ]);
    const leader = board[0] ? { rank: 1, name: board[0].name, score: board[0].score, runId: board[0].runId } : null;
    return { key, name: g.name, emoji: g.emoji, tagline: g.tagline, path: g.path, number: courseNumber(key, day), leader, players: Number(count?.n ?? 0) };
  }));
}

/** A run for its replay page (null when unknown, hidden, another game's, or its player is suspended). */
export async function runById(game: ArcadeGameKey, id: string): Promise<ArcadeRunView | null> {
  if (!/^[A-Za-z0-9]{6,20}$/.test(id)) return null;
  const [r] = await db.select({ run: arcadeRuns, name: characters.name, username: users.username, banned: users.bannedAt }).from(arcadeRuns)
    .innerJoin(characters, eq(characters.id, arcadeRuns.characterId))
    .leftJoin(users, eq(users.id, characters.userId))
    .where(and(eq(arcadeRuns.id, id), eq(arcadeRuns.game, game), eq(arcadeRuns.hidden, false)));
  if (!r || r.banned) return null;
  return {
    id: r.run.id, game, day: r.run.day, number: courseNumber(game, r.run.day), course: courseOf(game, r.run.day),
    name: r.name, username: r.username, score: r.run.score, detail: r.run.detail, inputs: r.run.inputs,
  };
}

/** Admin: take a run off the boards (or put it back). */
export async function hideRun(id: string, hidden: boolean): Promise<boolean> {
  const r = await db.update(arcadeRuns).set({ hidden }).where(eq(arcadeRuns.id, id)).returning({ id: arcadeRuns.id });
  return r.length > 0;
}

// ── Weekly prizes ──

/** Award a game's finished week's top three, once each (arcade_prizes is unique per game, week and rank). */
export async function awardWeek(game: ArcadeGameKey, week: string): Promise<number> {
  const def = ARCADE_GAMES[game];
  const top = (await weekBoard(game, week, 3)).filter((r) => r.score > 0);
  let awarded = 0;
  for (const r of top) {
    const gems = def.prize.gems[r.rank - 1] ?? 0;
    const won = await db.transaction(async (tx) => {
      const [p] = await tx.insert(arcadePrizes).values({ game, week, rank: r.rank, characterId: r.characterId, score: r.score })
        .onConflictDoNothing().returning({ rank: arcadePrizes.rank });
      if (!p) return false;
      await tx.update(characters).set({ gems: sql`${characters.gems} + ${gems}` }).where(eq(characters.id, r.characterId));
      await tx.insert(gemTransactions).values({ characterId: r.characterId, delta: gems, source: "arcade_prize", packKey: game, stripeSessionId: null });
      const [owned] = await tx.select({ k: cosmeticOwnerships.itemKey }).from(cosmeticOwnerships)
        .where(and(eq(cosmeticOwnerships.characterId, r.characterId), eq(cosmeticOwnerships.itemKey, def.prize.cosmetic)));
      if (!owned) await tx.insert(cosmeticOwnerships).values({ characterId: r.characterId, itemKey: def.prize.cosmetic, source: "prize" });
      return true;
    });
    if (!won) continue;
    awarded++;
    const place = ["1st", "2nd", "3rd"][r.rank - 1];
    await createMoment(r.characterId, "arcade_champion", {
      headline: `${place} in ${def.name}`,
      sub: `the week of ${week} · ${r.score.toLocaleString("en-US")} points`,
      share: `I came ${place} in this week's ${def.name} on thegroove ${def.emoji}`,
      art: { kind: "enemy", key: game === "whistle" ? "sheep" : game === "derby" ? "duck" : "cow" },
      extra: `${gems} gems and the ${def.prize.title} title`,
    }, `arcade:${game}:${week}`);
  }
  return awarded;
}

/** tickd, hourly: award last week for every game that hasn't been. */
export async function awardLastWeek(nowMs = Date.now()): Promise<number> {
  let n = 0;
  for (const game of ARCADE_KEYS) n += await awardWeek(game, lastWeek(nowMs));
  return n;
}

/** Titles the arcade gives (collectionServer's unlockedTitles): each game's, once won. */
export async function arcadeTitles(characterId: number): Promise<string[]> {
  const r = await db.selectDistinct({ game: arcadePrizes.game }).from(arcadePrizes).where(eq(arcadePrizes.characterId, characterId));
  return r.map((x) => ARCADE_GAMES[x.game]?.prize.title).filter((t): t is string => !!t);
}
