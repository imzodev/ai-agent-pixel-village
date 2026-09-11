// Profile OG image. 1200x630 PNG with the character name, level, and a
// pixel-art style border. Generated server-side via sharp — no satori.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { characters, users } from "@/db/schema";
import sharp from "sharp";

export const dynamic = "force-dynamic";

const W = 1200;
const H = 630;

export async function GET(_req: Request, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const [row] = await db
    .select({ user: users, character: characters })
    .from(users)
    .leftJoin(characters, eq(characters.userId, users.id))
    .where(eq(users.username, username))
    .limit(1);
  const c = row?.character;
  const name = c?.name ?? username;
  const level = c?.level ?? 1;
  const coins = c?.coins ?? 0;
  const gems = c?.gems ?? 0;
  const shirtColor = c?.appearance.shirtColor ?? "#4a7c59";
  const hairColor = c?.appearance.hairColor ?? "#3b2a1a";

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="monospace">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0e1830"/>
      <stop offset="100%" stop-color="#1a2238"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="#ffd166" stroke-width="6"/>
  <text x="60" y="120" font-size="56" fill="#ffd166" font-weight="bold">🌳 thegrove</text>
  <text x="60" y="230" font-size="84" fill="#fff" font-weight="bold">${escape(name)}</text>
  <text x="60" y="290" font-size="34" fill="#9aa">@${escape(username)} · lv ${level}</text>
  <g transform="translate(60,360)">
    <rect x="0" y="0" width="320" height="120" fill="#16244a" stroke="#6b8cff" stroke-width="4"/>
    <text x="20" y="48" font-size="28" fill="#9aa">coins</text>
    <text x="20" y="98" font-size="44" fill="#fff" font-weight="bold">${coins} 🪙</text>
  </g>
  <g transform="translate(420,360)">
    <rect x="0" y="0" width="320" height="120" fill="#16244a" stroke="#6b8cff" stroke-width="4"/>
    <text x="20" y="48" font-size="28" fill="#9aa">gems</text>
    <text x="20" y="98" font-size="44" fill="#fff" font-weight="bold">${gems} 💎</text>
  </g>
  <!-- stylized avatar block -->
  <g transform="translate(880,140)">
    <rect x="0" y="0" width="240" height="340" fill="#0e1830" stroke="#6b8cff" stroke-width="6"/>
    <rect x="60" y="40" width="120" height="60" fill="${hairColor}"/>
    <rect x="40" y="100" width="160" height="160" fill="${shirtColor}"/>
    <rect x="80" y="260" width="80" height="60" fill="${hairColor}"/>
    <text x="120" y="200" font-size="34" fill="#fff" text-anchor="middle">${level}</text>
  </g>
</svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
