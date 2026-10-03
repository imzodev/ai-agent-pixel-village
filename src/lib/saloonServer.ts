// The saloon: blackjack against the innkeeper, liar's dice at the inn
// table, and arm wrestling. Coins only, small stakes, and daily limits on
// what you can win or lose. Games are held here (the client only ever sees
// its own cards and dice); players at a table get a WebSocket nudge when it
// changes and poll as a fallback.

import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { armMatches, characters, diceTables, saloonHands, saloonResults } from "@/db/schema";
import { getBuildingDoor } from "./buildingsServer";
import { livePlayersNear, nudgeSaloon } from "./world-stream";
import { INNS, INN_PATRON_PX, INN_REACH_PX } from "./inn";
import { DAILY_WIN_CAP, MAX_BET, MIN_BET, mayPlay, validBet } from "./saloon/rules";
import { blackjackView, deal, double, hit, payout, stand } from "./saloon/blackjack";
import { bid, call, diceView, emptyTable, finish, leave, sit, start, tidy } from "./saloon/dice";
import { ARM_INVITE_MS, ARM_ROUNDS, ARM_WINDOW_MS, armRound, decided, innkeeperPull, pullScore } from "./saloon/arm";
import type { ArmMatchState, ArmMatchView, BlackjackHand, DbExec, DiceTableState, SaloonGame, SaloonView } from "@/types/saloon";
import type { Point } from "@/types/world";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
/** Thrown inside a transaction to undo its coin moves and report `message`. */
class SaloonAbort extends Error {}

// ── Money and limits ─────────────────────────────────────────────────────
/** Take `n` coins if the player has them. */
async function charge(characterId: number, n: number, x: DbExec = db): Promise<boolean> {
  const [r] = await x.update(characters).set({ coins: sql`${characters.coins} - ${n}` })
    .where(and(eq(characters.id, characterId), sql`${characters.coins} >= ${n}`)).returning({ id: characters.id });
  return !!r;
}
async function credit(characterId: number, n: number, x: DbExec = db): Promise<void> {
  if (n > 0) await x.update(characters).set({ coins: sql`${characters.coins} + ${n}` }).where(eq(characters.id, characterId));
}
async function record(characterId: number, game: SaloonGame, net: number, x: DbExec = db): Promise<void> {
  if (net !== 0) await x.insert(saloonResults).values({ characterId, game, net });
}
const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };
const weekStart = () => { const d = dayStart(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; };

/** A player's net winnings today. */
export async function todayNet(characterId: number): Promise<number> {
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${saloonResults.net}), 0)::int` }).from(saloonResults)
    .where(and(eq(saloonResults.characterId, characterId), gt(saloonResults.at, dayStart())));
  return r?.n ?? 0;
}

/** This week's biggest winners. */
async function leaders(): Promise<{ name: string; net: number }[]> {
  const rows = await db.select({ name: characters.name, net: sql<number>`sum(${saloonResults.net})::int` }).from(saloonResults)
    .innerJoin(characters, eq(characters.id, saloonResults.characterId))
    .where(gt(saloonResults.at, weekStart())).groupBy(characters.name)
    .having(sql`sum(${saloonResults.net}) > 0`).orderBy(desc(sql`sum(${saloonResults.net})`)).limit(10);
  return rows;
}

async function canPlay(characterId: number): Promise<Result> {
  const m = mayPlay(await todayNet(characterId));
  return m.ok ? { ok: true } : fail(m.error);
}

/** You must be in (at the door of) this inn. */
export async function atInn(inn: string, pos: Point): Promise<boolean> {
  if (!(inn in INNS)) return false;
  const door = await getBuildingDoor(inn);
  return !!door && Math.hypot(door.x - pos.x, door.y - pos.y) <= INN_REACH_PX;
}

const nameOf = async (id: number) => (await db.select({ name: characters.name }).from(characters).where(eq(characters.id, id)))[0]?.name ?? "Someone";

// ── Blackjack ────────────────────────────────────────────────────────────
async function handOf(characterId: number, x: DbExec = db): Promise<BlackjackHand | null> {
  const [r] = await x.select({ hand: saloonHands.hand }).from(saloonHands).where(eq(saloonHands.characterId, characterId));
  return r?.hand ?? null;
}
async function saveHand(characterId: number, hand: BlackjackHand, x: DbExec): Promise<void> {
  await x.insert(saloonHands).values({ characterId, hand, updatedAt: new Date() })
    .onConflictDoUpdate({ target: saloonHands.characterId, set: { hand, updatedAt: new Date() } });
}
/** Settle a finished hand: pay out, record it. */
async function settleHand(characterId: number, h: BlackjackHand, x: DbExec): Promise<string> {
  const back = payout(h);
  await credit(characterId, back, x);
  await record(characterId, "blackjack", back - h.bet, x);
  const words = { blackjack: "Blackjack!", won: "You win!", push: "Push — bets back.", lost: "The house wins.", bust: "Bust!", playing: "" } as const;
  return `${words[h.status]} ${back - h.bet > 0 ? `+${back - h.bet}` : back - h.bet < 0 ? `${back - h.bet}` : "±0"} 🪙`;
}

export async function blackjack(characterId: number, action: string, bet: number): Promise<Result> {
  if (action === "deal") {
    if (!validBet(bet)) return fail(`Bets are ${MIN_BET}–${MAX_BET} coins.`);
    const p = await canPlay(characterId);
    if (!p.ok) return p;
  }
  // One move at a time per player: a double click can't settle a hand twice.
  return db.transaction(async (tx): Promise<Result> => {
    await tx.execute(sql`select pg_advisory_xact_lock(7001, ${characterId})`);
    const cur = await handOf(characterId, tx);
    if (action === "deal") {
      if (cur?.status === "playing") return fail("Finish this hand first.");
      if (!(await charge(characterId, bet, tx))) return fail("You can't cover that bet.");
      const h = deal(bet);
      await saveHand(characterId, h, tx);
      return { ok: true, message: h.status === "playing" ? undefined : await settleHand(characterId, h, tx) };
    }
    if (!cur || cur.status !== "playing") return fail("Deal a hand first.");
    if (action === "double") {
      if (cur.player.length !== 2) return fail("You can only double on your first two cards.");
      if (!(await charge(characterId, cur.bet, tx))) return fail("You can't cover the double.");
      double(cur);
    } else if (action === "hit") hit(cur);
    else if (action === "stand") stand(cur);
    else return fail("Unknown move.");
    await saveHand(characterId, cur, tx);
    return { ok: true, message: cur.status === "playing" ? undefined : await settleHand(characterId, cur, tx) };
  });
}

// ── Liar's dice ──────────────────────────────────────────────────────────
async function loadTable(inn: string): Promise<DiceTableState> {
  const [r] = await db.select({ state: diceTables.state }).from(diceTables).where(eq(diceTables.innKey, inn));
  return r?.state ?? emptyTable();
}

/**
 * Change a table under a row lock, so moves never interleave. `fn` mutates
 * the state (moving coins through `x`, the same transaction) and returns an
 * error, or null when it changed. Everyone at the table gets a nudge.
 */
async function withTable(inn: string, fn: (t: DiceTableState, x: DbExec) => Promise<string | null> | string | null): Promise<Result> {
  await db.insert(diceTables).values({ innKey: inn, state: emptyTable() }).onConflictDoNothing();
  let seated: number[] = [];
  const err = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(diceTables).where(eq(diceTables.innKey, inn)).for("update");
    const t = row.state;
    const before = t.seats.map((s) => s.id);
    const e = await fn(t, tx);
    if (e) return e;
    await tx.update(diceTables).set({ state: t, version: row.version + 1 }).where(eq(diceTables.innKey, inn));
    seated = [...new Set([...before, ...t.seats.map((s) => s.id)])];
    return null;
  });
  if (err) return fail(err);
  nudgeSaloon(seated, inn);
  return { ok: true };
}

/** Pay out a finished game, if this move ended it. */
async function payWinner(t: DiceTableState, x: DbExec): Promise<void> {
  const r = finish(t);
  if (!r) return;
  await credit(r.winnerId, r.pot, x);
  await record(r.winnerId, "dice", r.pot, x);
}

export async function dice(characterId: number, inn: string, action: string, body: { ante?: number; qty?: number; face?: number }): Promise<Result> {
  const now = Date.now();
  if (action === "sit") {
    const p = await canPlay(characterId);
    if (!p.ok) return p;
    const name = await nameOf(characterId);
    return withTable(inn, (t) => {
      const ante = t.seats.length ? t.ante : Number(body.ante);
      if (!t.seats.length && !validBet(ante)) return `The ante is ${MIN_BET}–${MAX_BET} coins.`;
      return sit(t, { id: characterId, name }, ante, now);
    });
  }
  if (action === "leave") return withTable(inn, async (t, x) => { leave(t, characterId, now); await payWinner(t, x); return null; });
  if (action === "start") {
    return withTable(inn, async (t, x) => {
      if (!t.seats.some((s) => s.id === characterId)) return "Sit down first.";
      if (t.phase !== "waiting") return "Already playing.";
      // Everyone antes up; anyone who can't is stood up.
      const paid = [];
      for (const s of t.seats) if (await charge(s.id, t.ante, x)) paid.push(s);
      t.seats = paid;
      const err = start(t, now);
      if (err) throw new SaloonAbort(err); // roll the antes back
      for (const s of t.seats) await record(s.id, "dice", -t.ante, x);
      return null;
    }).catch((e) => (e instanceof SaloonAbort ? fail(e.message) : Promise.reject(e)));
  }
  if (action === "bid") return withTable(inn, (t) => bid(t, characterId, Number(body.qty), Number(body.face), now));
  if (action === "call") return withTable(inn, async (t, x) => { const e = call(t, characterId, now); if (!e) await payWinner(t, x); return e; });
  return fail("Unknown move.");
}

/** Read a table: time out slow turns, let idle players go, mark `viewer` present. */
async function diceFor(inn: string, viewer: number): Promise<DiceTableState> {
  const now = Date.now();
  const state = await loadTable(inn);
  const me = state.seats.find((s) => s.id === viewer);
  const stale = me && now - me.seenAt > 10_000;
  if (stale || state.seats.some((s) => !s.left && now - s.seenAt > 45_000) || (state.phase === "playing" && now > state.deadline)) {
    await withTable(inn, async (t, x) => {
      const m = t.seats.find((s) => s.id === viewer);
      if (m) m.seenAt = now;
      tidy(t, now);
      await payWinner(t, x);
      return null;
    });
    return loadTable(inn);
  }
  return state;
}

// ── Arm wrestling ────────────────────────────────────────────────────────
/** The match a player is in (or just finished, or sent an invite for). */
async function myMatchId(characterId: number): Promise<number | null> {
  const [r] = await db.select({ id: armMatches.id }).from(armMatches)
    .where(and(or(eq(armMatches.a, characterId), eq(armMatches.b, characterId)), or(eq(armMatches.status, "playing"), and(eq(armMatches.status, "invited"), eq(armMatches.a, characterId)), and(eq(armMatches.status, "done"), gt(armMatches.updatedAt, new Date(Date.now() - 20_000))))))
    .orderBy(desc(armMatches.id)).limit(1);
  return r?.id ?? null;
}

/** Change a match under a row lock (coins move in the same transaction). */
async function withMatch(id: number, fn: (m: ArmMatchState, x: DbExec) => Promise<string | null | "unchanged">): Promise<{ ok: true; state: ArmMatchState; inn: string } | { ok: false; error: string }> {
  let inn = "";
  let out: ArmMatchState | null = null;
  let changed = false;
  const err = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(armMatches).where(eq(armMatches.id, id)).for("update");
    if (!row) return "That match is over.";
    inn = row.innKey;
    const m = row.state;
    const e = await fn(m, tx);
    out = m;
    if (e === "unchanged") return null;
    if (e) return e;
    await tx.update(armMatches).set({ state: m, status: m.status, version: row.version + 1, updatedAt: new Date() }).where(eq(armMatches.id, id));
    changed = true;
    return null;
  });
  // Nudge only once it's committed, so a refetch sees the change.
  const m = out as ArmMatchState | null;
  if (changed && m) nudgeSaloon([m.a, ...(m.b != null ? [m.b] : [])], inn);
  return err ? { ok: false, error: err } : { ok: true, state: m!, inn };
}

/** Score whoever let a round run out, and close the match once it's decided. */
async function advance(m: ArmMatchState, now: number, x: DbExec): Promise<boolean> {
  if (m.status !== "playing") return false;
  let changed = false;
  const r = m.rounds[m.round];
  if (r && now > r.startAt + ARM_WINDOW_MS) {
    if (m.scores.a[m.round] == null) { m.scores.a[m.round] = 0; changed = true; }
    if (m.scores.b[m.round] == null) { m.scores.b[m.round] = 0; changed = true; }
  }
  if (m.scores.a[m.round] != null && m.scores.b[m.round] != null) {
    const d = decided(m.scores);
    if (d) {
      m.status = "done";
      const pot = m.stake * 2;
      if (d === "draw") { await credit(m.a, m.stake, x); if (m.b != null) await credit(m.b, m.stake, x); }
      else {
        const w = d === "a" ? m.a : m.b;
        m.winner = w;
        if (w != null) { await credit(w, pot, x); await record(w, "arm", m.stake, x); }
        const l = d === "a" ? m.b : m.a;
        if (l != null) await record(l, "arm", -m.stake, x);
      }
    } else if (m.round < ARM_ROUNDS - 1) {
      m.round++;
      m.rounds.push(armRound(now + 2500));
      m.scores.a.push(null);
      m.scores.b.push(null);
    }
    changed = true;
  }
  return changed;
}

const freshMatch = (a: number, b: number | null, aName: string, bName: string, stake: number, now: number, status: ArmMatchState["status"]): ArmMatchState => ({
  a, b, aName, bName, stake, status, round: 0, rounds: status === "playing" ? [armRound(now + 2500)] : [], scores: { a: status === "playing" ? [null] : [], b: status === "playing" ? [null] : [] }, winner: null, createdAt: now,
});

export async function arm(characterId: number, inn: string, action: string, body: { stake?: number; target?: number; id?: number; t?: number }): Promise<Result> {
  const now = Date.now();
  const busy = async (id: number) => (await db.select({ id: armMatches.id }).from(armMatches).where(and(or(eq(armMatches.a, id), eq(armMatches.b, id)), eq(armMatches.status, "playing"))).limit(1)).length > 0;
  if (action === "innkeeper" || action === "challenge") {
    const stake = Number(body.stake);
    if (!validBet(stake)) return fail(`Stakes are ${MIN_BET}–${MAX_BET} coins.`);
    const p = await canPlay(characterId);
    if (!p.ok) return p;
    if (await busy(characterId)) return fail("You're already wrestling.");
    const me = await nameOf(characterId);
    if (action === "innkeeper") {
      if (!(await charge(characterId, stake))) return fail("You can't cover that stake.");
      await db.insert(armMatches).values({ innKey: inn, a: characterId, b: null, status: "playing", state: freshMatch(characterId, null, me, "The innkeeper", stake, now, "playing") });
      return { ok: true, message: "💪 You lock hands with the innkeeper…" };
    }
    const target = Number(body.target);
    const door = await getBuildingDoor(inn);
    if (!door || target === characterId || !livePlayersNear(door.x, door.y, INN_PATRON_PX).includes(target)) return fail("They're not here.");
    if (await busy(target)) return fail("They're already wrestling.");
    await db.delete(armMatches).where(and(eq(armMatches.a, characterId), eq(armMatches.status, "invited")));
    await db.insert(armMatches).values({ innKey: inn, a: characterId, b: target, status: "invited", state: freshMatch(characterId, target, me, await nameOf(target), stake, now, "invited") });
    nudgeSaloon([target], inn);
    return { ok: true, message: "💪 Challenge sent." };
  }
  if (action === "accept" || action === "decline") {
    const [r] = await db.select().from(armMatches).where(and(eq(armMatches.id, Number(body.id)), eq(armMatches.b, characterId), eq(armMatches.status, "invited")));
    if (!r || now - r.state.createdAt > ARM_INVITE_MS) return fail("That challenge has gone cold.");
    if (action === "decline") {
      await db.delete(armMatches).where(eq(armMatches.id, r.id));
      nudgeSaloon([r.a], inn);
      return { ok: true };
    }
    const p = await canPlay(characterId);
    if (!p.ok) return p;
    if (await busy(characterId) || await busy(r.a)) return fail("Someone's already wrestling.");
    const res = await withMatch(r.id, async (m, x) => {
      if (m.status !== "invited") return "That challenge has gone cold.";
      if (!(await charge(characterId, m.stake, x))) return "You can't cover that stake.";
      if (!(await charge(m.a, m.stake, x))) throw new SaloonAbort("They can't cover the stake any more.");
      Object.assign(m, { ...freshMatch(m.a, characterId, m.aName, m.bName, m.stake, now, "playing"), createdAt: m.createdAt });
      return null;
    }).catch((e) => (e instanceof SaloonAbort ? { ok: false as const, error: e.message } : Promise.reject(e)));
    if (!res.ok) return fail(res.error);
    return { ok: true, message: "💪 Hands locked!" };
  }
  if (action === "pull") {
    const id = await myMatchId(characterId);
    if (id == null) return fail("You're not wrestling.");
    const res = await withMatch(id, async (s, x) => {
      if (s.status !== "playing") return "You're not wrestling.";
      const side = s.a === characterId ? "a" : "b";
      const round = s.rounds[s.round];
      if (s.scores[side][s.round] != null) return "Wait for them…";
      // The press time, on the server's clock as the client saw it; it must
      // fall inside the round and no later than now (allowing a slow network).
      const t = Number(body.t);
      if (!Number.isFinite(t) || t < round.startAt || t > now + 250 || t < now - 2000) return "Too early — wait for the signal!";
      s.scores[side][s.round] = pullScore(round, t);
      if (s.b == null) s.scores.b[s.round] = innkeeperPull();
      await advance(s, now, x);
      return null;
    });
    return res.ok ? { ok: true } : fail(res.error);
  }
  return fail("Unknown move.");
}

async function armFor(viewer: number): Promise<ArmMatchView | null> {
  const id = await myMatchId(viewer);
  if (id == null) return null;
  const res = await withMatch(id, async (m, x) => {
    if (m.status === "invited" && Date.now() - m.createdAt > ARM_INVITE_MS) { await x.delete(armMatches).where(eq(armMatches.id, id)); return "gone"; }
    return (await advance(m, Date.now(), x)) ? null : "unchanged";
  });
  if (!res.ok) return null;
  return { ...res.state, id, you: res.state.a === viewer ? "a" : "b" };
}

// ── The view ─────────────────────────────────────────────────────────────
export async function saloonView(characterId: number, inn: string): Promise<SaloonView> {
  const [hand, table, armView, invites, today, top] = await Promise.all([
    handOf(characterId),
    diceFor(inn, characterId),
    armFor(characterId),
    db.select().from(armMatches).where(and(eq(armMatches.b, characterId), eq(armMatches.status, "invited"), gt(armMatches.updatedAt, new Date(Date.now() - ARM_INVITE_MS)))),
    todayNet(characterId),
    leaders(),
  ]);
  return {
    blackjack: hand ? blackjackView(hand) : null,
    dice: diceView(table, characterId),
    arm: armView,
    invites: invites.map((i) => ({ id: i.id, from: i.state.aName, stake: i.state.stake })),
    today, dailyCap: DAILY_WIN_CAP, leaders: top, serverTime: Date.now(),
  };
}

/** What patrons at an inn are up to (for the inn panel). */
export async function patronsBusy(inn: string, ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!ids.length) return out;
  const [t] = await db.select({ state: diceTables.state }).from(diceTables).where(eq(diceTables.innKey, inn));
  for (const s of t?.state.seats ?? []) if (!s.left) out.set(s.id, "🎲 at the dice table");
  const arms = await db.select({ a: armMatches.a, b: armMatches.b }).from(armMatches).where(and(eq(armMatches.innKey, inn), eq(armMatches.status, "playing"), or(inArray(armMatches.a, ids), inArray(armMatches.b, ids))));
  for (const m of arms) { out.set(m.a, "💪 arm-wrestling"); if (m.b != null) out.set(m.b, "💪 arm-wrestling"); }
  return out;
}
