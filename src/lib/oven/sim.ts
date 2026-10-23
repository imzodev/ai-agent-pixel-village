// Marigold's Oven's run: dough into the ovens, out again golden (not doughy, not
// burnt), while customers come in with orders. A golden bake goes to the oldest
// customer still wanting it, or onto the shelf for the next one; an order filled
// in time pays its goods, a bonus and a tip; a customer kept waiting too long
// leaves. A minute. The browser plays it live and the server replays the stored
// inputs to score it, so whole numbers and a fixed order (a test checks).
// Pure. Numbers: rules.ts. Course: course.ts.

import * as rules from "./rules";
import { doughsOf } from "./course";
import type { OvenCourse, OvenDetail, OvenEventKind, OvenGoodKey, OvenInput, OvenState } from "@/types/oven";
import type { ArcadeResult } from "@/types/arcade";

const { MAX_INPUTS, OVENS, OVEN_GOODS, ORDER_BONUS, PERFECT_BONUS, PERFECT_HALF, PERFECT_HALVES, RUN_TICKS, TIP_MAX } = rules;
const GOODS = Object.keys(OVEN_GOODS) as OvenGoodKey[];

export function initOven(course: OvenCourse): OvenState {
  return {
    tick: 0,
    ovens: Array.from({ length: OVENS }, () => null),
    tickets: course.tickets.map((t) => ({ status: "coming", got: t.items.map(() => 0) })),
    shelf: { bread: [], honey_bun: [], apple_pie: [], cherry_pie: [], peach_pie: [] },
    points: 0, served: 0, perfect: 0, spoiled: 0, left: 0, log: [], done: false,
  };
}

/**
 * How far along a bake is, in quarter-ticks against its good's own times
 * (the hot oven's quarters run faster): its progress, the golden window, and
 * the perfect middle.
 */
export function bakeOf(course: OvenCourse, oven: number, item: OvenGoodKey, loadedAt: number, tick: number) {
  const g = OVEN_GOODS[item];
  const e = (tick - loadedAt) * course.heat[oven];
  const golden = g.bakeTicks * 4, burnt = (g.bakeTicks + g.goldenTicks) * 4, mid = golden + g.goldenTicks * 2;
  return { e, golden, burnt, mid, perfectFrom: mid - PERFECT_HALF * 4, perfectTo: mid + PERFECT_HALF * 4 };
}

/** What taking it out now would give. */
export function takeResult(course: OvenCourse, st: OvenState, oven: number): "doughy" | "golden" | "perfect" | "burnt" | null {
  const slot = st.ovens[oven];
  if (!slot) return null;
  const b = bakeOf(course, oven, slot.item, slot.at, st.tick);
  if (b.e < b.golden) return "doughy";
  if (b.e >= b.burnt) return "burnt";
  return b.e >= b.perfectFrom && b.e <= b.perfectTo ? "perfect" : "golden";
}

export const canLoad = (st: OvenState, course: OvenCourse, oven: number, item: OvenGoodKey): boolean =>
  !st.done && oven >= 0 && oven < OVENS && !st.ovens[oven] && doughsOf(course).includes(item);

export const canTake = (st: OvenState, oven: number): boolean => !st.done && oven >= 0 && oven < OVENS && !!st.ovens[oven];

function log(st: OvenState, k: OvenEventKind, extra: { oven?: number; ticket?: number; good?: OvenGoodKey; points?: number } = {}): void {
  st.log.push({ k, at: st.tick, ...extra });
}

/** Give a golden good (worth `points`) to the oldest open order still wanting one; true if one did. */
function give(st: OvenState, course: OvenCourse, good: OvenGoodKey, points: number): boolean {
  for (let i = 0; i < st.tickets.length; i++) {
    const t = st.tickets[i];
    if (t.status !== "open") continue;
    const items = course.tickets[i].items;
    for (let j = 0; j < items.length; j++) {
      if (items[j] !== good || t.got[j] > 0) continue;
      t.got[j] = points;
      if (t.got.every((p) => p > 0)) finish(st, course, i);
      return true;
    }
  }
  return false;
}

/** An order filled: its goods, the bonus, and a tip for the patience left. */
function finish(st: OvenState, course: OvenCourse, i: number): void {
  const t = st.tickets[i], c = course.tickets[i];
  const left = c.at + c.patience - st.tick;
  const tip = Math.round((TIP_MAX * Math.max(0, left)) / c.patience);
  const pts = t.got.reduce((s, p) => s + p, 0) + ORDER_BONUS + tip;
  t.status = "served";
  st.points += pts;
  st.served++;
  log(st, "served", { ticket: i, points: pts });
}

/** One tick: this tick's inputs, then customers coming in, then customers giving up. */
export function stepOven(st: OvenState, course: OvenCourse, inputs: readonly OvenInput[]): void {
  if (st.done) return;
  for (const inp of inputs) {
    if (inp.k === "load") {
      if (!canLoad(st, course, inp.oven, inp.item)) continue;
      st.ovens[inp.oven] = { item: inp.item, at: st.tick };
      log(st, "load", { oven: inp.oven, good: inp.item });
    } else if (inp.k === "take") {
      const res = takeResult(course, st, inp.oven), slot = st.ovens[inp.oven];
      if (!res || !slot) continue;
      st.ovens[inp.oven] = null;
      if (res === "doughy" || res === "burnt") { st.spoiled++; log(st, res, { oven: inp.oven, good: slot.item }); continue; }
      const base = OVEN_GOODS[slot.item].points;
      const points = res === "perfect" ? Math.round((base * PERFECT_HALVES) / 2) : base;
      if (res === "perfect") st.perfect++;
      log(st, res, { oven: inp.oven, good: slot.item, points });
      if (!give(st, course, slot.item, points)) st.shelf[slot.item].push(points);
    }
  }

  for (let i = 0; i < st.tickets.length; i++) {
    const t = st.tickets[i], c = course.tickets[i];
    if (t.status === "coming" && st.tick >= c.at) {
      t.status = "open";
      log(st, "arrive", { ticket: i });
      // Whatever's on the shelf that they want, oldest first.
      for (let j = 0; j < c.items.length && t.status === "open"; j++) {
        const shelf = st.shelf[c.items[j]];
        if (t.got[j] === 0 && shelf.length) {
          t.got[j] = shelf.shift()!;
          if (t.got.every((p) => p > 0)) finish(st, course, i);
        }
      }
    } else if (t.status === "open" && st.tick >= c.at + c.patience) {
      t.status = "left";
      st.left++;
      log(st, "left", { ticket: i });
    }
  }

  st.tick++;
  if (st.tick >= RUN_TICKS) st.done = true;
}

export const ovenDetail = (st: OvenState): OvenDetail => ({ served: st.served, perfect: st.perfect, spoiled: st.spoiled, left: st.left });

/** The orders' worth; a quarter more if nobody left and nothing spoiled. */
export function scoreOven(st: OvenState): ArcadeResult {
  const perfect = st.done && st.served > 0 && st.left === 0 && st.spoiled === 0;
  return { score: st.points + (perfect ? Math.round(st.points * PERFECT_BONUS) : 0), ticks: st.tick, perfect, detail: { ...ovenDetail(st) } };
}

/** Inputs as the server accepts them: known kinds, ovens and goods, ticks in order, not too many. Null if not. */
export function cleanOvenInputs(raw: unknown): OvenInput[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_INPUTS) return null;
  const out: OvenInput[] = [];
  let last = -1;
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    const t = Number(o?.t), oven = Number(o?.oven);
    if (!Number.isInteger(t) || t < last || t < 0 || t >= RUN_TICKS) return null;
    if (!Number.isInteger(oven) || oven < 0 || oven >= OVENS) return null;
    last = t;
    if (o.k === "take") out.push({ t, k: "take", oven });
    else if (o.k === "load" && GOODS.includes(o.item as OvenGoodKey)) out.push({ t, k: "load", oven, item: o.item as OvenGoodKey });
    else return null;
  }
  return out;
}

/** Play a whole run from its inputs (the server's check, and the replays). */
export function replayOven(course: OvenCourse, inputs: readonly OvenInput[]): { state: OvenState; result: ArcadeResult } {
  const st = initOven(course);
  let k = 0;
  while (!st.done) {
    const now: OvenInput[] = [];
    while (k < inputs.length && inputs[k].t < st.tick) k++;
    while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
    stepOven(st, course, now);
  }
  return { state: st, result: scoreOven(st) };
}

export function ovenHash(st: OvenState): string {
  let h = 2166136261;
  const mix = (n: number) => { h = Math.imul(h ^ (n | 0), 16777619); };
  mix(st.tick); mix(st.points); mix(st.served); mix(st.perfect); mix(st.spoiled); mix(st.left);
  for (const o of st.ovens) { mix(o ? GOODS.indexOf(o.item) + 1 : 0); mix(o?.at ?? -1); }
  for (const t of st.tickets) for (const p of t.got) mix(p);
  for (const g of GOODS) mix(st.shelf[g].length);
  return (h >>> 0).toString(16);
}
