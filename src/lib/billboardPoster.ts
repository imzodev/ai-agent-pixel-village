// Billboard posters: an advertiser's upload, made safe and the right size.
// Every poster is decoded and drawn again as a fresh PNG (POSTER_W × POSTER_H),
// so nothing of the uploaded file survives but its pixels: no metadata (GPS),
// no hidden payload, no SVG or HTML. Stored on disk by content hash.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { POSTER_FILE, POSTER_H, POSTER_W } from "./billboards";
import type { PosterResult } from "@/types/billboard";

/** Largest upload accepted. */
export const POSTER_MAX_BYTES = 2 * 1024 * 1024;

/** Where posters live (outside .cache, which gets cleaned). */
export const posterDir = (): string => process.env.BILLBOARD_DIR || path.join(process.cwd(), ".data", "billboards");

const MAGIC: readonly [string, (b: Buffer) => boolean][] = [
  ["png", (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a],
  ["jpeg", (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["webp", (b) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP"],
];

/** Re-encode an upload as a poster PNG; returns the bytes or why it was refused. */
export async function renderPoster(buf: Buffer): Promise<{ ok: true; png: Buffer } | { ok: false; error: string }> {
  if (buf.length === 0) return { ok: false, error: "Choose an image for the poster." };
  if (buf.length > POSTER_MAX_BYTES) return { ok: false, error: "That image is too big (2 MB at most)." };
  const kind = MAGIC.find(([, test]) => test(buf))?.[0];
  if (!kind) return { ok: false, error: "The poster must be a PNG, JPEG or WebP image." };
  try {
    const img = sharp(buf, { limitInputPixels: 4096 * 4096, failOn: "error", animated: false });
    const meta = await img.metadata();
    if (meta.format !== kind || (meta.pages ?? 1) > 1) return { ok: false, error: "The poster must be a single still PNG, JPEG or WebP image." };
    const png = await img
      .rotate()
      .resize(POSTER_W, POSTER_H, { fit: "cover", position: "attention" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { ok: true, png };
  } catch {
    return { ok: false, error: "That image couldn't be read. Try saving it again as a PNG." };
  }
}

/** Process an upload and store it; the file name is its content hash. */
export async function savePoster(buf: Buffer): Promise<PosterResult> {
  const r = await renderPoster(buf);
  if (!r.ok) return r;
  const file = `${createHash("sha256").update(r.png).digest("hex")}.png`;
  await fs.mkdir(posterDir(), { recursive: true });
  await fs.writeFile(path.join(posterDir(), file), r.png);
  return { ok: true, file };
}

/** A stored poster's bytes, or null (bad name or missing). */
export async function readPoster(file: string): Promise<Buffer | null> {
  if (!POSTER_FILE.test(file)) return null;
  return fs.readFile(path.join(posterDir(), file)).catch(() => null);
}
