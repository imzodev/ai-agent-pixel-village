// Posters are redrawn from their pixels: any PNG/JPEG/WebP comes out a clean
// POSTER_W × POSTER_H PNG with no metadata; anything else is refused.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { POSTER_MAX_BYTES, renderPoster } from "@/lib/billboardPoster";
import { POSTER_H, POSTER_W } from "@/lib/billboards";

const base = () => sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 80, b: 40 } } });

describe("renderPoster", () => {
  it.each(["png", "jpeg", "webp"] as const)("redraws a %s as a PNG of the poster size", async (fmt) => {
    const r = await renderPoster(await base().toFormat(fmt).toBuffer());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const meta = await sharp(r.png).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", POSTER_W, POSTER_H]);
    expect(meta.exif).toBeUndefined();
  });

  it("drops a photo's metadata (GPS and all)", async () => {
    const jpg = await base().jpeg().withExif({ IFD0: { Copyright: "secret place" } }).toBuffer();
    expect((await sharp(jpg).metadata()).exif).toBeDefined();
    const r = await renderPoster(jpg);
    expect(r.ok && (await sharp(r.png).metadata()).exif).toBeUndefined();
  });

  it("leaves nothing tacked on after the image", async () => {
    const jpg = Buffer.concat([await base().jpeg().toBuffer(), Buffer.from("<script>alert(1)</script>")]);
    const r = await renderPoster(jpg);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.png.includes(Buffer.from("<script>"))).toBe(false);
  });

  it.each([
    ["an SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')],
    ["HTML named .png", Buffer.from("<html><body>hi</body></html>")],
    ["nothing", Buffer.alloc(0)],
    ["too big", Buffer.alloc(POSTER_MAX_BYTES + 1, 1)],
  ])("refuses %s", async (_, buf) => {
    expect((await renderPoster(buf)).ok).toBe(false);
  });

  it("refuses a GIF and a truncated PNG", async () => {
    expect((await renderPoster(await base().gif().toBuffer())).ok).toBe(false);
    const png = await base().png().toBuffer();
    expect((await renderPoster(png.subarray(0, 60))).ok).toBe(false);
  });
});
