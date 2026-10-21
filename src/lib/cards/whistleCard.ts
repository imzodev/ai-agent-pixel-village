// Whistle's share pictures (1200×630): the course as a little map on the left
// (sheep where the run left them, or at the start), the words on the right.
// The day's course (/whistle/course.png) and a run's card (/whistle/r/<id>/card.png),
// written once to .cache/cards: neither ever changes.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { FIELD_H, FIELD_W, SHEEP_COUNT } from "@/lib/whistle/rules";
import { initRun, replay } from "@/lib/whistle/sim";
import { courseOf } from "@/lib/whistleServer";
import { CARD_W, renderCard, siteHost, textPng, type CardLayer } from "./cardKit";
import type { Course, RunState, WhistleRunView } from "@/types/whistle";

const CACHE = path.join(process.cwd(), ".cache", "cards");
const GOLD = "#ffd166";
const MAP_H = 520, K = MAP_H / FIELD_H, MAP_W = Math.round(FIELD_W * K);
const TEMPLATE_NAME = { meadow: "Hedgerow meadow", river: "River crossing", lanes: "The lanes", pond: "Duck pond" } as const;

/** The field as a picture: grass, pen, water, fences and hedges, dens, the sheep and wolves. */
function mapSvg(course: Course, st: RunState): Buffer {
  const r = (x: number) => (x * K).toFixed(1);
  const rect = (b: { x: number; y: number; w: number; h: number }, fill: string) =>
    `<rect x="${r(b.x)}" y="${r(b.y)}" width="${r(b.w)}" height="${r(b.h)}" fill="${fill}"/>`;
  const parts = [
    `<rect width="${MAP_W}" height="${MAP_H}" fill="#79b04a"/>`,
    rect(course.pen, "#e3cf8f"),
    ...course.water.map((w) => rect(w, "#3d7fb8")),
    ...course.walls.map((w) => rect(w, Math.min(w.w, w.h) <= 6 ? "#6b4226" : "#3f7a2c")),
    ...course.dens.map((d) => `<ellipse cx="${r(d.x)}" cy="${r(d.y + 4)}" rx="${r(10)}" ry="${r(5)}" fill="#2a1e14"/>`),
    ...st.sheep.filter((s) => s.status !== "lost").map((s) => `<circle cx="${r(s.x)}" cy="${r(s.y)}" r="${r(5)}" fill="#fbf7ee" stroke="#4a4a4a" stroke-width="1.5"/>`),
    ...st.wolves.map((w) => `<circle cx="${r(w.x)}" cy="${r(w.y)}" r="${r(6)}" fill="#5a5a66" stroke="#222" stroke-width="1.5"/>`),
  ];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_W}" height="${MAP_H}">${parts.join("")}</svg>`);
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

async function card(file: string, course: Course, st: RunState, lines: { text: string; font: "pixel" | "body"; size: number; color: string; bold?: boolean; gap: number }[]): Promise<Buffer> {
  const out = path.join(CACHE, file);
  try { return fs.readFileSync(out); } catch { /* not drawn yet */ }
  const layers: CardLayer[] = [];
  const map = await sharp(mapSvg(course, st)).png().toBuffer();
  const frame = await sharp({ create: { width: MAP_W + 12, height: MAP_H + 12, channels: 4, background: "#4a2c18" } }).png().toBuffer();
  layers.push({ input: frame, left: 54, top: 49 }, { input: map, left: 60, top: 55 });
  const x = 60 + MAP_W + 60, width = CARD_W - x - 60;
  let y = 80;
  for (const l of lines) {
    const t = await textPng(l.text, { font: l.font, size: l.size, color: l.color, bold: l.bold, width });
    layers.push({ input: t.input, left: x, top: y });
    y += t.height + l.gap;
  }
  const sheep = await sheepPng();
  if (sheep) layers.push({ input: sheep.input, left: CARD_W - 70 - sheep.width, top: 556 - sheep.height });
  const brand = await textPng(`thegroove · ${siteHost()}/whistle`, { font: "body", size: 26, color: "#fff6d0", bold: true });
  layers.push({ input: brand.input, left: x, top: 572 });
  const png = await renderCard(layers);
  try { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(out, png); } catch { /* serve it anyway */ }
  return png;
}

/** The day's course, for "today's course" posts and the page's preview. */
export function whistleCoursePng(day: string): Promise<Buffer> {
  const course = courseOf(day);
  const wolves = course.dens.length;
  return card(`whistle-course-${day}.png`, course, initRun(course), [
    { text: `Whistle #${course.number}`, font: "pixel", size: 46, color: GOLD, gap: 26 },
    { text: `Today: ${TEMPLATE_NAME[course.template]}`, font: "body", size: 40, color: "#ffffff", bold: true, gap: 14 },
    { text: `${SHEEP_COUNT} sheep · ${wolves} wolf${wolves === 1 ? "" : "s"} · 75 seconds`, font: "body", size: 32, color: "#cfd8ff", gap: 30 },
    { text: "Tap to whistle: the sound pushes the flock away. Get them all in the pen.", font: "body", size: 30, color: "#ffb86b", bold: true, gap: 0 },
  ]);
}

/** A run's card: how the field ended up, and the score. */
export function whistleRunPng(run: WhistleRunView): Promise<Buffer> {
  const { state } = replay(run.course, run.inputs);
  return card(`whistle-run-${run.id}.png`, run.course, state, [
    { text: run.name, font: "body", size: 34, color: "#cfd8ff", bold: true, gap: 18 },
    { text: `Whistle #${run.number}`, font: "pixel", size: 34, color: GOLD, gap: 24 },
    { text: `${run.score.toLocaleString("en-US")} pts`, font: "pixel", size: 56, color: "#ffffff", gap: 26 },
    { text: `${run.penned}/${SHEEP_COUNT} sheep penned${run.lost ? ` · ${run.lost} taken by wolves` : ""}`, font: "body", size: 34, color: "#ffb86b", bold: true, gap: 0 },
  ]);
}
