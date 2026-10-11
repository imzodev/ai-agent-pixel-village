// Shared drawing for the 1200×630 share cards (moments and profiles): a dusk
// sky over a strip of grass inside a gold pixel frame, text in the bundled
// fonts (public/fonts, so every server draws the same), and creature sprite
// frames. Server only (sharp).

import path from "node:path";
import sharp from "sharp";
import { ANIMAL_SPRITES } from "@/game/animalSprites";

export const CARD_W = 1200;
export const CARD_H = 630;
/** Where the ground starts (characters stand on it). */
export const GROUND_Y = 540;

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
const FONTS = {
  pixel: { family: "Press Start 2P", file: path.join(FONT_DIR, "PressStart2P-Regular.ttf") },
  body: { family: "Nunito", file: path.join(FONT_DIR, "Nunito.ttf") },
} as const;

export type CardLayer = { input: Buffer; left: number; top: number };

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A line (or wrapped block) of text as a PNG, in one of the bundled fonts. */
export async function textPng(text: string, opts: { font: keyof typeof FONTS; size: number; color: string; width?: number; bold?: boolean }): Promise<{ input: Buffer; width: number; height: number }> {
  const f = FONTS[opts.font];
  const markup = `<span foreground="${opts.color}"${opts.bold ? ' weight="bold"' : ""}>${esc(text)}</span>`;
  const { data, info } = await sharp({
    text: { text: markup, font: `${f.family} ${opts.size}`, fontfile: f.file, rgba: true, dpi: 72, ...(opts.width ? { width: opts.width, wrap: "word" as const } : {}) },
  }).png().toBuffer({ resolveWithObject: true });
  return { input: data, width: info.width, height: info.height };
}

/** The card's backdrop: sky, stars, distant hills, grass, and the gold frame. */
export function backdropSvg(accent = "#ffd166"): Buffer {
  const stars = Array.from({ length: 42 }, (_, i) => {
    const x = (i * 337 + 91) % CARD_W, y = 30 + ((i * 151) % 300), s = i % 5 === 0 ? 6 : 3;
    return `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#fff6d0" opacity="${0.35 + (i % 4) * 0.15}"/>`;
  }).join("");
  const hills = [0, 1, 2, 3, 4, 5, 6].map((i) => `<ellipse cx="${i * 200 + 60}" cy="${GROUND_Y + 30}" rx="190" ry="${70 + (i % 3) * 25}" fill="#24345a"/>`).join("");
  const grassTufts = Array.from({ length: 60 }, (_, i) => `<rect x="${(i * 97) % CARD_W}" y="${GROUND_Y + 8 + ((i * 13) % 50)}" width="6" height="6" fill="#3e8a3a"/>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#141c3c"/><stop offset="0.6" stop-color="#3a2d5c"/><stop offset="1" stop-color="#7a4a5a"/>
  </linearGradient></defs>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#sky)"/>
  ${stars}${hills}
  <rect y="${GROUND_Y}" width="${CARD_W}" height="${CARD_H - GROUND_Y}" fill="#4f9a3e"/>
  <rect y="${GROUND_Y}" width="${CARD_W}" height="8" fill="#6cbf52"/>
  ${grassTufts}
  <rect x="12" y="12" width="${CARD_W - 24}" height="${CARD_H - 24}" fill="none" stroke="#2a1a10" stroke-width="16"/>
  <rect x="18" y="18" width="${CARD_W - 36}" height="${CARD_H - 36}" fill="none" stroke="${accent}" stroke-width="8"/>
  ${[[18, 18], [CARD_W - 42, 18], [18, CARD_H - 42], [CARD_W - 42, CARD_H - 42]].map(([x, y]) => `<rect x="${x}" y="${y}" width="24" height="24" fill="${accent}"/>`).join("")}
</svg>`);
}

/** A creature's standing frame (facing you), scaled with crisp pixels; null if it has no sprite. */
export async function creaturePng(kind: string, height: number): Promise<{ input: Buffer; width: number; height: number } | null> {
  const def = ANIMAL_SPRITES[kind];
  if (!def) return null;
  const row = Math.max(0, def.dirRows?.indexOf("down") ?? 2);
  try {
    const frame = await sharp(path.join(process.cwd(), "public", def.url))
      .extract({ left: 0, top: row * def.frameHeight, width: def.frameWidth, height: def.frameHeight })
      .trim({ threshold: 0 }).png().toBuffer({ resolveWithObject: true });
    const scale = Math.max(1, Math.floor(height / frame.info.height));
    const out = await sharp(frame.data).resize(frame.info.width * scale, frame.info.height * scale, { kernel: "nearest" }).png().toBuffer({ resolveWithObject: true });
    return { input: out.data, width: out.info.width, height: out.info.height };
  } catch {
    return null;
  }
}

/** Trim a sprite to its pixels (characters have empty space above the head). */
export async function trimmed(png: Buffer): Promise<{ input: Buffer; width: number; height: number }> {
  const t = await sharp(png).trim({ threshold: 0 }).png().toBuffer({ resolveWithObject: true });
  return { input: t.data, width: t.info.width, height: t.info.height };
}

/** The site's address without the scheme, for the card's footer. */
export function siteHost(): string {
  try { return new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").host; } catch { return "thegroove"; }
}

export async function renderCard(layers: CardLayer[], accent?: string): Promise<Buffer> {
  return sharp(backdropSvg(accent)).composite(layers).png().toBuffer();
}
