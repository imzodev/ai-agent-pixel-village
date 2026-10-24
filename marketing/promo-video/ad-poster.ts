// The sample poster for the billboard promo: "your game here", stored like a
// real upload (src/lib/billboardPoster.ts) so the world draws it in a board's
// window. Prints the stored file name. Run from the repo root:
//   npx tsx --env-file=.env marketing/promo-video/ad-poster.ts
import sharp from "sharp";
import { savePoster } from "../../src/lib/billboardPoster";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="384" height="192">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3a80"/><stop offset="1" stop-color="#141c3c"/></linearGradient></defs>
  <rect width="384" height="192" fill="url(#g)"/>
  <rect x="8" y="8" width="368" height="176" fill="none" stroke="#fcd34d" stroke-width="8" stroke-dasharray="20 10"/>
  <text x="192" y="84" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="48" fill="#fcd34d">YOUR GAME</text>
  <text x="192" y="140" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="44" fill="#fffaf0">HERE ★</text>
  <text x="192" y="172" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="18" fill="#cfd8ff">shop · channel · anything</text>
</svg>`;

// Posters must arrive as PNG/JPEG/WebP, like an upload.
const r = await savePoster(await sharp(Buffer.from(svg)).png().toBuffer());
if (!r.ok) { console.error(r.error); process.exit(1); }
console.log(r.file);
process.exit(0);
