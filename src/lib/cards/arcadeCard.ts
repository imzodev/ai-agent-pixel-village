// The arcade's share pictures (1200×630): a picture of the game on the left,
// the words on the right. A day's course (/<game>/course.png) and a run's
// card (/<game>/r/<id>/card.png), written once to .cache/cards: neither ever
// changes. Whistle's picture is the field with the flock; Harvest Haul's is the
// cart with its load (as it arrived, for a run); Fishing Derby's is the pond with
// its fish (for a run, the catch laid out by the dock); Marigold's Oven's is the
// three ovens over the day's orders (for a run, what was served); Beehive
// Builder's is the comb (for a run, as it ended); Log Flume's is the river with its
// rocks and the mill (for a run, the tally at each gate); Bjorn's Forge's is the
// anvil over the heat strip (for a run, the day's board with each commission);
// Pip's Archery Butts' is a target face over the day's butts (for a run, where
// each arrow struck and the tally at each butt); Della's Loom's is the cloth on the
// loom (for a course, the day's figure and a sample woven from it, never the real
// rows; for a run, every row woven, with its snags); Fenwick's Orchard Catch's is
// the three trees over the day's fruit (for a run, what went into the basket).

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { FIELD_H, FIELD_W, SHEEP_COUNT } from "@/lib/whistle/rules";
import { initRun, replay } from "@/lib/whistle/sim";
import { HAUL_ITEMS, ROAD_STEP } from "@/lib/haul/rules";
import { marketX } from "@/lib/haul/course";
import { CART_PARTS, initHaul, replayHaul } from "@/lib/haul/sim";
import { DERBY_FISH, DOCK, FIELD_H as POND_H, FIELD_W as POND_W } from "@/lib/derby/rules";
import { initDerby, replayDerby } from "@/lib/derby/sim";
import { HOT_HEAT, OVEN_GOODS } from "@/lib/oven/rules";
import { replayOven } from "@/lib/oven/sim";
import { CELLS } from "@/lib/hive/board";
import { initHive, replayHive } from "@/lib/hive/sim";
import { gatesOf, riverAt } from "@/lib/flume/course";
import { FIELD_H as RIVER_H, FIELD_W as RIVER_W, MILL_Y } from "@/lib/flume/rules";
import { replayFlume } from "@/lib/flume/sim";
import { FORGE_PIECES } from "@/lib/forgeGame/rules";
import { replayForge } from "@/lib/forgeGame/sim";
import { RING_BULL, RING_INNER, RING_OUTER } from "@/lib/archery/rules";
import { replayArchery } from "@/lib/archery/sim";
import { GOLD as GOLD_THREAD, ROWS as LOOM_ROWS } from "@/lib/loom/rules";
import { replayLoom } from "@/lib/loom/sim";
import { SPOOL_COLORS } from "@/components/loom/draw";
import { replayCatch } from "@/lib/catch/sim";
import { fruitColor } from "@/components/catch/draw";
import { ARCADE_GAMES, courseNumber } from "@/lib/arcade/games";
import { courseOf } from "@/lib/arcadeServer";
import { CARD_W, renderCard, siteHost, textPng, type CardLayer } from "./cardKit";
import type { ArcadeGameKey, ArcadeRunView } from "@/types/arcade";
import type { Course, RunState, WhistleInput } from "@/types/whistle";
import type { HaulCourse, HaulInput, HaulState } from "@/types/haul";
import type { DerbyCourse, DerbyInput, DerbyState } from "@/types/derby";
import type { OvenCourse, OvenInput, OvenState } from "@/types/oven";
import type { HiveCourse, HiveInput, HiveState } from "@/types/hive";
import type { FlumeCourse, FlumeInput, FlumeState } from "@/types/flume";
import type { ForgeCourse, ForgeInput, ForgeState } from "@/types/forgeGame";
import type { ArcheryCourse, ArcheryInput, ArcheryState, ArcheryTargetKind } from "@/types/archery";
import type { LoomCourse, LoomInput, LoomState } from "@/types/loom";
import type { CatchCourse, CatchFruitKind, CatchInput, CatchState } from "@/types/catch";

const CACHE = path.join(process.cwd(), ".cache", "cards");
const GOLD = "#ffd166";
const PIC_H = 520, PIC_W = 292;
const TEMPLATE_NAME = { meadow: "Hedgerow meadow", river: "River crossing", lanes: "The lanes", pond: "Duck pond" } as const;
const ITEM_COLOR: Record<string, string> = {
  pumpkin: "#e8802a", cabbage: "#72b866", watermelon: "#2e7a36", cheese: "#f0c040", eggs: "#d4b050",
  hay: "#d4b050", crate: "#b8804a", flour: "#d4c09a", churn: "#aab4c2", cake: "#faf4ea",
};
type Line = { text: string; font: "pixel" | "body"; size: number; color: string; bold?: boolean; gap: number };

/** Whistle: the field, the flock where it ended up (or where it starts). */
function whistleSvg(course: Course, st: RunState): string {
  const K = PIC_H / FIELD_H, w = Math.round(FIELD_W * K);
  const r = (x: number) => (x * K).toFixed(1);
  const rect = (b: { x: number; y: number; w: number; h: number }, fill: string) => `<rect x="${r(b.x)}" y="${r(b.y)}" width="${r(b.w)}" height="${r(b.h)}" fill="${fill}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${PIC_H}"><rect width="${w}" height="${PIC_H}" fill="#79b04a"/>${[
    rect(course.pen, "#e3cf8f"),
    ...course.water.map((x) => rect(x, "#3d7fb8")),
    ...course.walls.map((x) => rect(x, Math.min(x.w, x.h) <= 6 ? "#6b4226" : "#3f7a2c")),
    ...course.dens.map((d) => `<ellipse cx="${r(d.x)}" cy="${r(d.y + 4)}" rx="${r(10)}" ry="${r(5)}" fill="#2a1e14"/>`),
    ...st.sheep.filter((s) => s.status !== "lost").map((s) => `<circle cx="${r(s.x)}" cy="${r(s.y)}" r="${r(5)}" fill="#fbf7ee" stroke="#4a4a4a" stroke-width="1.5"/>`),
    ...st.wolves.map((x) => `<circle cx="${r(x.x)}" cy="${r(x.y)}" r="${r(6)}" fill="#5a5a66" stroke="#222" stroke-width="1.5"/>`),
  ].join("")}</svg>`;
}

/** Harvest Haul: the cart and its load, close up, on the road (cracked things marked). */
function haulSvg(course: HaulCourse, st: HaulState): string {
  const bed = st.bodies[0];
  const K = 1.7, cx = bed.x, cy = bed.y - 60;
  const tf = (x: number, y: number, c: number, s: number) => `matrix(${c} ${s} ${-s} ${c} ${((x - cx) * K + PIC_W / 2).toFixed(1)} ${((y - cy) * K + PIC_H / 2).toFixed(1)})`;
  const shapes = st.bodies.map((b) => {
    const t = tf(b.x, b.y, b.c, b.s);
    const fill = b.item < 0 ? "#946036" : ITEM_COLOR[course.items[b.item]] ?? "#ccc";
    const stroke = b.item >= 0 && st.broken[b.item] ? "#e84858" : "#2a1e18";
    if (b.shape.kind === "circle") return `<circle transform="${t}" r="${(b.shape.r * K).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`;
    const w = b.shape.hw * K, h = b.shape.hh * K;
    return `<rect transform="${t}" x="${-w}" y="${-h}" width="${2 * w}" height="${2 * h}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`;
  });
  // The road under the cart.
  const pts: string[] = [];
  for (let sx = -10; sx <= PIC_W + 10; sx += 8) {
    const wx = cx + (sx - PIC_W / 2) / K;
    const i = Math.max(0, Math.min(course.road.heights.length - 1, Math.round(wx / ROAD_STEP)));
    pts.push(`${sx},${((course.road.heights[i] - cy) * K + PIC_H / 2).toFixed(1)}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PIC_W}" height="${PIC_H}"><rect width="${PIC_W}" height="${PIC_H}" fill="#9fd8f4"/>
    <polygon points="-10,${PIC_H} ${pts.join(" ")} ${PIC_W + 10},${PIC_H}" fill="#9a7348" stroke="#6a4a2a" stroke-width="3"/>${shapes.join("")}</svg>`;
}

const POND_COLORS = { day: ["#7cb850", "#3d86c0"], dusk: ["#8aa848", "#4a7aa8"], night: ["#3a5a3a", "#1e3e62"] } as const;

/** Fishing Derby: the pond from above; the fish where they swim, or (a run) the catch laid out by the dock, the trophy in gold. */
function derbySvg(course: DerbyCourse, st: DerbyState, run: boolean): string {
  const K = PIC_H / POND_H, w = Math.round(POND_W * K);
  const r = (x: number) => (x * K).toFixed(1);
  const [bank, water] = POND_COLORS[course.time];
  const trophy = course.fish.length - 1;
  const fish = (x: number, y: number, i: number, k = 1) => {
    const cf = course.fish[i], len = (8 + Math.sqrt(cf.grams) / 3.2) * k;
    const glow = i === trophy ? `<ellipse cx="${r(x)}" cy="${r(y)}" rx="${r(len * 0.8)}" ry="${r(len * 0.5)}" fill="#ffd166" opacity="0.45"/>` : "";
    return `${glow}<ellipse cx="${r(x)}" cy="${r(y)}" rx="${r(len / 2)}" ry="${r(len * 0.18)}" fill="${DERBY_FISH[cf.key].color}" stroke="#1a1410" stroke-width="1.5"/>`;
  };
  const shown = run
    // The catch on the grass either side of the dock, in the order landed.
    ? st.caught.map((i, n) => {
        const len = (8 + Math.sqrt(course.fish[i].grams) / 3.2) * 1.4, right = n % 2 === 1;
        return fish(right ? DOCK.x + DOCK.w + 10 + len / 2 : DOCK.x - 10 - len / 2, DOCK.y + 12 + Math.floor(n / 2) * 13, i, 1.4);
      }).join("")
    : course.fish.map((f, i) => (i === trophy ? "" : fish(f.x, f.y, i))).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${PIC_H}"><rect width="${w}" height="${PIC_H}" fill="${bank}"/>${[
    ...course.pond.map((p) => `<circle cx="${r(p.x)}" cy="${r(p.y)}" r="${r(p.r + 4)}" fill="#8a7048"/>`),
    ...course.pond.map((p) => `<circle cx="${r(p.x)}" cy="${r(p.y)}" r="${r(p.r)}" fill="${water}"/>`),
    ...course.reeds.map((p) => `<circle cx="${r(p.x)}" cy="${r(p.y)}" r="${r(p.r)}" fill="#5a8a3a" opacity="0.7"/>`),
    ...course.pads.map((p) => `<circle cx="${r(p.x)}" cy="${r(p.y)}" r="${r(p.r)}" fill="#3c8a46"/>`),
    `<rect x="${r(DOCK.x)}" y="${r(DOCK.y)}" width="${r(DOCK.w)}" height="${r(DOCK.h)}" fill="#946036" stroke="#4a2c18" stroke-width="2"/>`,
    shown,
    course.weather === "rain" ? `<rect width="${w}" height="${PIC_H}" fill="#9fb8e0" opacity="0.15"/>` : "",
  ].join("")}</svg>`;
}

/** Marigold's Oven: three brick ovens (the hot one redder) over the order tickets; for a run, each ticket green if served, red if they walked out. */
function ovenSvg(course: OvenCourse, st: OvenState | null): string {
  const W = PIC_W, ow = 80, gap = 12, x0 = (W - (3 * ow + 2 * gap)) / 2;
  const ovens = course.heat.map((h, i) => {
    const x = x0 + i * (ow + gap);
    return `<rect x="${x}" y="40" width="${ow}" height="120" fill="${h === HOT_HEAT ? "#a84c38" : "#8a3a2c"}" stroke="#2a1410" stroke-width="3"/>
      <path d="M${x + 12} 140 V90 a${(ow - 24) / 2} ${(ow - 24) / 2} 0 0 1 ${ow - 24} 0 V140 Z" fill="#2a1410"/>
      <rect x="${x + 16}" y="120" width="${ow - 32}" height="12" fill="${h === HOT_HEAT ? "#ff6e28" : "#ff9a3c"}" opacity="0.8"/>`;
  }).join("");
  const tickets = course.tickets.map((t, i) => {
    const col = i % 3, row = Math.floor(i / 3), x = 18 + col * 88, y = 190 + row * 64;
    const s = st?.tickets[i].status, edge = s === "served" ? "#4aa858" : s === "left" ? "#e84858" : "#8a6a48";
    const dots = t.items.map((g, j) => `<circle cx="${x + 14 + j * 14}" cy="${y + 30}" r="6" fill="${OVEN_GOODS[g].fill}" stroke="${OVEN_GOODS[g].crust}" stroke-width="3"/>`).join("");
    return `<rect x="${x}" y="${y}" width="80" height="52" fill="${t.rush ? "#fff0f4" : "#fffaec"}" stroke="${edge}" stroke-width="${s ? 5 : 2}"/>${dots}`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${PIC_H}"><rect width="${W}" height="${PIC_H}" fill="#3a2a22"/>${ovens}${tickets}</svg>`;
}

/** Beehive Builder: the comb, filled cells amber (old comb darker), flowers and the royal jelly marked. */
function hiveSvg(course: HiveCourse, st: HiveState): string {
  // Seven cells across the widest row, with room for the frame.
  const k = Math.sqrt(3), S = Math.floor((PIC_W - 16) / (7 * k)), cx = PIC_W / 2, cy = PIC_H / 2;
  const corners = (x: number, y: number, s: number) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 6; return `${(x + s * Math.cos(a)).toFixed(1)},${(y + s * Math.sin(a)).toFixed(1)}`; }).join(" ");
  const at = (cells: readonly (readonly number[])[], q: number, r: number) => cells.some(([a, b]) => a === q && b === r);
  const cells = CELLS.map(([q, r], i) => {
    const x = cx + S * k * (q + r / 2), y = cy + S * 1.5 * r;
    const fill = st.filled[i] ? (at(course.comb, q, r) ? "#c07a20" : "#e8a830") : "#f6dca0";
    const mark = at(course.flowers, q, r) ? `<circle cx="${x}" cy="${y}" r="7" fill="#fff" stroke="#f0c040" stroke-width="4"/>`
      : course.jelly && course.jelly[0] === q && course.jelly[1] === r ? `<polygon points="${corners(x, y, S - 9)}" fill="none" stroke="#fff" stroke-width="4"/>` : "";
    return `<polygon points="${corners(x, y, S + 3)}" fill="#7a5020"/><polygon points="${corners(x, y, S - 2)}" fill="${fill}" stroke="#a06a20" stroke-width="2"/>${mark}`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PIC_W}" height="${PIC_H}"><rect width="${PIC_W}" height="${PIC_H}" fill="#6a9a3a"/>${cells}</svg>`;
}

/** Log Flume: the river section from above, rocks, rapids, the mill's gates; for a run, how many logs went through each. */
function flumeSvg(course: FlumeCourse, st: FlumeState | null): string {
  const K = PIC_H / RIVER_H, w = Math.round(RIVER_W * K);
  const r = (x: number) => (x * K).toFixed(1);
  const left: string[] = [], right: string[] = [];
  for (let y = 0; y <= RIVER_H; y += 10) { const { cx, hw } = riverAt(course.river, y); left.push(`${r(cx - hw)},${r(y)}`); right.unshift(`${r(cx + hw)},${r(y)}`); }
  const { spans } = gatesOf(course);
  const tally = spans.map((_, g) => (st ? st.logs.filter((l) => l.gate === g).length : 0));
  const gates = spans.map((s, g) => {
    const spill = g === course.mill.spillway;
    return `<rect x="${r(s.x0 + 4)}" y="${r(MILL_Y + 4)}" width="${r(s.x1 - s.x0 - 8)}" height="${r(RIVER_H - MILL_Y)}" fill="${spill ? "#3a7ab0" : "#2a1a10"}"/>` +
      (st ? `<text x="${r((s.x0 + s.x1) / 2)}" y="${r(RIVER_H - 6)}" font-size="22" font-family="sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">${tally[g]}</text>` : "") +
      (g === course.mill.birchSaw ? `<circle cx="${r(s.x1 - 10)}" cy="${r(MILL_Y + 10)}" r="4" fill="#ffd166"/>` : "");
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${PIC_H}"><rect width="${w}" height="${PIC_H}" fill="#4a7a34"/>
    <polygon points="${left.join(" ")} ${right.join(" ")}" fill="#3a7ab0" stroke="#8a7048" stroke-width="6"/>${
    course.rapids.map((a) => `<rect x="0" y="${r(a.y0)}" width="${w}" height="${r(a.y1 - a.y0)}" fill="#c8e6ff" opacity="0.18"/>`).join("")}${
    course.rocks.map((o) => `<circle cx="${r(o.x)}" cy="${r(o.y)}" r="${r(o.r)}" fill="#6a6a74" stroke="#fff" stroke-width="2"/>`).join("")}
    <rect x="0" y="${r(MILL_Y + 4)}" width="${w}" height="${r(RIVER_H - MILL_Y)}" fill="#6e4426"/>${gates}</svg>`;
}

/** Bjorn's Forge: the forge, the anvil with the billet glowing on it, and the day's board; for a run, each commission stamped. */
function forgeSvg(course: ForgeCourse, st: ForgeState | null): string {
  const W = PIC_W;
  const flames = [0, 1, 2, 3, 4].map((i) => {
    const x = 38 + i * 16, h = 30 + ((i * 37) % 3) * 10;
    return `<path d="M${x - 9} 214 Q${x - 4} ${214 - h * 0.6} ${x} ${214 - h} Q${x + 4} ${214 - h * 0.6} ${x + 9} 214 z" fill="#ff8a30"/>
      <path d="M${x - 5} 214 Q${x - 2} ${214 - h * 0.4} ${x} ${214 - h * 0.65} Q${x + 2} ${214 - h * 0.4} ${x + 5} 214 z" fill="#ffe08a"/>`;
  }).join("");
  const forge = `<rect x="0" y="0" width="${W}" height="300" fill="#2e2420"/>
    <circle cx="70" cy="200" r="110" fill="#ff7a28" opacity="0.18"/>
    <path d="M18 160 h104 l-26 -90 h-52 z" fill="#4a4a54"/><rect x="40" y="0" width="60" height="72" fill="#3a3a42"/>
    <rect x="14" y="214" width="112" height="86" fill="#8a3e2a"/><rect x="10" y="208" width="120" height="8" fill="#5a2a1c"/>
    <rect x="24" y="194" width="92" height="20" rx="4" fill="#140a08"/>${flames}`;
  const anvil = `<rect x="168" y="262" width="66" height="38" fill="#5a3820"/>
    <path d="M136 232 Q150 228 160 228 h92 v12 l-14 2 -6 12 14 8 h-84 l14 -8 -6 -12 -14 -2 Q150 238 136 232 z" fill="#5a5a66" stroke="#1a1a20" stroke-width="2"/>`;
  const heat = st ? 300 : 520;
  const billet = `<circle cx="206" cy="222" r="30" fill="#ffb040" opacity="${st ? 0.15 : 0.35}"/>
    <path d="M178 218 h46 l12 5 -12 5 h-46 z" fill="${heat > 400 ? "#ffb040" : "#c04a24"}" stroke="#7a2a10" stroke-width="1.5"/>`;
  const bars = course.commissions.map((c, i) => {
    const out = st?.outcomes[i] ?? null;
    const [stamp, col] = out === "made" ? ["MADE", "#2f8a3a"] : out === "half" ? ["½ PAID", "#b07a10"] : out === "ruined" ? ["LOST", "#c0302a"] : ["", ""];
    const x = 14 + (i % 2) * 136, y = 318 + Math.floor(i / 2) * 98;
    return `<rect x="${x}" y="${y}" width="128" height="88" fill="#f2e2bc" stroke="#a0784a" stroke-width="2"/>
      <circle cx="${x + 64}" cy="${y + 6}" r="4" fill="#b03a2a"/>
      <text x="${x + 28}" y="${y + 50}" font-size="30" text-anchor="middle" font-family="sans-serif">${FORGE_PIECES[c.piece].icon}</text>
      <text x="${x + 88}" y="${y + 40}" font-size="16" text-anchor="middle" font-family="sans-serif" font-weight="bold" fill="#3a2414">${c.strikes} blows</text>
      <text x="${x + 88}" y="${y + 62}" font-size="14" text-anchor="middle" font-family="sans-serif" fill="#6a4a2a">${c.points} pts</text>${
      stamp ? `<g transform="rotate(-14 ${x + 64} ${y + 46})"><rect x="${x + 22}" y="${y + 30}" width="84" height="30" fill="none" stroke="${col}" stroke-width="3"/>
      <text x="${x + 64}" y="${y + 52}" font-size="18" text-anchor="middle" font-family="sans-serif" font-weight="bold" fill="${col}">${stamp}</text></g>` : ""}`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${PIC_H}"><rect width="${W}" height="${PIC_H}" fill="#3e2616"/>
    ${forge}${anvil}${billet}${bars}</svg>`;
}

const BUTT_NAMES: Record<ArcheryTargetKind, string> = { post: "post", hoist: "hoist", cart: "cart", king: "King's" };

/** Pip's Archery Butts: a target face, and the day's butts down the range; for a run, each arrow where it struck and each butt's tally. */
function archerySvg(course: ArcheryCourse, st: ArcheryState | null): string {
  const W = PIC_W, cx = W / 2, cy = 150, R = 118;
  const rings = [[RING_OUTER, "#2f6fb8"], [RING_INNER, "#d24a3a"], [RING_BULL, "#f2c230"]] as const;
  const face = `<circle cx="${cx}" cy="${cy}" r="${R + 10}" fill="#c8a45a"/><circle cx="${cx}" cy="${cy}" r="${R + 2}" fill="#f4f0e4"/>${rings
    .map(([r, col]) => `<circle cx="${cx}" cy="${cy}" r="${Math.round((r / RING_OUTER) * R)}" fill="${col}"/>`).join("")}`;
  // Where each arrow struck: its height on the face is real; across, spread out so they don't hide each other.
  const holes = (st?.arrows ?? []).map((a, i) => {
    if (a.state !== "stuck") return "";
    const y = cy - (a.dy / RING_OUTER) * R, half = Math.sqrt(Math.max(0, R * R - (y - cy) * (y - cy)));
    const x = cx + ((((i * 37) % 19) - 9) / 10) * half * 0.8;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#3a2414" stroke="#f4ead0" stroke-width="1.5"/>`;
  }).join("");
  const rows = course.targets.map((t, i) => {
    const y = 316 + i * 40, hits = st ? st.arrows.filter((a) => a.state === "stuck" && a.target === i).length : null;
    const at = Math.round(Math.min(t.x0, t.x1));
    return `<rect x="10" y="${y}" width="${W - 20}" height="34" rx="6" fill="${t.kind === "king" ? "#5a2a6a" : "#2e4a22"}"/>
      <text x="22" y="${y + 23}" font-size="17" font-family="sans-serif" font-weight="bold" fill="#f4ead0">${at} m · ${BUTT_NAMES[t.kind]}</text>
      <text x="${W - 22}" y="${y + 23}" font-size="17" text-anchor="end" font-family="sans-serif" font-weight="bold" fill="${GOLD}">${hits === null ? `×${t.worth}` : `${hits} hit${hits === 1 ? "" : "s"}`}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${PIC_H}"><rect width="${W}" height="${PIC_H}" fill="#5b9a40"/>
    <rect width="${W}" height="300" fill="#8fc4ec"/><rect y="282" width="${W}" height="18" fill="#6fae4e"/>
    <rect x="${cx - 4}" y="${cy + R}" width="8" height="${282 - cy - R}" fill="#7a5230"/>${face}${holes}${rows}</svg>`;
}

/** Della's Loom: the cloth on the loom, the newest row nearest the beam; for a course, the day's figure over a sample woven from it (the real rows would give the game away). */
function loomSvg(course: LoomCourse, st: LoomState | null): string {
  const W = PIC_W, x0 = 26, cw = W - 52, beam = 470, band = 16;
  const f = course.figure;
  const sample = Array.from({ length: 6 }, (_, r) => ({ threads: Array.from({ length: 8 }, (_, i) => f[(i + r) % f.length]) }));
  const cloth = st ? course.rows : sample;
  const woven = st ? st.row : sample.length;
  const warp = Array.from({ length: 31 }, (_, i) => `<line x1="${(x0 + 2 + i * ((cw - 4) / 30)).toFixed(1)}" y1="64" x2="${(x0 + 2 + i * ((cw - 4) / 30)).toFixed(1)}" y2="${beam}" stroke="#e8dcc4" stroke-opacity=".5"/>`).join("");
  const rows = cloth.slice(0, Math.min(woven, LOOM_ROWS)).map((r, i) => {
    const y = beam - band * (i + 1), w = cw / r.threads.length;
    return r.threads.map((c, j) => `<rect x="${(x0 + w * j).toFixed(1)}" y="${y}" width="${(w + 0.6).toFixed(1)}" height="${band - 1}" fill="${SPOOL_COLORS[c]}"${c === GOLD_THREAD ? ' stroke="#fff4c0" stroke-width="1"' : ""}/>`).join("");
  }).join("");
  const snags = (st?.snagged ?? []).filter((s) => s.row < woven).map((s) => {
    const r = course.rows[s.row], w = cw / r.threads.length, slot = r.kind === "back" ? r.threads.length - 1 - s.i : s.i;
    const x = x0 + w * slot + w / 2, y = beam - band * (s.row + 1) + 3;
    return `<path d="M${(x - 6).toFixed(1)} ${y + 8} q6 -14 12 0" fill="none" stroke="#3a1414" stroke-width="3"/>`;
  }).join("");
  const figure = st ? "" : course.figure.map((c, i) => `<rect x="${W / 2 - course.figure.length * 18 + i * 36}" y="16" width="32" height="32" rx="6" fill="${SPOOL_COLORS[c]}" stroke="#2a1a10" stroke-width="2"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${PIC_H}"><rect width="${W}" height="${PIC_H}" fill="#7a5a3a"/>
    <rect x="4" y="56" width="16" height="${beam - 40}" fill="#5a3a22"/><rect x="${W - 20}" y="56" width="16" height="${beam - 40}" fill="#5a3a22"/>
    <rect x="0" y="52" width="${W}" height="14" fill="#7a4e2c"/>${warp}${rows}${snags}<rect x="0" y="${beam}" width="${W}" height="20" fill="#7a4e2c"/>${figure}</svg>`;
}

const CATCH_ROWS: [CatchFruitKind, string][] = [["apple", "Apples"], ["pear", "Pears"], ["plum", "Plums"], ["golden", "Golden pear"], ["rotten", "Rotten"], ["wasp", "Wasps"]];

/** Fenwick's Orchard Catch: three trees in fruit, then a row per kind (for a course how many fall today, for a run how many were caught, the wasps as stings). */
function catchSvg(course: CatchCourse, st: CatchState | null): string {
  const W = PIC_W;
  const trees = [56, 146, 236].map((x) => `<rect x="${x - 6}" y="120" width="12" height="70" fill="#6a4426"/>
    <circle cx="${x}" cy="96" r="44" fill="#3f8a34"/><circle cx="${x - 22}" cy="112" r="26" fill="#3f8a34"/><circle cx="${x + 22}" cy="112" r="26" fill="#3f8a34"/>
    ${[[-18, 86, "apple"], [10, 76, "apple"], [24, 104, "pear"], [-6, 112, "plum"], [-28, 112, "apple"]].map(([dx, y, k]) => `<circle cx="${x + Number(dx)}" cy="${y}" r="5" fill="${fruitColor(k as CatchFruitKind)}"/>`).join("")}`).join("");
  const count = (k: CatchFruitKind) => st
    ? (k === "wasp" ? st.stings : st.fruit.filter((f) => f.kind === k && f.state === "caught").length)
    : course.drops.filter((d) => d.kind === k).length;
  const rows = CATCH_ROWS.map(([k, name], i) => {
    const y = 214 + i * 46, n = count(k);
    return `<rect x="10" y="${y}" width="${W - 20}" height="40" rx="7" fill="${k === "golden" ? "#5a4a1a" : "#2e4a22"}"/>
      <circle cx="34" cy="${y + 20}" r="10" fill="${fruitColor(k)}"/>
      <text x="56" y="${y + 27}" font-size="18" font-family="sans-serif" font-weight="bold" fill="#f4ead0">${name}</text>
      <text x="${W - 22}" y="${y + 27}" font-size="18" text-anchor="end" font-family="sans-serif" font-weight="bold" fill="${GOLD}">${st && k === "wasp" ? `${n} sting${n === 1 ? "" : "s"}` : n}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${PIC_H}"><rect width="${W}" height="${PIC_H}" fill="#5b9a40"/>
    <rect width="${W}" height="190" fill="#8fc8ee"/>${trees}<rect y="188" width="${W}" height="8" fill="#4e8a36"/>${rows}</svg>`;
}

/** The left picture for a game, at a state. */
function pictureSvg(game: ArcadeGameKey, course: unknown, inputs: unknown[] | null): string {
  if (game === "whistle") {
    const c = course as Course;
    return whistleSvg(c, inputs ? replay(c, inputs as WhistleInput[]).state : initRun(c));
  }
  if (game === "flume") {
    const c = course as FlumeCourse;
    return flumeSvg(c, inputs ? replayFlume(c, inputs as FlumeInput[]).state : null);
  }
  if (game === "hive") {
    const c = course as HiveCourse;
    return hiveSvg(c, inputs ? replayHive(c, inputs as HiveInput[]).state : initHive(c));
  }
  if (game === "oven") {
    const c = course as OvenCourse;
    return ovenSvg(c, inputs ? replayOven(c, inputs as OvenInput[]).state : null);
  }
  if (game === "forge") {
    const c = course as ForgeCourse;
    return forgeSvg(c, inputs ? replayForge(c, inputs as ForgeInput[]).state : null);
  }
  if (game === "archery") {
    const c = course as ArcheryCourse;
    return archerySvg(c, inputs ? replayArchery(c, inputs as ArcheryInput[]).state : null);
  }
  if (game === "catch") {
    const c = course as CatchCourse;
    return catchSvg(c, inputs ? replayCatch(c, inputs as CatchInput[]).state : null);
  }
  if (game === "loom") {
    const c = course as LoomCourse;
    return loomSvg(c, inputs ? replayLoom(c, inputs as LoomInput[]).state : null);
  }
  if (game === "derby") {
    const c = course as DerbyCourse;
    return derbySvg(c, inputs ? replayDerby(c, inputs as DerbyInput[]).state : initDerby(c), !!inputs);
  }
  const c = course as HaulCourse;
  if (inputs) return haulSvg(c, replayHaul(c, inputs as HaulInput[]).state);
  // A course: the empty cart, with the day's load lined up beside the road.
  const st = initHaul(c);
  let x = st.bodies[0].x - 60, y = st.bodies[0].y - 30;
  for (const [i, key] of c.items.entries()) {
    const shape = HAUL_ITEMS[key].shape, half = shape.kind === "circle" ? shape.r : shape.hh;
    st.bodies.push({ id: CART_PARTS + i, x, y: y - half, c: 1, s: 0, vx: 0, vy: 0, w: 0, invMass: 1, invI: 1, friction: 1, shape, item: i });
    y -= 2 * half + 4;
    if (i % 3 === 2) { x += 48; y = st.bodies[0].y - 30; }
  }
  return haulSvg(c, st);
}

async function card(file: string, picture: string, lines: Line[]): Promise<Buffer> {
  const out = path.join(CACHE, file);
  try { return fs.readFileSync(out); } catch { /* not drawn yet */ }
  const layers: CardLayer[] = [];
  const pic = await sharp(Buffer.from(picture)).png().toBuffer({ resolveWithObject: true });
  const frame = await sharp({ create: { width: pic.info.width + 12, height: pic.info.height + 12, channels: 4, background: "#4a2c18" } }).png().toBuffer();
  layers.push({ input: frame, left: 54, top: 49 }, { input: pic.data, left: 60, top: 55 });
  const x = 60 + pic.info.width + 60, width = CARD_W - x - 60;
  let y = 80;
  for (const l of lines) {
    const t = await textPng(l.text, { font: l.font, size: l.size, color: l.color, bold: l.bold, width });
    layers.push({ input: t.input, left: x, top: y });
    y += t.height + l.gap;
  }
  const sheep = await sheepPng();
  if (sheep) layers.push({ input: sheep.input, left: CARD_W - 70 - sheep.width, top: 556 - sheep.height });
  const brand = await textPng(`thegroove · ${siteHost()}/play`, { font: "body", size: 26, color: "#fff6d0", bold: true });
  layers.push({ input: brand.input, left: x, top: 572 });
  const png = await renderCard(layers);
  try { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(out, png); } catch { /* serve it anyway */ }
  return png;
}

/** A sheep facing you, cut from the world's sheet (it sits at x 50–77, y 48–89 of its 128 px frame), at 3×. */
async function sheepPng(): Promise<{ input: Buffer; width: number; height: number } | null> {
  try {
    const crop = await sharp(path.join(process.cwd(), "public", "assets", "animals", "sheep.png"))
      .extract({ left: 49, top: 2 * 128 + 47, width: 30, height: 44 }).png().toBuffer();
    const input = await sharp(crop).resize(90, 132, { kernel: "nearest" }).png().toBuffer();
    return { input, width: 90, height: 132 };
  } catch {
    return null;
  }
}

/** A game's course for a day, for "today's course" posts and the page's preview. */
export function arcadeCoursePng(game: ArcadeGameKey, day: string): Promise<Buffer> {
  const g = ARCADE_GAMES[game], course = courseOf(game, day), number = courseNumber(game, day);
  let lines: Line[];
  if (game === "whistle") {
    const c = course as Course, wolves = c.dens.length;
    lines = [
      { text: `Today: ${TEMPLATE_NAME[c.template]}`, font: "body", size: 40, color: "#ffffff", bold: true, gap: 14 },
      { text: `${SHEEP_COUNT} sheep · ${wolves} wolf${wolves === 1 ? "" : "s"} · 75 seconds`, font: "body", size: 32, color: "#cfd8ff", gap: 30 },
      { text: "Tap to whistle: the sound pushes the flock away. Get them all in the pen.", font: "body", size: 30, color: "#ffb86b", bold: true, gap: 0 },
    ];
  } else if (game === "flume") {
    const c = course as FlumeCourse, oak = c.logs.filter((l) => l.kind === "oak").length;
    lines = [
      { text: `Today: ${c.rocks.length} rocks, ${c.rapids.length === 1 ? "a stretch" : "two stretches"} of rapids`, font: "body", size: 38, color: "#ffffff", bold: true, gap: 14 },
      { text: `${c.logs.length} logs (${oak} oak, one golden birch) · 70 seconds`, font: "body", size: 30, color: "#cfd8ff", gap: 30 },
      { text: "Steer each log past the rocks and into a saw, not the spillway.", font: "body", size: 30, color: "#ffb86b", bold: true, gap: 0 },
    ];
  } else if (game === "hive") {
    const c = course as HiveCourse;
    lines = [
      { text: `Today: ${c.comb.length} cells of old comb, ${c.flowers.length} flowers${c.jelly ? ", royal jelly" : ""}`, font: "body", size: 36, color: "#ffffff", bold: true, gap: 14 },
      { text: `${c.pieces.length} pieces · three minutes`, font: "body", size: 32, color: "#cfd8ff", gap: 30 },
      { text: "Fill whole lines to turn them to honey. Leave room, or the comb fills up.", font: "body", size: 30, color: "#ffb86b", bold: true, gap: 0 },
    ];
  } else if (game === "oven") {
    const c = course as OvenCourse, wanted = c.tickets.reduce((s, t) => s + t.items.length, 0);
    lines = [
      { text: `Today: ${OVEN_GOODS[c.pie].name.toLowerCase()} day`, font: "body", size: 40, color: "#ffffff", bold: true, gap: 14 },
      { text: `${c.tickets.length} customers · ${wanted} bakes wanted${c.tickets.some((t) => t.rush) ? " · a wedding party!" : ""}`, font: "body", size: 30, color: "#cfd8ff", gap: 30 },
      { text: "Three ovens, one minute. Take it out golden, never doughy, never burnt.", font: "body", size: 30, color: "#ffb86b", bold: true, gap: 0 },
    ];
  } else if (game === "forge") {
    const c = course as ForgeCourse;
    const strikes = c.commissions.reduce((s, x) => s + x.strikes, 0);
    const roars = c.fire.filter((f) => f >= 5).length, lows = c.fire.filter((f) => f <= 3).length;
    lines = [
      { text: `Today: ${c.commissions.length} commissions on Bjorn's board`, font: "body", size: 34, color: "#ffffff", bold: true, gap: 14 },
      { text: `${strikes} blows wanted · the fire ${roars > lows ? "runs hot" : lows > roars ? "runs low" : "keeps steady"} today`, font: "body", size: 30, color: "#cfd8ff", gap: 30 },
      { text: "Heat the iron, strike it true, and don't burn it out.", font: "body", size: 30, color: "#ffb86b", bold: true, gap: 0 },
    ];
  } else if (game === "archery") {
    const c = course as ArcheryCourse;
    const moving = c.targets.filter((t) => t.kind === "hoist" || t.kind === "cart").length;
    const gusty = c.wind.filter((w) => Math.abs(w) >= 3).length;
    const far = Math.round(Math.max(...c.targets.map((t) => Math.max(t.x0, t.x1))));
    lines = [
      { text: `Today: ${c.targets.length} butts out to ${far} m${c.targets.some((t) => t.kind === "king") ? ", the King's butt at the end" : ""}`, font: "body", size: 34, color: "#ffffff", bold: true, gap: 14 },
      { text: `${moving ? `${moving} on the move` : "all standing still"} · ${gusty > 3 ? "a gusty day" : gusty ? "now and then a gust" : "a gentle breeze"}`, font: "body", size: 30, color: "#cfd8ff", gap: 30 },
      { text: "Twenty arrows, one minute. Mind the wind and split the bull.", font: "body", size: 30, color: "#ffb86b", bold: true, gap: 0 },
    ];
  } else if (game === "catch") {
    const c = course as CatchCourse;
    const good = c.drops.filter((d) => d.kind === "apple" || d.kind === "pear" || d.kind === "plum").length;
    const gusty = c.wind.filter((w) => Math.abs(w) >= 3).length;
    lines = [
      { text: `Today: ${good} fruit to catch${c.weekend ? ", it's harvest day" : ""}`, font: "body", size: 36, color: "#ffffff", bold: true, gap: 14 },
      { text: `${c.drops.filter((d) => d.kind === "wasp").length} wasps · ${gusty > 2 ? "a gusty day" : gusty ? "now and then a gust" : "a still day"} · one golden pear`, font: "body", size: 30, color: "#cfd8ff", gap: 30 },
      { text: "A basket that holds ten, one minute. Catch the good ones, dodge the wasps.", font: "body", size: 30, color: "#ffb86b", bold: true, gap: 0 },
    ];
  } else if (game === "loom") {
    const c = course as LoomCourse;
    const backs = c.rows.filter((r) => r.kind === "back").length, golds = c.rows.filter((r) => r.threads.includes(GOLD_THREAD)).length;
    lines = [
      { text: `Today: a ${c.figure.length}-thread figure in ${new Set(c.figure).size} colours, ${c.rows.length} rows`, font: "body", size: 34, color: "#ffffff", bold: true, gap: 14 },
      { text: `${backs} rows "and back again"${golds ? ` · the gold thread runs through ${golds}` : ""}`, font: "body", size: 30, color: "#cfd8ff", gap: 30 },
      { text: "Watch the row, weave it from memory. Ninety seconds, three snags.", font: "body", size: 30, color: "#ffb86b", bold: true, gap: 0 },
    ];
  } else if (game === "derby") {
    const c = course as DerbyCourse, t = DERBY_FISH[c.fish[c.fish.length - 1].key];
    const when = c.weather === "rain" ? { day: "A rainy day", dusk: "Dusk, in the rain", night: "Night, in the rain" }[c.time] : { day: "A bright day", dusk: "Dusk", night: "Night" }[c.time];
    lines = [
      { text: `Today: ${when}`, font: "body", size: 40, color: "#ffffff", bold: true, gap: 14 },
      { text: `${c.fish.length - 1} fish in the pond · the ${t.name} ${t.icon} may surface`, font: "body", size: 30, color: "#cfd8ff", gap: 30 },
      { text: "Cast, strike on the bite, reel without snapping the line. 75 seconds.", font: "body", size: 30, color: "#ffb86b", bold: true, gap: 0 },
    ];
  } else {
    const c = course as HaulCourse;
    const fragile = [...new Set(c.items.filter((k) => HAUL_ITEMS[k].breakSpeed).map((k) => HAUL_ITEMS[k].name.toLowerCase()))];
    lines = [
      { text: `Today: ${c.items.length} things to load`, font: "body", size: 40, color: "#ffffff", bold: true, gap: 14 },
      { text: `Handle with care: ${fragile.join(" and ")} · ${(marketX(c.road) / 1000).toFixed(1)} km to market`, font: "body", size: 30, color: "#cfd8ff", gap: 30 },
      { text: "Stack the cart, then lean it over the bumps. Score what arrives whole.", font: "body", size: 30, color: "#ffb86b", bold: true, gap: 0 },
    ];
  }
  return card(`${game}-course-${day}.png`, pictureSvg(game, course, null), [
    { text: `${g.name} #${number}`, font: "pixel", size: 42, color: GOLD, gap: 26 },
    ...lines,
  ]);
}

/** A run's card: how it ended up, and the score. */
export function arcadeRunPng(run: ArcadeRunView): Promise<Buffer> {
  const g = ARCADE_GAMES[run.game];
  return card(`${run.game}-run-${run.id}.png`, pictureSvg(run.game, run.course, run.inputs), [
    { text: run.name, font: "body", size: 34, color: "#cfd8ff", bold: true, gap: 18 },
    { text: `${g.name} #${run.number}`, font: "pixel", size: 34, color: GOLD, gap: 24 },
    { text: `${run.score.toLocaleString("en-US")} pts`, font: "pixel", size: 56, color: "#ffffff", gap: 26 },
    { text: g.describe(run), font: "body", size: 34, color: "#ffb86b", bold: true, gap: 0 },
  ]);
}
