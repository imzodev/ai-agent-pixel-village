// Bjorn's Forge's run: pick the fuel and tools, light the fire, then heat the
// billet in the coals, pull it onto the anvil and strike it on the beat while
// it's in the workable heat; knock the scale off as it comes loose. Struck too
// cold it cracks (start the piece again); struck white hot, or left in the fire
// too long, it burns out (that commission is lost, not the run). A minute from
// when the fire is lit. The browser plays it live and the server replays the
// stored inputs to score it, so whole numbers and a fixed order (a test checks).
// Pure. Numbers: rules.ts. Course: course.ts.

import * as rules from "./rules";
import { fireAt } from "./course";
import type { ForgeCommissionState, ForgeCourse, ForgeDetail, ForgeEventKind, ForgeInput, ForgeLoadout, ForgePieceKey, ForgePlace, ForgeState } from "@/types/forgeGame";
import type { ArcadeResult } from "@/types/arcade";

const {
  CHAIN_MAX, COLD_MAX, COMMISSION_BONUS, FORGE_FUELS, FORGE_HAMMERS, FORGE_PIECES, FORGE_TONGS, HEAT_MAX, HEAT_MIN, HOT_MIN, KNOCK_HEAT,
  KNOCK_POINTS, MAX_INPUTS, PERFECT_BONUS, PERFECT_POINTS, PERFECT_WINDOW, PREP_TICKS, QUENCH_DROP, RUN_TICKS, SCALE_EVERY, STRIKE_HEAT,
  STRIKE_POINTS, SWEET_MID, SWING_TICKS, TIME_BONUS_MAX,
} = rules;

const FUELS = Object.keys(FORGE_FUELS) as (keyof typeof FORGE_FUELS)[];
const HAMMERS = Object.keys(FORGE_HAMMERS) as (keyof typeof FORGE_HAMMERS)[];
const TONGS = Object.keys(FORGE_TONGS) as (keyof typeof FORGE_TONGS)[];

export const DEFAULT_LOADOUT: ForgeLoadout = { fuel: "coal", hammer: "stone", tongs: "short" };

/** A loadout the game knows (from the browser or a stored run). */
export const validLoadout = (l: unknown): l is ForgeLoadout => {
  const o = l as Record<string, unknown> | null;
  return !!o && FUELS.includes(o.fuel as never) && HAMMERS.includes(o.hammer as never) && TONGS.includes(o.tongs as never);
};

function workFor(course: ForgeCourse, index: number): ForgeCommissionState {
  return { piece: course.commissions[index].piece, quality: 0, strikes: 0 };
}

export function initForge(course: ForgeCourse): ForgeState {
  return {
    tick: 0,
    phase: "prep",
    startAt: PREP_TICKS,
    loadout: { ...DEFAULT_LOADOUT },
    heat: HEAT_MIN,
    place: "anvil",
    moving: 0,
    commission: 0,
    work: workFor(course, 0),
    outcomes: course.commissions.map(() => null),
    points: 0,
    perfectStrikes: 0,
    ruined: 0,
    completed: 0,
    chain: 0,
    bestChain: 0,
    lastBeat: -1,
    quenchesLeft: FORGE_TONGS[DEFAULT_LOADOUT.tongs].quenches,
    scale: false,
    log: [],
    done: false,
  };
}

/** A piece's sweet band: blows struck in it count in full. */
export const bandOf = (piece: ForgePieceKey): { low: number; high: number } => {
  const half = FORGE_PIECES[piece].band / 2;
  return { low: SWEET_MID - half, high: SWEET_MID + half };
};

export const heatBand = (heat: number): "cold" | "workable" | "hot" => (heat <= COLD_MAX ? "cold" : heat >= HOT_MIN ? "hot" : "workable");

/** Ticks since the last beat (the first beat falls as the fire is lit). */
export const swingPhase = (st: ForgeState): number => {
  const p = (st.tick - st.startAt) % SWING_TICKS;
  return p < 0 ? p + SWING_TICKS : p;
};
/** How far this tick is from the nearest beat (0 is on it). */
export const swingOffset = (st: ForgeState): number => {
  const p = swingPhase(st);
  return p <= SWING_TICKS / 2 ? p : SWING_TICKS - p;
};
/** The beat nearest this tick; one blow a beat. */
export const beatOf = (st: ForgeState): number => Math.floor((st.tick - st.startAt + SWING_TICKS / 2) / SWING_TICKS);

const working = (st: ForgeState) => !st.done && st.phase === "work";
/** The billet is lying on the anvil (not in the fire, not in the tongs). */
export const onAnvil = (st: ForgeState): boolean => st.place === "anvil" && st.moving === 0;

/** A blow is legal on the anvil, with no scale in the way, once a beat. */
export const canStrike = (st: ForgeState): boolean => working(st) && onAnvil(st) && !st.scale && beatOf(st) !== st.lastBeat;
export const canKnock = (st: ForgeState): boolean => working(st) && onAnvil(st) && st.scale;
export const canMove = (st: ForgeState, to: ForgePlace): boolean => working(st) && st.moving === 0 && st.place !== to;
export const canQuench = (st: ForgeState): boolean => working(st) && st.moving === 0 && st.quenchesLeft > 0;
export const canFinish = (st: ForgeState): boolean => working(st) && st.work.strikes > 0;

/** The fuel and tools, as chosen (lighting the fire sets them). */
export const setLoadout = (st: ForgeState, loadout: ForgeLoadout): void => {
  st.loadout = { fuel: loadout.fuel, hammer: loadout.hammer, tongs: loadout.tongs };
  st.quenchesLeft = FORGE_TONGS[loadout.tongs].quenches;
};

function log(st: ForgeState, k: ForgeEventKind, extra: { points?: number; dull?: boolean } = {}): void {
  st.log.push({ k, at: st.tick, commission: st.commission, ...extra });
}

/** A fresh cold billet on the anvil. */
function newBillet(st: ForgeState): void {
  st.heat = HEAT_MIN;
  st.place = "anvil";
  st.moving = 0;
  st.scale = false;
}

/** Start the next commission, or end the run. */
function advance(st: ForgeState, course: ForgeCourse): void {
  st.commission++;
  if (st.commission >= course.commissions.length) {
    st.done = true;
    st.phase = "done";
    return;
  }
  st.work = workFor(course, st.commission);
  newBillet(st);
}

/** A finished piece: its worth, the commission bonus and a tip for the time to spare. */
function finishCommission(st: ForgeState, course: ForgeCourse): void {
  const c = course.commissions[st.commission];
  const left = Math.max(0, st.startAt + RUN_TICKS - st.tick);
  const pts = c.points + COMMISSION_BONUS + Math.round((TIME_BONUS_MAX * left) / RUN_TICKS);
  st.points += pts;
  st.completed++;
  st.outcomes[st.commission] = "made";
  log(st, "completed", { points: pts });
  advance(st, course);
}

/** Burnt out: the commission is lost. */
function burn(st: ForgeState, course: ForgeCourse): void {
  st.ruined++;
  st.chain = 0;
  st.outcomes[st.commission] = "ruined";
  log(st, "burnt");
  advance(st, course);
}

function strike(st: ForgeState, course: ForgeCourse): void {
  if (st.heat <= COLD_MAX) {
    // Cold iron cracks: the work so far is lost and a new billet goes on the
    // anvil, but the commission isn't over.
    st.work.quality = 0;
    st.work.strikes = 0;
    st.chain = 0;
    st.ruined++;
    log(st, "cold_crack");
    newBillet(st);
    return;
  }
  if (st.heat >= HOT_MIN) { burn(st, course); return; }
  const hammer = FORGE_HAMMERS[st.loadout.hammer];
  const band = bandOf(st.work.piece);
  st.lastBeat = beatOf(st);
  const offset = swingOffset(st);
  // 2 perfect, 1 good, 0 a glance; out of the sweet band a blow counts a step less.
  let level = offset <= PERFECT_WINDOW ? 2 : offset <= hammer.window ? 1 : 0;
  const dull = st.heat < band.low || st.heat > band.high;
  if (dull && level > 0) level--;
  st.work.quality += level === 2 ? hammer.perfectGain : level === 1 ? hammer.gain : Math.max(1, Math.floor(hammer.gain / 2));
  st.work.strikes++;
  st.heat = Math.max(HEAT_MIN, st.heat - STRIKE_HEAT);
  if (level === 0) {
    st.chain = 0;
    log(st, "glance", { points: 0, dull });
  } else {
    st.chain++;
    if (st.chain > st.bestChain) st.bestChain = st.chain;
    const pts = (level === 2 ? PERFECT_POINTS : STRIKE_POINTS) + Math.min(st.chain - 1, CHAIN_MAX);
    st.points += pts;
    if (level === 2) st.perfectStrikes++;
    log(st, level === 2 ? "perfect" : "strike", { points: pts, dull });
  }
  // The commission is done when the piece has had enough blows AND enough good
  // work: glances alone take many more blows.
  const need = course.commissions[st.commission];
  if (st.work.strikes >= need.strikes && st.work.quality >= need.quality) finishCommission(st, course);
  else if (st.work.strikes % SCALE_EVERY === 0) st.scale = true;
}

/** One tick: this tick's inputs, then the fire or the air on the billet, then the clock. */
export function stepForge(st: ForgeState, course: ForgeCourse, inputs: readonly ForgeInput[]): void {
  if (st.done) return;

  for (const inp of inputs) {
    if (st.done) break;
    if (inp.k === "prep") {
      if (st.phase !== "prep" || !validLoadout(inp.loadout)) continue;
      setLoadout(st, inp.loadout);
      // The fire is lit: the minute starts on the next tick.
      st.startAt = st.tick + 1;
      continue;
    }
    if (st.phase !== "work") continue;
    if (inp.k === "move") {
      if (!canMove(st, inp.to)) continue;
      st.place = inp.to;
      st.moving = FORGE_TONGS[st.loadout.tongs].moveTicks;
    } else if (inp.k === "strike") {
      if (canStrike(st)) strike(st, course);
    } else if (inp.k === "knock") {
      if (!canKnock(st)) continue;
      st.scale = false;
      st.points += KNOCK_POINTS;
      st.heat = Math.max(HEAT_MIN, st.heat - KNOCK_HEAT);
      log(st, "knock", { points: KNOCK_POINTS });
    } else if (inp.k === "quench") {
      if (!canQuench(st)) continue;
      st.quenchesLeft--;
      st.heat = Math.max(HEAT_MIN, st.heat - QUENCH_DROP);
      st.scale = false;
      // Out of the barrel and back onto the anvil.
      if (st.place === "fire") { st.place = "anvil"; st.moving = FORGE_TONGS[st.loadout.tongs].moveTicks; }
      log(st, "quench");
    } else if (inp.k === "finish") {
      if (!canFinish(st)) continue;
      const need = course.commissions[st.commission];
      if (st.work.quality >= need.quality) { finishCommission(st, course); continue; }
      // Handing it over unfinished banks half its worth and moves on.
      const pts = Math.round(need.points / 2);
      st.points += pts;
      st.outcomes[st.commission] = "half";
      log(st, "finished", { points: pts });
      advance(st, course);
    }
  }

  if (st.phase === "work" && !st.done) {
    const piece = FORGE_PIECES[st.work.piece];
    if (st.moving > 0) {
      st.moving--;
      st.heat = Math.max(HEAT_MIN, st.heat - piece.coolRate);
    } else if (st.place === "fire") {
      // Fuel × the day's fire × how deep the tongs hold it, all in quarters.
      let rise = Math.floor((FORGE_FUELS[st.loadout.fuel].rate * fireAt(course, st) * FORGE_TONGS[st.loadout.tongs].reach) / 16);
      if (st.heat >= HOT_MIN) rise = Math.max(1, Math.floor(rise / 2));
      st.heat = Math.min(HEAT_MAX, st.heat + rise);
      if (st.heat >= HEAT_MAX) burn(st, course);
    } else {
      st.heat = Math.max(HEAT_MIN, st.heat - piece.coolRate);
    }
  }

  st.tick++;
  if (st.phase === "prep" && st.tick >= st.startAt) st.phase = "work";
  if (st.phase === "work" && st.tick >= st.startAt + RUN_TICKS) {
    st.done = true;
    st.phase = "done";
  }
}

/** The run's counts: how many commissions were made, how clean the work was. */
export const forgeDetail = (st: ForgeState, course: ForgeCourse): ForgeDetail => ({
  completed: st.completed,
  perfect: st.perfectStrikes,
  ruined: st.ruined,
  commissions: course.commissions.length,
  chain: st.bestChain,
});

/** The run's points; a quarter more if every commission was made and no billet lost. */
export function scoreForge(st: ForgeState, course: ForgeCourse): ArcadeResult {
  const perfect = st.done && st.completed === course.commissions.length && st.ruined === 0;
  return { score: st.points + (perfect ? Math.round(st.points * PERFECT_BONUS) : 0), ticks: st.tick, perfect, detail: { ...forgeDetail(st, course) } };
}

/** Inputs as the server accepts them: known kinds and tools, one prep before the fire, ticks in order, not too many. Null if not. */
export function cleanForgeInputs(raw: unknown): ForgeInput[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_INPUTS) return null;
  const out: ForgeInput[] = [];
  let last = -1, prepped = false;
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    const t = Number(o?.t);
    if (!Number.isInteger(t) || t < last || t < 0 || t >= PREP_TICKS + RUN_TICKS) return null;
    last = t;
    if (o.k === "prep") {
      if (prepped || t >= PREP_TICKS || !validLoadout(o.loadout)) return null;
      prepped = true;
      const l = o.loadout;
      out.push({ t, k: "prep", loadout: { fuel: l.fuel, hammer: l.hammer, tongs: l.tongs } });
    } else if (o.k === "move") {
      if (o.to !== "fire" && o.to !== "anvil") return null;
      out.push({ t, k: "move", to: o.to });
    } else if (o.k === "strike" || o.k === "knock" || o.k === "quench" || o.k === "finish") {
      out.push({ t, k: o.k });
    } else return null;
  }
  return out;
}

/** Play a whole run from its inputs (the server's check, and the replays). */
export function replayForge(course: ForgeCourse, inputs: readonly ForgeInput[]): { state: ForgeState; result: ArcadeResult } {
  const st = initForge(course);
  let k = 0;
  while (!st.done) {
    const now: ForgeInput[] = [];
    while (k < inputs.length && inputs[k].t < st.tick) k++;
    while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
    stepForge(st, course, now);
  }
  return { state: st, result: scoreForge(st, course) };
}

export function forgeHash(st: ForgeState): string {
  let h = 2166136261;
  const mix = (n: number) => { h = Math.imul(h ^ (n | 0), 16777619); };
  mix(st.tick); mix(st.startAt); mix(st.heat); mix(st.place === "fire" ? 1 : 0); mix(st.moving); mix(st.commission); mix(st.points);
  mix(st.perfectStrikes); mix(st.ruined); mix(st.completed); mix(st.chain); mix(st.bestChain); mix(st.lastBeat); mix(st.quenchesLeft); mix(st.scale ? 1 : 0);
  mix(st.work.quality); mix(st.work.strikes);
  for (const o of st.outcomes) mix(o === "made" ? 1 : o === "half" ? 2 : o === "ruined" ? 3 : 0);
  return (h >>> 0).toString(16);
}
