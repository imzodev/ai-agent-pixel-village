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
  afterHoney, applyBuild, canBuild, clampAffection, farmLevel, hasBuilt, honeyReady, isNextStep, machineFree, newJob, nextLevelAt, recipeById, siloStored, takeFeed,
} from "@/lib/ranchUpgrades";
import { FURNITURE_ITEMS } from "@/lib/furniture";
import { lotLock, withLock } from "@/lib/locks";
import { SHOWROOM_SIZE } from "@/game/workshopProps";
import type { GrowthLot, RanchBuildKey, RanchGrowth, RanchGrowthView } from "@/types/ranchGrowth";

type Result = { ok: true; message: string; gained?: { itemKey: string; qty: number }[] } | { ok: false; error: string };

// ── The row ──────────────────────────────────────────────────────────────
export async function loadGrowth(lotKey: string): Promise<RanchGrowth> {
  await db.insert(ranchState).values({ lotKey }).onConflictDoNothing();
  const [r] = await db.select().from(ranchState).where(eq(ranchState.lotKey, lotKey));
  if (!r) return { ...EMPTY_GROWTH };
  return { farmXp: r.farmXp, coopLevel: r.coopLevel, barnLevel: r.barnLevel, silo: r.silo, machines: r.machines, jobs: r.jobs, hivesAt: r.hivesAt?.getTime() ?? null, display: r.display };
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

/** Give the furniture on a workshop's porch back to its owner. */
export async function returnShowroom(lotKey: string, characterId: number): Promise<void> {
  const [r] = await db.select({ display: ranchState.display }).from(ranchState).where(eq(ranchState.lotKey, lotKey));
  for (const item of r?.display ?? []) await addItem(characterId, item, 1);
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
export async function growthView(lotKey: string, lot: GrowthLot, characterId: number, coins: number, now = Date.now()): Promise<RanchGrowthView> {
  const g = await loadGrowth(lotKey);
  const steps = BUILD_STEPS.filter((s) => s.lot === lot), recipes = MACHINE_RECIPES.filter((r) => r.lot === lot);
  const keys = [...new Set([...steps.flatMap((s) => Object.keys(s.items)), ...recipes.flatMap((r) => Object.keys(r.inputs))])];
  const bag = await bagOf(characterId, keys);
  return {
    farmLevel: farmLevel(g.farmXp), farmXp: g.farmXp, nextAt: nextLevelAt(g.farmXp),
    coopLevel: g.coopLevel, barnLevel: g.barnLevel,
    silo: g.machines.includes("silo") ? { stored: siloStored(g.silo), cap: SILO_CAP } : null,
    built: g.machines,
    builds: steps.filter((s) => isNextStep(g, s)).map((s) => { const c = canBuild(g, s, bag, coins); return { ...s, can: c.ok, why: c.why }; }),
    recipes: recipes.filter((r) => hasBuilt(g, r.machine)).map((r) => ({ ...r, can: machineFree(g, r.machine) && Object.entries(r.inputs).every(([k, n]) => (bag[k] ?? 0) >= n) })),
    jobs: g.jobs.map((j) => ({ ...j, ready: j.readyAt <= now, inMs: Math.max(0, j.readyAt - now) })),
    honey: g.machines.includes("hives") ? honeyReady(g, now) : null,
    display: lot === "workshop" ? g.display : null,
    displayable: lot === "workshop" ? Object.entries(await bagOf(characterId, FURNITURE_ITEMS)).filter(([, n]) => n > 0).map(([itemKey, qty]) => ({ itemKey, qty })) : [],
  };
}

// ── Actions (the owner, at the ranch; checked by the route) ──────────────
export async function build(lotKey: string, lot: GrowthLot, characterId: number, stepId: string, now = Date.now()): Promise<Result> {
  // One action at a time per lot: a double click must not pay or start twice.
  return withLock(lotLock(lotKey), async () => {
    const step = BUILD_STEPS.find((s) => s.id === stepId && s.lot === lot);
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
  });
}

/** Pour feed from your bag into the silo, up to its size. */
export async function deposit(lotKey: string, characterId: number): Promise<Result> {
  // One action at a time per lot: a double click must not pay or start twice.
  return withLock(lotLock(lotKey), async () => {
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
  });
}

/** Start a workshop job (one per machine at a time). */
export async function startJob(lotKey: string, lot: GrowthLot, characterId: number, recipeId: string, now = Date.now()): Promise<Result> {
  // One action at a time per lot: a double click must not pay or start twice.
  return withLock(lotLock(lotKey), async () => {
    const r = recipeById(recipeId);
    if (!r || r.lot !== lot) return { ok: false, error: "No such work." };
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
  });
}

/** Collect finished jobs and honey. */
export async function collectWorkshop(lotKey: string, characterId: number, now = Date.now()): Promise<Result> {
  // One action at a time per lot: a double click must not pay or start twice.
  return withLock(lotLock(lotKey), async () => {
    const g = await loadGrowth(lotKey);
    const done = g.jobs.filter((j) => j.readyAt <= now);
    const honey = honeyReady(g, now);
    if (!done.length && !honey) return { ok: false, error: "Nothing's ready yet." };
    const gained = new Map<string, number>();
    for (const j of done) gained.set(j.output, (gained.get(j.output) ?? 0) + j.qty);
    if (honey) gained.set("honey", (gained.get("honey") ?? 0) + honey);
    for (const [k, n] of gained) await addItem(characterId, k, n);
    await saveGrowth(lotKey, { jobs: g.jobs.filter((j) => j.readyAt > now), ...(honey && g.hivesAt != null ? { hivesAt: afterHoney(g.hivesAt, honey, now) } : {}) });
    await addFarmXp(lotKey, done.reduce((s, j) => s + (recipeById(j.recipe)?.xp ?? j.qty * XP_PER_PROCESSED), 0) + honey);
    const list = [...gained].map(([itemKey, qty]) => ({ itemKey, qty }));
    return { ok: true, message: `🧺 Collected ${list.map((x) => `${x.qty} ${x.itemKey.replace(/_/g, " ")}`).join(", ")}.`, gained: list };
  });
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
  const withFeeder = new Set((await db.select({ lotKey: ranchState.lotKey }).from(ranchState).where(sql`${ranchState.machines} @> '["feeder"]'::jsonb`)).map((r) => r.lotKey));
  let fed = 0;
  // Each feeder lot under its lock, with its silo read fresh: a player pouring
  // feed in at the same moment is never overwritten.
  for (const lotKey of withFeeder) {
    const hungry = herd.filter((a) => a.ranchKey === lotKey && a.hunger >= FED_BELOW).sort((x, y) => y.hunger - x.hunger);
    if (!hungry.length) continue;
    fed += await withLock(lotLock(lotKey), async () => {
      let silo = (await loadGrowth(lotKey)).silo;
      let n = 0;
      for (const a of hungry) {
        const t = takeFeed(silo);
        if (!t) break;
        silo = t.silo;
        const last = (a.lastProducedAt ?? a.lastFedAt).getTime();
        await db.update(animals).set({
          hunger: 0, lastFedAt: new Date(now), lastProducedAt: new Date(afterFeed(last, a.hunger, now)), mood: "content",
          affection: clampAffection(a.affection + (a.hunger < HUNGRY_AT ? FED_AFFECTION : 0)),
        }).where(eq(animals.id, a.id));
        a.hunger = 0;
        n++;
      }
      if (n) await saveGrowth(lotKey, { silo });
      return n;
    });
  }
  // Animals left starving lose a little love.
  for (const a of herd) if (a.hunger >= HUNGRY_AT && a.affection > 0) await db.update(animals).set({ affection: clampAffection(a.affection - STARVING_PENALTY) }).where(eq(animals.id, a.id));
  return fed;
}

/** What the scene draws on each lot: its buildings, and a workshop's showroom. */
export async function ranchLooks(lotKeys: readonly string[]): Promise<Map<string, { props: RanchBuildKey[]; display: string[] }>> {
  if (!lotKeys.length) return new Map();
  const rows = await db.select({ lotKey: ranchState.lotKey, machines: ranchState.machines, display: ranchState.display }).from(ranchState).where(inArray(ranchState.lotKey, [...lotKeys]));
  return new Map(rows.map((r) => [r.lotKey, { props: r.machines, display: r.display }]));
}

/** Workshops: put a piece of furniture from your bag on show, or take one back. */
export async function showroom(lotKey: string, characterId: number, action: "display" | "undisplay", arg: string | number): Promise<Result> {
  // One action at a time per lot: a double click must not pay or start twice.
  return withLock(lotLock(lotKey), async () => {
    const g = await loadGrowth(lotKey);
    if (action === "display") {
      const item = String(arg);
      if (!FURNITURE_ITEMS.includes(item)) return { ok: false, error: "Only furniture goes in the showroom." };
      if (g.display.length >= SHOWROOM_SIZE) return { ok: false, error: `The porch holds ${SHOWROOM_SIZE} pieces. Take one down first.` };
      if (!(await removeItem(characterId, item, 1))) return { ok: false, error: "You don't have that." };
      await saveGrowth(lotKey, { display: [...g.display, item] });
      return { ok: true, message: `🪑 Put a ${item.replace(/_/g, " ")} on show.` };
    }
    const i = Number(arg);
    const item = g.display[i];
    if (item == null) return { ok: false, error: "Nothing there." };
    await saveGrowth(lotKey, { display: g.display.filter((_, k) => k !== i) });
    await addItem(characterId, item, 1);
    return { ok: true, message: `Took the ${item.replace(/_/g, " ")} back.` };
  });
}
