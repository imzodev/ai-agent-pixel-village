// Whistle on the server (the game: src/lib/whistle/): a run starts with a
// signed token (when, which day), and its taps come back at the end. The
// server replays them on the day's course and stores the score it gets itself,
// never the browser's. Boards: each player's best run of the day, and the
// week's total of each day's best (Monday to Sunday, UTC). tickd awards the
// week's top three once (awardWeek): gems, a title and a hat, and a moment to share.

import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, cosmeticOwnerships, gemTransactions, users, whistlePrizes, whistleRuns } from "@/db/schema";
import { courseFor, msToNextCourse, weekOf, whistleDay, whistleNumber } from "./whistle/course";
import { cleanInputs, replay } from "./whistle/sim";
import { PRIZE_COSMETIC, PRIZE_TITLE, RUN_TOKEN_MS, TICK_MS, WEEKLY_PRIZE_GEMS } from "./whistle/rules";
import { createMoment, momentId } from "./momentsServer";
import { track } from "./track";
import type { Course, WhistleBoardRow, WhistleRunView, WhistleStart, WhistleSubmitResult, WhistleView } from "@/types/whistle";

const DAY_MS = 86_400_000;

export class WhistleError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

// ── Run tokens: "<startedAt>.<characterId or 0>.<signature>" ──
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
 * The day's course, salted with the secret so it can't be known ahead of its day
 * (without a configured secret, as in development, the plain course).
 */
export function courseOf(day: string): Course {
  const s = configured();
  return courseFor(day, s ? crypto.createHash("sha256").update(`whistle-course:${s}`).digest("hex").slice(0, 16) : "");
}

/** Start a run: today's day and a token to send back with the taps. */
export function startRun(characterId: number | null, nowMs = Date.now()): WhistleStart {
  const body = `${nowMs}.${characterId ?? 0}`;
  track("whistle_play", characterId);
  const day = whistleDay(nowMs);
  return { day, course: courseOf(day), token: `${body}.${sign(body)}` };
}

/** A token's start time and character (0: started before signing in), or null if it isn't ours. */
function readToken(token: string): { startedAt: number; characterId: number } | null {
  const m = /^(\d{13})\.(\d{1,10})\.([\w-]{32})$/.exec(token);
  if (!m) return null;
  const body = `${m[1]}.${m[2]}`;
  const want = Buffer.from(sign(body)), got = Buffer.from(m[3]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  return { startedAt: Number(m[1]), characterId: Number(m[2]) };
}

/** Tokens already used (in memory: a resend after a restart only adds a duplicate row). */
const used = new Map<string, number>();
function spendToken(token: string, nowMs: number): boolean {
  if (used.has(token)) return false;
  if (used.size > 5000) for (const [k, at] of used) if (nowMs - at > RUN_TOKEN_MS) used.delete(k);
  used.set(token, nowMs);
  return true;
}

/** Finish a run: replay its taps on the day's course and keep the score that comes out. */
export async function submitRun(characterId: number, token: string, rawInputs: unknown, nowMs = Date.now()): Promise<WhistleSubmitResult> {
  const t = readToken(String(token ?? ""));
  if (!t) throw new WhistleError("That run can't be checked. Start a new one.");
  if (t.characterId && t.characterId !== characterId) throw new WhistleError("That run was someone else's.");
  if (nowMs - t.startedAt > RUN_TOKEN_MS || nowMs < t.startedAt) throw new WhistleError("That run is too old to count. Start a new one.");
  const inputs = cleanInputs(rawInputs);
  if (!inputs) throw new WhistleError("That run can't be checked. Start a new one.");
  const day = whistleDay(t.startedAt);
  const { result } = replay(courseOf(day), inputs);
  // A run can't finish faster than it plays (a little slack for timers).
  if (nowMs - t.startedAt < result.ticks * TICK_MS * 0.9) throw new WhistleError("That was quicker than the run itself. Start a new one.");
  if (!spendToken(token, nowMs)) throw new WhistleError("That run is already in.");
  const id = momentId();
  await db.insert(whistleRuns).values({ id, characterId, day, score: result.score, penned: result.penned, lost: result.lost, ticks: result.ticks, inputs });
  const best = await bestOf(characterId, day);
  track("whistle_submit", characterId, { day, score: result.score, penned: result.penned });
  return { ...result, runId: id, best, rank: await rankOf(day, best), shareUrl: `/whistle/r/${id}` };
}

// ── Boards ──
type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>): Promise<Row[]> => (await db.execute(q)).rows as Row[];

async function bestOf(characterId: number, day: string): Promise<number> {
  const [r] = await db.select({ best: sql<number>`coalesce(max(${whistleRuns.score}), 0)::int` }).from(whistleRuns)
    .where(and(eq(whistleRuns.characterId, characterId), eq(whistleRuns.day, day), eq(whistleRuns.hidden, false)));
  return r?.best ?? 0;
}

/** 1 + how many players did better than `score` on that day. */
async function rankOf(day: string, score: number): Promise<number> {
  const [r] = await rows(sql`
    SELECT count(*)::int AS n FROM (
      SELECT character_id, max(score) AS best FROM whistle_runs WHERE day = ${day} AND NOT hidden GROUP BY character_id
    ) b WHERE b.best > ${score}`);
  return Number(r?.n ?? 0) + 1;
}

/** The day's board: each player's best run (the earliest of equal ones). */
export async function dayBoard(day: string, limit = 20): Promise<(WhistleBoardRow & { characterId: number })[]> {
  const r = await rows(sql`
    SELECT b.character_id, b.score, b.penned, b.id, c.name FROM (
      SELECT DISTINCT ON (character_id) character_id, score, penned, id, created_at FROM whistle_runs
      WHERE day = ${day} AND NOT hidden ORDER BY character_id, score DESC, created_at ASC
    ) b JOIN characters c ON c.id = b.character_id JOIN users u ON u.id = c.user_id AND u.banned_at IS NULL
    ORDER BY b.score DESC, b.created_at ASC LIMIT ${limit}`);
  return r.map((x, i) => ({ rank: i + 1, characterId: Number(x.character_id), name: String(x.name), score: Number(x.score), penned: Number(x.penned), runId: String(x.id) }));
}

/** The week's board: each player's total of their best score each day. */
export async function weekBoard(week: string, limit = 20): Promise<(WhistleBoardRow & { characterId: number })[]> {
  const end = whistleDay(Date.parse(`${week}T00:00:00Z`) + 6 * DAY_MS);
  const r = await rows(sql`
    SELECT d.character_id, sum(d.best)::int AS total, c.name, min(d.first_at) AS first_at FROM (
      SELECT character_id, day, max(score) AS best, min(created_at) AS first_at FROM whistle_runs
      WHERE day >= ${week} AND day <= ${end} AND NOT hidden GROUP BY character_id, day
    ) d JOIN characters c ON c.id = d.character_id JOIN users u ON u.id = c.user_id AND u.banned_at IS NULL
    GROUP BY d.character_id, c.name ORDER BY total DESC, first_at ASC LIMIT ${limit}`);
  return r.map((x, i) => ({ rank: i + 1, characterId: Number(x.character_id), name: String(x.name), score: Number(x.total) }));
}

/** A week's prize winners (awarded), best first. */
async function champions(week: string): Promise<WhistleBoardRow[]> {
  const r = await db.select({ rank: whistlePrizes.rank, score: whistlePrizes.score, name: characters.name }).from(whistlePrizes)
    .innerJoin(characters, eq(characters.id, whistlePrizes.characterId)).where(eq(whistlePrizes.week, week)).orderBy(whistlePrizes.rank);
  return r.map((x) => ({ rank: x.rank, name: x.name, score: x.score }));
}

const lastWeek = (nowMs: number): string => weekOf(whistleDay(Date.parse(`${weekOf(whistleDay(nowMs))}T00:00:00Z`) - DAY_MS));

/** What the Whistle page shows. */
export async function whistleView(me: { id: number; name: string } | null, nowMs = Date.now()): Promise<WhistleView> {
  const day = whistleDay(nowMs), week = weekOf(day);
  const [today, wk, champs] = await Promise.all([dayBoard(day), weekBoard(week), champions(lastWeek(nowMs))]);
  const mark = <T extends WhistleBoardRow & { characterId: number }>(list: T[]): WhistleBoardRow[] =>
    list.map(({ characterId, ...r }) => (me && characterId === me.id ? { ...r, me: true } : r));
  let mine: WhistleView["me"] = null;
  if (me) {
    const best = await bestOf(me.id, day);
    const weekRow = wk.find((r) => r.characterId === me.id);
    mine = { name: me.name, best: best || null, rank: best ? await rankOf(day, best) : null, weekRank: weekRow?.rank ?? null };
  }
  return { day, number: whistleNumber(day), course: courseOf(day), nextInMs: msToNextCourse(nowMs), today: mark(today), week: mark(wk), champions: champs, me: mine };
}

/** A run for its replay page (null when unknown or hidden). */
export async function runById(id: string): Promise<WhistleRunView | null> {
  if (!/^[A-Za-z0-9]{6,20}$/.test(id)) return null;
  const [r] = await db.select({ run: whistleRuns, name: characters.name, username: users.username, banned: users.bannedAt }).from(whistleRuns)
    .innerJoin(characters, eq(characters.id, whistleRuns.characterId))
    .leftJoin(users, eq(users.id, characters.userId))
    .where(and(eq(whistleRuns.id, id), eq(whistleRuns.hidden, false)));
  if (!r || r.banned) return null;
  return { id: r.run.id, day: r.run.day, number: whistleNumber(r.run.day), course: courseOf(r.run.day), name: r.name, username: r.username, score: r.run.score, penned: r.run.penned, lost: r.run.lost, inputs: r.run.inputs };
}

/** Admin: take a run off the boards (or put it back). */
export async function hideRun(id: string, hidden: boolean): Promise<boolean> {
  const r = await db.update(whistleRuns).set({ hidden }).where(eq(whistleRuns.id, id)).returning({ id: whistleRuns.id });
  return r.length > 0;
}

// ── Weekly prizes ──
/** Award a finished week's top three, once each (whistle_prizes is unique per week and rank). */
export async function awardWeek(week: string): Promise<number> {
  const top = (await weekBoard(week, 3)).filter((r) => r.score > 0);
  let awarded = 0;
  for (const r of top) {
    const gems = WEEKLY_PRIZE_GEMS[r.rank - 1] ?? 0;
    const won = await db.transaction(async (tx) => {
      const [p] = await tx.insert(whistlePrizes).values({ week, rank: r.rank, characterId: r.characterId, score: r.score })
        .onConflictDoNothing().returning({ rank: whistlePrizes.rank });
      if (!p) return false;
      await tx.update(characters).set({ gems: sql`${characters.gems} + ${gems}` }).where(eq(characters.id, r.characterId));
      await tx.insert(gemTransactions).values({ characterId: r.characterId, delta: gems, source: "whistle_prize", packKey: null, stripeSessionId: null });
      const [owned] = await tx.select({ k: cosmeticOwnerships.itemKey }).from(cosmeticOwnerships)
        .where(and(eq(cosmeticOwnerships.characterId, r.characterId), eq(cosmeticOwnerships.itemKey, PRIZE_COSMETIC)));
      if (!owned) await tx.insert(cosmeticOwnerships).values({ characterId: r.characterId, itemKey: PRIZE_COSMETIC, source: "prize" });
      return true;
    });
    if (!won) continue;
    awarded++;
    const place = ["1st", "2nd", "3rd"][r.rank - 1];
    await createMoment(r.characterId, "whistle_champion", {
      headline: `${place} in Whistle`,
      sub: `the week of ${week} · ${r.score.toLocaleString("en-US")} points`,
      share: `I came ${place} in this week's Whistle on thegroove 🐑 Herding sheep is harder than it looks`,
      art: { kind: "enemy", key: "sheep" },
      extra: `${gems} gems and the ${PRIZE_TITLE}'s hat`,
    }, `whistle:${week}`);
  }
  return awarded;
}

/** tickd, hourly: award last week if it hasn't been. */
export async function awardLastWeek(nowMs = Date.now()): Promise<number> {
  return awardWeek(lastWeek(nowMs));
}

/** Titles Whistle gives (collectionServer's unlockedTitles). */
export async function whistleTitles(characterId: number): Promise<string[]> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(whistlePrizes).where(eq(whistlePrizes.characterId, characterId));
  return (r?.n ?? 0) > 0 ? [PRIZE_TITLE] : [];
}
