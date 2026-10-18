// Jobs, the server part (the rules are src/lib/jobs.ts): hiring, today's
// shift (hand in goods, carry letters, guard the roads, ride with the
// caravan), the wage, promotions and being let go. Each change to a job row
// happens under a row lock, so a double click can't pay a shift twice.
// Safe for tickd (escorts): no WS-server imports; routes pass live positions.

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, inventory, jobs, npcs } from "@/db/schema";
import { addCoins, addItem, logEvent, removeItem } from "./game";
import { rowPositionAt } from "./motion";
import { npcDef } from "./npcDefs";
import { employerPays } from "./mind/mindServer";
import { regardHelped } from "./mind/regard";
import {
  JOB_DEFS, dayKey, escortEarned, flatWage, hireBlock, inGuardArea, jobDef, jobsOfEmployer, letGo, letterPay, nextStreak,
  pickRecipients, rankFor, shiftNeed, shiftPay, supplyPay, taskText, toNextRank, ESCORT_PX, GUARD_PER_BEAST,
} from "./jobs";
import type { JobDef, JobOffer, JobProgress, JobView } from "@/types/jobs";

type JobRow = typeof jobs.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Result = { ok: true; message: string; notices: string[]; gained?: { itemKey: string; qty: number }[] } | { ok: false; error: string };

/** How close (px) to an employer or a letter's recipient you must stand. */
export const JOB_REACH_PX = 14 * 16;

const nameOf = (npcKey: string) => npcDef(npcKey)?.name ?? npcKey;
const fresh = (day: string): JobProgress => ({ day, count: 0, done: false });
/** "Bring 20 wheat to Hollis" → "bring 20 wheat to Hollis" (names keep their capitals). */
const lower1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Bring a row up to today: a new day starts a fresh shift (yesterday's letters are recalled); too many missed days lets you go. */
async function settle(tx: Tx | typeof db, row: JobRow, now: number): Promise<JobRow> {
  if (row.status !== "active") return row;
  const today = dayKey(now);
  if (letGo(row.lastShiftDay, row.hiredDay, today)) {
    const [r] = await tx.update(jobs).set({ status: "fired", endedAt: new Date(now), progress: null }).where(eq(jobs.id, row.id)).returning();
    await recallLetters(row);
    const def = jobDef(row.jobKey);
    if (def) await logEvent("job", `${await charName(row.characterId)} was let go by ${nameOf(def.employerKey)} for missing too many days.`, "character", row.characterId);
    return r;
  }
  if (row.progress?.day === today) return row;
  if (row.progress?.letters?.length) await recallLetters(row);
  const [r] = await tx.update(jobs).set({ progress: fresh(today) }).where(eq(jobs.id, row.id)).returning();
  return r;
}

async function recallLetters(row: JobRow): Promise<void> {
  await db.delete(inventory).where(and(eq(inventory.characterId, row.characterId), eq(inventory.itemKey, "letter"), sql`${inventory.meta}->>'job' = ${row.jobKey}`));
}

async function charName(id: number): Promise<string> {
  const [c] = await db.select({ name: characters.name }).from(characters).where(eq(characters.id, id));
  return c?.name ?? "Someone";
}

function viewOf(row: JobRow, def: JobDef): JobView {
  const rank = rankFor(row.shiftsDone);
  const p = row.progress;
  return {
    key: def.key, kind: def.kind, employerKey: def.employerKey, employerName: nameOf(def.employerKey), title: def.titles[rank], rank,
    status: row.status, shiftsDone: row.shiftsDone, streak: row.streak, toNextRank: toNextRank(row.shiftsDone),
    need: shiftNeed(def.shift, rank), count: p?.count ?? 0, done: p?.done ?? false, task: taskText(def, rank), pay: shiftPay(def, rank),
    ...(p?.letters ? { letters: p.letters } : {}),
  };
}

/** Your jobs (active ones), each brought up to today. */
export async function jobsFor(characterId: number, now = Date.now()): Promise<JobView[]> {
  const rows = await db.select().from(jobs).where(and(eq(jobs.characterId, characterId), eq(jobs.status, "active")));
  const out: JobView[] = [];
  for (const r of rows) {
    const def = jobDef(r.jobKey);
    if (!def) continue;
    const s = await settle(db, r, now);
    if (s.status === "active") out.push(viewOf(s, def));
  }
  return out;
}

/** What an employer offers you. */
export async function offersAt(character: { id: number; level: number }, npcKey: string, now = Date.now()): Promise<JobOffer[]> {
  const defs = jobsOfEmployer(npcKey);
  if (!defs.length) return [];
  const mine = await jobsFor(character.id, now);
  const past = await db.select().from(jobs).where(and(eq(jobs.characterId, character.id), inArray(jobs.jobKey, defs.map((d) => d.key))));
  return defs.map((def) => {
    const row = past.find((r) => r.jobKey === def.key);
    const blocked = hireBlock(def, { level: character.level, activeKeys: mine.map((j) => j.key), endedAt: row?.status !== "active" ? row?.endedAt?.getTime() ?? null : null, now });
    return { key: def.key, kind: def.kind, title: def.titles[0], pitch: def.pitch, task: taskText(def, 0), pay: shiftPay(def, 0), minLevel: def.minLevel, blocked, mine: mine.find((j) => j.key === def.key) ?? null };
  });
}

/** Is the player (at their live position, which the route passes in) standing by this NPC? */
async function near(_characterId: number, me: { x: number; y: number }, npcKey: string): Promise<boolean> {
  const [n] = await db.select().from(npcs).where(eq(npcs.key, npcKey));
  if (!n) return false;
  const them = rowPositionAt(n, Date.now());
  return Math.hypot(me.x - them.x, me.y - them.y) <= JOB_REACH_PX;
}

export async function hire(character: { id: number; level: number; name: string; x: number; y: number }, jobKey: string, now = Date.now()): Promise<Result> {
  const def = jobDef(jobKey);
  if (!def) return { ok: false, error: "There's no such job." };
  if (!(await near(character.id, character, def.employerKey))) return { ok: false, error: `Talk to ${nameOf(def.employerKey)} in person.` };
  const active = await jobsFor(character.id, now);
  const [old] = await db.select().from(jobs).where(and(eq(jobs.characterId, character.id), eq(jobs.jobKey, jobKey)));
  const blocked = hireBlock(def, { level: character.level, activeKeys: active.map((j) => j.key), endedAt: old && old.status !== "active" ? old.endedAt?.getTime() ?? null : null, now });
  if (blocked) return { ok: false, error: blocked };
  const today = dayKey(now);
  // Back after quitting: your record stands. Back after being let go: you start over.
  const keep = old?.status === "quit";
  const values = { status: "active" as const, hiredDay: today, lastShiftDay: null, progress: fresh(today), endedAt: null, shiftsDone: keep ? old!.shiftsDone : 0, streak: 0 };
  if (old) await db.update(jobs).set(values).where(eq(jobs.id, old.id));
  else await db.insert(jobs).values({ characterId: character.id, jobKey, ...values });
  const rank = rankFor(values.shiftsDone);
  await logEvent("job", `${character.name} was taken on by ${nameOf(def.employerKey)} as ${def.titles[rank]}.`, "character", character.id, character.x, character.y);
  return { ok: true, message: `You're hired: ${def.titles[rank]} for ${nameOf(def.employerKey)}. Today: ${lower1(taskText(def, rank))}.`, notices: [] };
}

export async function quit(characterId: number, jobKey: string, now = Date.now()): Promise<Result> {
  const [row] = await db.update(jobs).set({ status: "quit", endedAt: new Date(now), progress: null })
    .where(and(eq(jobs.characterId, characterId), eq(jobs.jobKey, jobKey), eq(jobs.status, "active"))).returning();
  if (!row) return { ok: false, error: "You don't work there." };
  await recallLetters(row);
  return { ok: true, message: `You've left your job with ${nameOf(jobDef(jobKey)?.employerKey ?? "")}.`, notices: [] };
}

/** Lock one of your active jobs for a change, brought up to today. */
async function locked(tx: Tx, characterId: number, jobKey: string, now: number): Promise<{ row: JobRow; def: JobDef } | null> {
  const [r] = await tx.select().from(jobs).where(and(eq(jobs.characterId, characterId), eq(jobs.jobKey, jobKey), eq(jobs.status, "active"))).for("update");
  const def = r ? jobDef(r.jobKey) : undefined;
  if (!r || !def) return null;
  const row = await settle(tx, r, now);
  return row.status === "active" ? { row, def } : null;
}

/**
 * A shift is done: the day's wage (from the employer's purse when it has a
 * mind), the shift counted, the streak kept, and a promotion when it's due.
 */
async function finishShift(tx: Tx, row: JobRow, def: JobDef, progress: JobProgress, now: number): Promise<{ wage: number; notices: string[] }> {
  const today = dayKey(now);
  const before = rankFor(row.shiftsDone);
  const wage = flatWage(def.kind, before);
  const shiftsDone = row.shiftsDone + 1;
  await tx.update(jobs).set({ progress: { ...progress, done: true }, shiftsDone, streak: nextStreak(row.lastShiftDay, row.streak, today), lastShiftDay: today }).where(eq(jobs.id, row.id));
  await addCoins(row.characterId, wage);
  await employerPays(def.employerKey, {}, wage);
  const notices = [`✅ Shift done for ${nameOf(def.employerKey)}: +${wage} 🪙 wages.`];
  const after = rankFor(shiftsDone);
  if (after > before) {
    notices.push(`🎉 Promoted! You're now ${def.titles[after]} for ${nameOf(def.employerKey)}: better pay.`);
    await logEvent("job", `${await charName(row.characterId)} was promoted to ${def.titles[after]} by ${nameOf(def.employerKey)}.`, "character", row.characterId);
  }
  const [emp] = await db.select({ id: npcs.id }).from(npcs).where(eq(npcs.key, def.employerKey));
  if (emp) await regardHelped(emp.id, row.characterId, 2);
  return { wage, notices };
}

/** At the employer: suppliers hand in today's goods; couriers pick up today's letters. */
export async function workShift(character: { id: number; x: number; y: number }, jobKey: string, now = Date.now()): Promise<Result> {
  const def = jobDef(jobKey);
  if (!def) return { ok: false, error: "There's no such job." };
  if (!(await near(character.id, character, def.employerKey))) return { ok: false, error: `Go to ${nameOf(def.employerKey)} first.` };
  return db.transaction(async (tx): Promise<Result> => {
    const j = await locked(tx, character.id, jobKey, now);
    if (!j) return { ok: false, error: "You don't work there (any more)." };
    const { row } = j;
    const rank = rankFor(row.shiftsDone);
    const p = row.progress ?? fresh(dayKey(now));
    if (p.done) return { ok: false, error: "Today's shift is done. Come back tomorrow." };
    const s = def.shift;
    if (s.kind === "supply") {
      const need = shiftNeed(s, rank) - p.count;
      const [bag] = await Promise.all([db.select({ itemKey: inventory.itemKey, qty: sql<number>`sum(${inventory.qty})::int` }).from(inventory)
        .where(and(eq(inventory.characterId, character.id), inArray(inventory.itemKey, [...s.items]))).groupBy(inventory.itemKey)]);
      let given = 0, coins = 0;
      const gave: Record<string, number> = {};
      for (const b of bag) {
        const n = Math.min(b.qty, need - given);
        if (n <= 0 || !(await removeItem(character.id, b.itemKey, n))) continue;
        given += n; coins += supplyPay(b.itemKey, n); gave[b.itemKey] = n;
      }
      if (given === 0) return { ok: false, error: `You have nothing ${nameOf(def.employerKey)} needs. ${taskText(def, rank)}.` };
      await addCoins(character.id, coins);
      await employerPays(def.employerKey, gave, coins); // the goods go into the employer's real stock
      const progress = { ...p, count: p.count + given };
      const notices: string[] = [];
      if (progress.count >= shiftNeed(s, rank)) notices.push(...(await finishShift(tx, row, def, progress, now)).notices);
      else await tx.update(jobs).set({ progress }).where(eq(jobs.id, row.id));
      return { ok: true, message: `Handed in ${given} (+${coins} 🪙). ${progress.count}/${shiftNeed(s, rank)} today.`, notices };
    }
    if (s.kind === "letters") {
      if (p.letters?.length) return { ok: false, error: "You've got today's letters. Deliver them!" };
      const from = npcDef(def.employerKey)!.tilePos;
      const to = pickRecipients(character.id, p.day, def.employerKey, rank, s.count);
      const letters = to.map((k) => { const t = npcDef(k)!.tilePos; return { to: k, toName: nameOf(k), pay: letterPay({ tx: from[0], ty: from[1] }, { tx: t[0], ty: t[1] }, rank), delivered: false }; });
      for (const l of letters) await addItem(character.id, "letter", 1, { to: l.to, job: jobKey, toName: nameOf(l.to) });
      await tx.update(jobs).set({ progress: { ...p, letters } }).where(eq(jobs.id, row.id));
      return { ok: true, message: `Today's letters: ${letters.map((l) => `${nameOf(l.to)} (${l.pay} 🪙)`).join(", ")}.`, notices: [], gained: [{ itemKey: "letter", qty: letters.length }] };
    }
    return { ok: false, error: s.kind === "guard" ? `Out on the roads: ${lower1(taskText(def, rank))}.` : "Find the caravan and ride along with it." };
  });
}

/** Hand a letter to its recipient. */
export async function deliverLetter(character: { id: number; x: number; y: number }, npcKey: string, now = Date.now()): Promise<Result> {
  if (!(await near(character.id, character, npcKey))) return { ok: false, error: `You need to be next to ${nameOf(npcKey)}.` };
  const couriers = JOB_DEFS.filter((d) => d.shift.kind === "letters");
  return db.transaction(async (tx): Promise<Result> => {
    for (const d of couriers) {
      const j = await locked(tx, character.id, d.key, now);
      const p = j?.row.progress;
      const i = p?.letters?.findIndex((l) => l.to === npcKey && !l.delivered) ?? -1;
      if (!j || !p || i < 0) continue;
      const [item] = await db.select().from(inventory).where(and(eq(inventory.characterId, character.id), eq(inventory.itemKey, "letter"), sql`${inventory.meta}->>'to' = ${npcKey}`, sql`${inventory.meta}->>'job' = ${d.key}`)).limit(1);
      if (!item) return { ok: false, error: "You've lost that letter somewhere." };
      await db.delete(inventory).where(eq(inventory.id, item.id));
      const letter = p.letters![i];
      const letters = p.letters!.map((l, k) => (k === i ? { ...l, delivered: true } : l));
      const progress = { ...p, letters, count: p.count + 1 };
      await addCoins(character.id, letter.pay);
      const notices: string[] = [];
      if (letters.every((l) => l.delivered)) notices.push(...(await finishShift(tx, j.row, d, progress, now)).notices);
      else await tx.update(jobs).set({ progress }).where(eq(jobs.id, j.row.id));
      return { ok: true, message: `✉️ ${nameOf(npcKey)} takes the letter. +${letter.pay} 🪙`, notices };
    }
    return { ok: false, error: `You have no letter for ${nameOf(npcKey)}.` };
  });
}

/** Letters you're carrying today, by recipient (for the NPC menu's "Deliver" button). */
export async function lettersFor(characterId: number): Promise<string[]> {
  const rows = await db.select({ meta: inventory.meta }).from(inventory).where(and(eq(inventory.characterId, characterId), eq(inventory.itemKey, "letter")));
  return rows.map((r) => String((r.meta as { to?: unknown }).to ?? "")).filter(Boolean);
}

/** A beast fell to this player at (x, y): count it for their guard jobs there. Returns notices. */
export async function progressGuard(characterId: number, x: number, y: number, now = Date.now()): Promise<string[]> {
  const guards = JOB_DEFS.filter((d) => d.shift.kind === "guard" && inGuardArea(d.shift, x, y));
  if (!guards.length) return [];
  const notices: string[] = [];
  for (const d of guards) {
    await db.transaction(async (tx) => {
      const j = await locked(tx, characterId, d.key, now);
      const p = j?.row.progress;
      if (!j || !p || p.done) return;
      const rank = rankFor(j.row.shiftsDone);
      await addCoins(characterId, Math.round(GUARD_PER_BEAST * (1 + rank * 0.25)));
      const progress = { ...p, count: p.count + 1 };
      if (progress.count >= shiftNeed(d.shift, rank)) notices.push(...(await finishShift(tx, j.row, d, progress, now)).notices);
      else await tx.update(jobs).set({ progress }).where(eq(jobs.id, j.row.id));
    });
  }
  return notices;
}

// ── Caravan escorts (called from tickd's mind loop, src/lib/mind/mindServer.ts) ──
const ESCORT = JOB_DEFS.find((d) => d.kind === "escort")!;

/** Escorts with a shift to do today, online, within ESCORT_PX of the wagon. */
async function escortsNear(pos: { x: number; y: number }, now: number): Promise<number[]> {
  const rows = await db.select({ id: characters.id }).from(characters)
    .innerJoin(jobs, and(eq(jobs.characterId, characters.id), eq(jobs.jobKey, ESCORT.key), eq(jobs.status, "active")))
    .where(and(gte(characters.lastSeenAt, new Date(now - 60_000)),
      sql`${characters.x} between ${pos.x - ESCORT_PX} and ${pos.x + ESCORT_PX}`, sql`${characters.y} between ${pos.y - ESCORT_PX} and ${pos.y + ESCORT_PX}`));
  return rows.map((r) => r.id);
}

/** The wagon sets off on leg `leg`: escorts beside it now ride along. Returns how many. */
export async function escortDepart(pos: { x: number; y: number }, leg: number, now = Date.now()): Promise<number> {
  let n = 0;
  for (const id of await escortsNear(pos, now)) {
    await db.transaction(async (tx) => {
      const j = await locked(tx, id, ESCORT.key, now);
      if (!j || j.row.progress?.done) return;
      await tx.update(jobs).set({ progress: { ...(j.row.progress ?? fresh(dayKey(now))), leg, near: 1, total: 1 } }).where(eq(jobs.id, j.row.id));
      n++;
    });
  }
  return n;
}

/** While the wagon travels: who's riding along on this leg, and who's beside it now. */
export async function escortTick(pos: { x: number; y: number }, leg: number, now = Date.now()): Promise<number> {
  const beside = new Set(await escortsNear(pos, now));
  const riders = await db.select().from(jobs).where(and(eq(jobs.jobKey, ESCORT.key), eq(jobs.status, "active"), sql`(${jobs.progress}->>'leg')::int = ${leg}`, sql`coalesce((${jobs.progress}->>'done')::boolean, false) = false`));
  for (const r of riders) {
    const p = r.progress!;
    await db.update(jobs).set({ progress: { ...p, total: (p.total ?? 0) + 1, near: (p.near ?? 0) + (beside.has(r.characterId) ? 1 : 0) } }).where(eq(jobs.id, r.id));
  }
  return riders.length;
}

/** The wagon arrived: escorts who rode along for most of the way, and are here, are paid. Returns notices per player. */
export async function escortArrive(pos: { x: number; y: number }, leg: number, now = Date.now()): Promise<Map<number, string[]>> {
  const here = new Set(await escortsNear(pos, now));
  const riders = await db.select().from(jobs).where(and(eq(jobs.jobKey, ESCORT.key), eq(jobs.status, "active"), sql`(${jobs.progress}->>'leg')::int = ${leg}`));
  const out = new Map<number, string[]>();
  for (const r of riders) {
    await db.transaction(async (tx) => {
      const j = await locked(tx, r.characterId, ESCORT.key, now);
      const p = j?.row.progress;
      if (!j || !p || p.done || p.leg !== leg) return;
      if (escortEarned(p.near ?? 0, p.total ?? 0, here.has(r.characterId))) out.set(r.characterId, (await finishShift(tx, j.row, ESCORT, { ...p, count: 1 }, now)).notices);
      else await tx.update(jobs).set({ progress: { ...p, leg: undefined, near: 0, total: 0 } }).where(eq(jobs.id, j.row.id));
    });
  }
  return out;
}

/** For the talk prompt: how this player works for this NPC, if they do. */
export async function jobNoteFor(npcKey: string, characterId: number, playerName: string): Promise<string | null> {
  const defs = jobsOfEmployer(npcKey);
  if (!defs.length) return null;
  const mine = (await jobsFor(characterId)).filter((j) => j.employerKey === npcKey);
  if (!mine.length) return null;
  return mine.map((j) => `${playerName} works for you as ${j.title} (${j.shiftsDone} shifts done). Today's shift: ${j.done ? "done, well done" : `${j.count}/${j.need}, not finished yet`}.`).join(" ");
}
