import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { animals, enemies, npcs, resourceNodes, worldState, worldEvents } from "@/db/schema";
import { WILD_ZONES, gameHour, type Rect } from "./worldmap";
import { isWalkableServer } from "./chunkCollisionServer";
import { logEvent } from "./game";

const ANIMAL_SPEED = 28; // px/s
const NPC_SPEED = 38;
const ENEMY_SPEED = 22;
const TARGET_ENEMIES = 7;

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

async function randomPointIn(zone: Rect, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const x = zone.x + Math.random() * zone.w;
    const y = zone.y + Math.random() * zone.h;
    if (await isWalkableServer(x, y)) return { x, y };
  }
  return null;
}

function stepToward(x: number, y: number, tx: number, ty: number, dist: number) {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  if (d <= dist || d === 0) return { x: tx, y: ty, arrived: true, facing: facingOf(dx, dy) };
  return { x: x + (dx / d) * dist, y: y + (dy / d) * dist, arrived: false, facing: facingOf(dx, dy) };
}

function facingOf(dx: number, dy: number) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/**
 * Advance the world. Called opportunistically by API requests; the first
 * caller after >= 1s of quiet wins the tick (atomic update), so many clients
 * polling never double-simulate.
 */
export async function tickWorld() {
  const now = new Date();
  const [before] = await db.select().from(worldState).where(eq(worldState.id, 1));
  if (!before) return;
  const claimed = await db
    .update(worldState)
    .set({ lastTickAt: now })
    .where(and(eq(worldState.id, 1), lt(worldState.lastTickAt, new Date(now.getTime() - 1000))))
    .returning();
  if (claimed.length === 0) return;
  const ws = claimed[0];
  const elapsedSec = Math.min(3600, Math.max(1, (now.getTime() - before.lastTickAt.getTime()) / 1000));
  const moveDt = Math.min(elapsedSec, 4); // movement is smoothed; long gaps teleport to target
  const hour = gameHour(ws.epochStart.getTime(), ws.dayLengthMinutes, now.getTime());
  const night = hour < 6 || hour >= 21;

  await Promise.all([
    tickAnimals(moveDt, elapsedSec, night, now),
    tickNpcs(moveDt, night),
    tickWeather(ws, now),
    tickResources(now),
    tickEnemies(moveDt, now),
  ]);
  if (elapsedSec > 90) await unattendedEvents(elapsedSec);
}

async function tickAnimals(dt: number, elapsedSec: number, night: boolean, now: Date) {
  const rows = await db.select().from(animals);
  for (const a of rows) {
    let { x, y, targetX, targetY, facing, state } = a;
    let hunger = a.hunger;
    // hunger rises ~1 point / 2 minutes
    if (Math.random() < elapsedSec / 120) hunger = Math.min(100, hunger + Math.ceil(elapsedSec / 120));
    const stateExpired = !a.stateUntil || a.stateUntil < now;
    if (night && a.species !== "fox" && a.species !== "cat" && state !== "sleep" && Math.random() < 0.3) {
      state = "sleep";
      targetX = null; targetY = null;
    } else if (state === "sleep" && (!night || Math.random() < 0.05)) {
      state = "idle";
    }
    if (state !== "sleep") {
      if (targetX != null && targetY != null) {
        const s = stepToward(x, y, targetX, targetY, ANIMAL_SPEED * dt);
        x = s.x; y = s.y; facing = s.facing;
        if (s.arrived) { targetX = null; targetY = null; state = Math.random() < 0.5 ? "graze" : "idle"; }
        else state = "walk";
      } else if (stateExpired && Math.random() < 0.35) {
        const p = await randomPointIn(a.zone);
        if (p) { targetX = p.x; targetY = p.y; state = "walk"; }
      }
    }
    const petFresh = a.lastPettedAt && now.getTime() - a.lastPettedAt.getTime() < 10 * 60_000;
    const mood = hunger > 70 ? "hungry" : state === "sleep" ? "sleepy" : petFresh ? "delighted" : hunger < 30 ? "content" : "peckish";
    await db
      .update(animals)
      .set({ x, y, targetX, targetY, facing, state, hunger, mood, stateUntil: new Date(now.getTime() + 2000 + Math.random() * 6000) })
      .where(eq(animals.id, a.id));
  }
}

async function tickNpcs(dt: number, night: boolean) {
  const rows = await db.select().from(npcs).where(eq(npcs.active, true));
  for (const n of rows) {
    if (n.kind === "remote") continue; // remote agents drive themselves over HTTP
    let { x, y, targetX, targetY, facing } = n;
    if (targetX != null && targetY != null) {
      const s = stepToward(x, y, targetX, targetY, NPC_SPEED * dt);
      x = s.x; y = s.y; facing = s.facing;
      if (s.arrived) { targetX = null; targetY = null; }
    } else if (Math.random() < (night ? 0.05 : 0.18)) {
      const r = night ? 30 : n.wanderRadius;
      const p = await randomPointIn({ x: n.homeX - r, y: n.homeY - r, w: r * 2, h: r * 2 });
      if (p) { targetX = p.x; targetY = p.y; }
    }
    await db.update(npcs).set({ x, y, targetX, targetY, facing }).where(eq(npcs.id, n.id));
  }
}

async function tickWeather(ws: typeof worldState.$inferSelect, now: Date) {
  if (ws.weatherUntil > now) return;
  const roll = Math.random();
  const weather = roll < 0.58 ? "clear" : roll < 0.8 ? "rain" : roll < 0.92 ? "fog" : "snow";
  const minutes = 4 + Math.random() * 10;
  await db
    .update(worldState)
    .set({ weather, weatherUntil: new Date(now.getTime() + minutes * 60_000) })
    .where(eq(worldState.id, 1));
  if (weather !== ws.weather) {
    const text = { clear: "The clouds part and sun spills over the plaza.", rain: "A soft rain begins to fall over the grove.", fog: "Fog rolls in from the pond.", snow: "Snow! Fat, lazy flakes drift down on the rooftops." }[weather];
    await logEvent("weather", text ?? "The weather shifts.");
  }
}

async function tickResources(now: Date) {
  await db
    .update(resourceNodes)
    .set({ qty: 3, respawnAt: null })
    .where(and(isNotNull(resourceNodes.respawnAt), lt(resourceNodes.respawnAt, now)));
}

async function tickEnemies(dt: number, now: Date) {
  const rows = await db.select().from(enemies);
  for (const e of rows) {
    let { x, y, targetX, targetY } = e;
    if (targetX != null && targetY != null) {
      const s = stepToward(x, y, targetX, targetY, ENEMY_SPEED * dt);
      x = s.x; y = s.y;
      if (s.arrived) { targetX = null; targetY = null; }
    } else if (Math.random() < 0.25) {
      const zone = WILD_ZONES.find((z) => x >= z.x - 40 && x <= z.x + z.w + 40 && y >= z.y - 40 && y <= z.y + z.h + 40) ?? pick(WILD_ZONES);
      const p = await randomPointIn(zone);
      if (p) { targetX = p.x; targetY = p.y; }
    }
    await db.update(enemies).set({ x, y, targetX, targetY }).where(eq(enemies.id, e.id));
  }
  if (rows.length < TARGET_ENEMIES && Math.random() < 0.4) {
    const zone = pick(WILD_ZONES);
    const p = await randomPointIn(zone);
    if (p) {
      const kind = Math.random() < 0.7 ? "slime" : Math.random() < 0.5 ? "bat" : "thornling";
      const hp = kind === "slime" ? 6 : kind === "bat" ? 5 : 9;
      await db.insert(enemies).values({ kind, x: p.x, y: p.y, hp, maxHp: hp, spawnedAt: now });
    }
  }
}

/** Things happened while nobody was watching. Write a few plausible entries. */
async function unattendedEvents(elapsedSec: number) {
  const n = Math.min(6, Math.max(1, Math.floor(elapsedSec / 240)));
  const beasts = await db.select().from(animals);
  const folks = await db.select().from(npcs).where(eq(npcs.active, true));
  const templates = [
    () => { const a = pick(beasts); return [a, `${a.name} the ${a.species} wandered off and came back muddy.`] as const; },
    () => { const a = pick(beasts); return [a, `${a.name} found a sunny patch and refused to move for an hour.`] as const; },
    () => { const a = beasts.find((b) => b.species === "fox") ?? pick(beasts); return [a, `${a.name} was spotted eyeing the chicken yard. The chickens were unimpressed.`] as const; },
    () => { const a = beasts.find((b) => b.species === "cat") ?? pick(beasts); return [a, `${a.name} napped on the bakery windowsill again.`] as const; },
    () => { const p = pick(folks); return [null, `${p.name} swept the step outside and hummed something old.`] as const; },
    () => { const p = pick(folks); return [null, `${p.name} was overheard arguing with a duck. The duck won.`] as const; },
  ];
  for (let i = 0; i < n; i++) {
    const [subject, text] = pick(templates)();
    await db.insert(worldEvents).values({
      kind: "ambient",
      text,
      subjectType: subject ? "animal" : "npc",
      subjectId: subject?.id,
      x: subject?.x,
      y: subject?.y,
      createdAt: new Date(Date.now() - Math.random() * elapsedSec * 1000),
    });
  }
}
