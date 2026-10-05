// Ranch growth, the server part (rules: src/lib/ranchUpgrades.ts): the
// ranch_state row, building, the silo, workshop jobs and honey, farm XP,
// and tickd's feeder pass. Safe for tickd: imports no seed code.

import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { animals, characters, inventory, lots, ranchState } from "@/db/schema";
import { addItem, removeItem } from "@/lib/game";
import { FED_BELOW, FEED_ITEMS, HUNGRY_AT, afterFeed } from "@/lib/ranch";
import {
  BUILD_STEPS, EMPTY_GROWTH, FED_AFFECTION, MACHINE_RECIPES, SILO_CAP, STARVING_PENALTY, XP_PER_PROCESSED,
  afterHoney, applyBuild, canBuild, clampAffection, farmLevel, honeyReady, isNextStep, machineFree, newJob, nextLevelAt, recipeById, siloStored, takeFeed,
} from "@/lib/ranchUpgrades";
import type { RanchBuildKey, RanchGrowth, RanchGrowthView } from "@/types/ranchGrowth";

type Result = { ok: true; message: string; gained?: { itemKey: string; qty: number }[] } | { ok: false; error: string };

// ── The row ──────────────────────────────────────────────────────────────
export async function loadGrowth(lotKey: string): Promise<RanchGrowth> {
  await db.insert(ranchState).values({ lotKey }).onConflictDoNothing();
  const [r] = await db.select().from(ranchState).where(eq(ranchState.lotKey, lotKey));
  if (!r) return { ...EMPTY_GROWTH };
  return { farmXp: r.farmXp, coopLevel: r.coopLevel, barnLevel: r.barnLevel, silo: r.silo, machines: r.machines, jobs: r.jobs, hivesAt: r.hivesAt?.getTime() ?? null };
}

async function saveGrowth(lotKey: string, g: Partial<RanchGrowth>): Promise<void> {
  const { hivesAt, ...rest } = g;
  await db.update(ranchState).set({ ...rest, ...(hivesAt !== undefined ? { hivesAt: hivesAt == null ? null : new Date(hivesAt) } : {}) }).where(eq(ranchState.lotKey, lotKey));
}

export async function addFarmXp(lotKey: string, n: number): Promise<void> {
  if (n <= 0) return;
  await db.insert(ranchState).values({ lotKey, farmXp: n }).onConflictDoUpdate({ target: ranchState.lotKey, set: { farmXp: sql`${ranchState.farmXp} + ${n}` } });
}

/** The ranch lot a character owns, if any (for XP earned elsewhere). */
export async function ranchOfOwner(characterId: number): Promise<string | null> {
  const [l] = await db.select({ key: lots.key }).from(lots).where(and(eq(lots.ownerId, characterId), eq(lots.kind, "ranch")));
  return l?.key ?? null;
}

export async function clearRanch(lotKey: string): Promise<void> {
  await db.delete(ranchState).where(eq(ranchState.lotKey, lotKey));
}

async function bagOf(characterId: number, keys: readonly string[]): Promise<Record<string, number>> {
  if (!keys.length) return {};
  const rows = await db.select({ itemKey: inventory.itemKey, n: sql<number>`coalesce(sum(${inventory.qty}), 0)::int` }).from(inventory)
    .where(and(eq(inventory.characterId, characterId), inArray(inventory.itemKey, [...keys]))).groupBy(inventory.itemKey);
  return Object.fromEntries(rows.map((r) => [r.itemKey, r.n]));
}

// ── The panel ────────────────────────────────────────────────────────────
export async function growthView(lotKey: string, characterId: number, coins: number, now = Date.now()): Promise<RanchGrowthView> {
  const g = await loadGrowth(lotKey);
  const keys = [...new Set([...BUILD_STEPS.flatMap((s) => Object.keys(s.items)), ...MACHINE_RECIPES.flatMap((r) => Object.keys(r.inputs))])];
  const bag = await bagOf(characterId, keys);
  return {
    farmLevel: farmLevel(g.farmXp), farmXp: g.farmXp, nextAt: nextLevelAt(g.farmXp),
    coopLevel: g.coopLevel, barnLevel: g.barnLevel,
    silo: g.machines.includes("silo") ? { stored: siloStored(g.silo), cap: SILO_CAP } : null,
    built: g.machines,
    builds: BUILD_STEPS.filter((s) => isNextStep(g, s)).map((s) => { const c = canBuild(g, s, bag, coins); return { ...s, can: c.ok, why: c.why }; }),
    recipes: MACHINE_RECIPES.filter((r) => g.machines.includes(r.machine)).map((r) => ({ ...r, can: machineFree(g, r.machine) && Object.entries(r.inputs).every(([k, n]) => (bag[k] ?? 0) >= n) })),
    jobs: g.jobs.map((j) => ({ ...j, ready: j.readyAt <= now, inMs: Math.max(0, j.readyAt - now) })),
    honey: g.machines.includes("hives") ? honeyReady(g, now) : null,
  };
}

// ── Actions (the owner, at the ranch; checked by the route) ──────────────
export async function build(lotKey: string, characterId: number, stepId: string, now = Date.now()): Promise<Result> {
  const step = BUILD_STEPS.find((s) => s.id === stepId);
  if (!step) return { ok: false, error: "You can't build that." };
  const g = await loadGrowth(lotKey);
  const [me] = await db.select({ coins: characters.coins }).from(characters).where(eq(characters.id, characterId));
  const bag = await bagOf(characterId, Object.keys(step.items));
  const c = canBuild(g, step, bag, me?.coins ?? 0);
  if (!c.ok) return { ok: false, error: c.why ?? "You can't build that yet." };
  const [paid] = await db.update(characters).set({ coins: sql`${characters.coins} - ${step.coins}` })
    .where(and(eq(characters.id, characterId), gte(characters.coins, step.coins))).returning({ id: characters.id });
  if (!paid) return { ok: false, error: `Needs ${step.coins} coins.` };
  const taken: [string, number][] = [];
  for (const [k, n] of Object.entries(step.items)) {
    if (!(await removeItem(characterId, k, n))) {
      for (const [tk, tn] of taken) await addItem(characterId, tk, tn); // put back what was taken
      await db.update(characters).set({ coins: sql`${characters.coins} + ${step.coins}` }).where(eq(characters.id, characterId));
      return { ok: false, error: `Needs ${n} ${k}.` };
    }
    taken.push([k, n]);
  }
  const next = applyBuild(g, step, now);
  await saveGrowth(lotKey, { coopLevel: next.coopLevel, barnLevel: next.barnLevel, machines: next.machines, hivesAt: next.hivesAt });
  return { ok: true, message: `🔨 Built: ${step.name}! ${step.description}` };
}

/** Pour feed from your bag into the silo, up to its size. */
export async function deposit(lotKey: string, characterId: number): Promise<Result> {
  const g = await loadGrowth(lotKey);
  if (!g.machines.includes("silo")) return { ok: false, error: "Build a silo first." };
  let room = SILO_CAP - siloStored(g.silo);
  if (room <= 0) return { ok: false, error: "The silo is full." };
  const bag = await bagOf(characterId, FEED_ITEMS);
  const silo = { ...g.silo };
  let moved = 0;
  for (const [k, n] of Object.entries(bag)) {
    const take = Math.min(n, room);
    if (take <= 0 || !(await removeItem(characterId, k, take))) continue;
    silo[k] = (silo[k] ?? 0) + take;
    room -= take;
    moved += take;
  }
  if (!moved) return { ok: false, error: "You've no feed. Bring wheat or crops from your field." };
  await saveGrowth(lotKey, { silo });
  return { ok: true, message: `🌾 Poured ${moved} feed into the silo (${siloStored(silo)}/${SILO_CAP}).` };
}

/** Start a workshop job (one per machine at a time). */
export async function startJob(lotKey: string, characterId: number, recipeId: string, now = Date.now()): Promise<Result> {
  const r = recipeById(recipeId);
  if (!r) return { ok: false, error: "No such work." };
  const g = await loadGrowth(lotKey);
  if (!g.machines.includes(r.machine)) return { ok: false, error: "Build it first." };
  if (!machineFree(g, r.machine)) return { ok: false, error: "That's already working. Collect it first." };
  const taken: [string, number][] = [];
  for (const [k, n] of Object.entries(r.inputs)) {
    if (!(await removeItem(characterId, k, n))) {
      for (const [tk, tn] of taken) await addItem(characterId, tk, tn);
      return { ok: false, error: `You need ${n} ${k.replace(/_/g, " ")}.` };
    }
    taken.push([k, n]);
  }
  await saveGrowth(lotKey, { jobs: [...g.jobs, newJob(r, now)] });
  return { ok: true, message: `⚙️ ${r.name}: ready in ${Math.round(r.ms / 60_000)} minutes.` };
}

/** Collect finished jobs and honey. */
export async function collectWorkshop(lotKey: string, characterId: number, now = Date.now()): Promise<Result> {
  const g = await loadGrowth(lotKey);
  const done = g.jobs.filter((j) => j.readyAt <= now);
  const honey = honeyReady(g, now);
  if (!done.length && !honey) return { ok: false, error: "Nothing's ready yet." };
  const gained = new Map<string, number>();
  for (const j of done) gained.set(j.output, (gained.get(j.output) ?? 0) + j.qty);
  if (honey) gained.set("honey", (gained.get("honey") ?? 0) + honey);
  for (const [k, n] of gained) await addItem(characterId, k, n);
  await saveGrowth(lotKey, { jobs: g.jobs.filter((j) => j.readyAt > now), ...(honey && g.hivesAt != null ? { hivesAt: afterHoney(g.hivesAt, honey, now) } : {}) });
  await addFarmXp(lotKey, done.reduce((s, j) => s + j.qty, 0) * XP_PER_PROCESSED + honey);
  const list = [...gained].map(([itemKey, qty]) => ({ itemKey, qty }));
  return { ok: true, message: `🧺 Collected ${list.map((x) => `${x.qty} ${x.itemKey.replace(/_/g, " ")}`).join(", ")}.`, gained: list };
}

// ── tickd ────────────────────────────────────────────────────────────────
const FEEDER_EVERY_MS = 5 * 60_000;
let lastFeederRun = 0;

/**
 * Every 5 minutes: ranches with a feeder feed their hungry animals from the
 * silo (as if fed by hand), and starving animals lose a little affection.
 */
export async function tickRanches(now = Date.now()): Promise<number> {
  if (now - lastFeederRun < FEEDER_EVERY_MS) return 0;
  lastFeederRun = now;
  const herd = await db.select().from(animals).where(isNotNull(animals.ranchKey));
  if (!herd.length) return 0;
  const withFeeder = await db.select().from(ranchState).where(sql`${ranchState.machines} @> '["feeder"]'::jsonb`);
  const silos = new Map(withFeeder.map((r) => [r.lotKey, { ...r.silo }]));
  const changed = new Set<string>();
  let fed = 0;
  for (const a of herd.sort((x, y) => y.hunger - x.hunger)) {
    const silo = a.ranchKey ? silos.get(a.ranchKey) : undefined;
    if (silo && a.hunger >= FED_BELOW) {
      const t = takeFeed(silo);
      if (t) {
        silos.set(a.ranchKey!, t.silo);
        changed.add(a.ranchKey!);
        const last = (a.lastProducedAt ?? a.lastFedAt).getTime();
        await db.update(animals).set({
          hunger: 0, lastFedAt: new Date(now), lastProducedAt: new Date(afterFeed(last, a.hunger, now)), mood: "content",
          affection: clampAffection(a.affection + (a.hunger < HUNGRY_AT ? FED_AFFECTION : 0)),
        }).where(eq(animals.id, a.id));
        fed++;
        continue;
      }
    }
    if (a.hunger >= HUNGRY_AT && a.affection > 0) await db.update(animals).set({ affection: clampAffection(a.affection - STARVING_PENALTY) }).where(eq(animals.id, a.id));
  }
  for (const lotKey of changed) await saveGrowth(lotKey, { silo: silos.get(lotKey)! });
  return fed;
}

/** What the scene draws on each ranch lot: its buildings. */
export async function ranchLooks(lotKeys: readonly string[]): Promise<Map<string, RanchBuildKey[]>> {
  if (!lotKeys.length) return new Map();
  const rows = await db.select({ lotKey: ranchState.lotKey, machines: ranchState.machines }).from(ranchState).where(inArray(ranchState.lotKey, [...lotKeys]));
  return new Map(rows.map((r) => [r.lotKey, r.machines]));
}
