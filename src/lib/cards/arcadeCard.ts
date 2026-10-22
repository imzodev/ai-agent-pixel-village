// The arcade's share pictures (1200×630): a picture of the game on the left,
// the words on the right. A day's course (/<game>/course.png) and a run's
// card (/<game>/r/<id>/card.png), written once to .cache/cards: neither ever
// changes. Whistle's picture is the field with the flock; Harvest Haul's is the
// cart with its load (as it arrived, for a run); Fishing Derby's is the pond with
// its fish (for a run, the catch laid out by the dock).

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
import { ARCADE_GAMES, courseNumber } from "@/lib/arcade/games";
import { courseOf } from "@/lib/arcadeServer";
import { CARD_W, renderCard, siteHost, textPng, type CardLayer } from "./cardKit";
import type { ArcadeGameKey, ArcadeRunView } from "@/types/arcade";
import type { Course, RunState, WhistleInput } from "@/types/whistle";
import type { HaulCourse, HaulInput, HaulState } from "@/types/haul";
import type { DerbyCourse, DerbyInput, DerbyState } from "@/types/derby";

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

/** The left picture for a game, at a state. */
function pictureSvg(game: ArcadeGameKey, course: unknown, inputs: unknown[] | null): string {
  if (game === "whistle") {
    const c = course as Course;
    return whistleSvg(c, inputs ? replay(c, inputs as WhistleInput[]).state : initRun(c));
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
