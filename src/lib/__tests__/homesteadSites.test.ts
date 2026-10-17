// Homestead sites: on open land in the heartland, apart from each other and
// from the buildings standing today, each with its lane along the top.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { BLOCK_SIZE, SITES, SITE_TILES, onSiteLane, siteAtTile, siteByKey } from "@/lib/homesteadSites";
import { inHeartland } from "@/lib/continent";
import { terrainWalkable } from "@/lib/regions";
import { ENEMY_ZONES } from "@/lib/progression";
import { WILD_ZONES } from "@/lib/worldmap";

const manifest = JSON.parse(fs.readFileSync("public/buildings/buildings.json", "utf8"));
const standing: { key: string; tx: number; ty: number; row?: string }[] = manifest.buildings.filter((b: { row?: string }) => !b.row || /_0$/.test(b.row));

describe("homestead sites", () => {
  it("has sites, with unique keys, in blocks of BLOCK_SIZE", () => {
    expect(SITES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(SITES.map((s) => s.key)).size).toBe(SITES.length);
    const perBlock = new Map<number, number>();
    for (const s of SITES) perBlock.set(s.block, (perBlock.get(s.block) ?? 0) + 1);
    for (const n of perBlock.values()) expect(n).toBeLessThanOrEqual(BLOCK_SIZE);
    expect(perBlock.has(0)).toBe(true);
  });

  it("puts every site on open heartland, clear of buildings and of each other", () => {
    for (const s of SITES) {
      for (let y = s.ty; y < s.ty + SITE_TILES; y += 3) for (let x = s.tx; x < s.tx + SITE_TILES; x += 3) {
        expect(inHeartland(x, y) && terrainWalkable(x, y), `${s.key} ${x},${y}`).toBe(true);
      }
      for (const b of standing) {
        const hit = b.tx < s.tx + SITE_TILES && b.tx + 24 > s.tx && b.ty < s.ty + SITE_TILES && b.ty + 15 > s.ty - 4;
        expect(hit, `${s.key} / ${b.key}`).toBe(false);
      }
      for (const o of SITES) if (o !== s) expect(o.tx < s.tx + SITE_TILES && o.tx + SITE_TILES > s.tx && o.ty < s.ty + SITE_TILES && o.ty + SITE_TILES > s.ty).toBe(false);
    }
  });

  it("finds a site by tile and key, with its sign on its first parcel and a lane above", () => {
    const s = SITES[0];
    expect(siteAtTile(s.tx + 5, s.ty + 5)?.key).toBe(s.key);
    expect(siteByKey(s.key)).toBe(s);
    expect(siteAtTile(s.sign.tx, s.sign.ty)?.key).toBe(s.key);
    expect(onSiteLane(s.tx + 10, s.ty - 2)).toBe(true);
    expect(onSiteLane(s.tx + 10, s.ty + 2)).toBe(false);
  });
  it("keeps every site safe: no enemy zone reaches one", () => {
    for (const site of SITES) {
      const r = { x: site.tx * 16, y: (site.ty - 4) * 16, w: SITE_TILES * 16, h: (SITE_TILES + 4) * 16 };
      const hit = (z: { x: number; y: number; w: number; h: number }) => z.x < r.x + r.w && r.x < z.x + z.w && z.y < r.y + r.h && r.y < z.y + z.h;
      for (const z of ENEMY_ZONES) expect(hit(z.rect), `${z.name} / ${site.key}`).toBe(false);
      for (const z of WILD_ZONES) expect(hit(z), site.key).toBe(false);
    }
  });
});
