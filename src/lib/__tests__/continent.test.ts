// The open continent: the heartland stays exactly as hand-tuned, the
// generator is deterministic, every biome shows up, and the edge is sea.
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { terrainAt } from "@/lib/regions";
import { CONTINENT, HEARTLAND, PROVINCES, biomeAt, continentAt, elevation, inHeartland } from "@/lib/continent";
import { ROADS, TOWNS } from "@/lib/settlements";
import { CAVE_EXIT_TILE, regionAt } from "@/lib/regions";
import { nearRoad } from "@/lib/settlements";
import type { Biome } from "@/types/continent";

describe("heartland", () => {
  it("is unchanged by the continent (fingerprint of the hand-made terrain)", () => {
    // Recorded from the terrain before the continent existed, leaving out
    // tiles near the roads out to the continent's towns (they cut through
    // on purpose). If the road, its towns, the village or the fields change
    // on purpose, re-record it.
    const h = crypto.createHash("sha1");
    const seen = new Set<string>();
    for (const b of HEARTLAND) for (let ty = b.ty0; ty <= b.ty1; ty++) for (let tx = b.tx0; tx <= b.tx1; tx += 3) {
      const k = `${tx},${ty}`;
      if (seen.has(k) || nearRoad(tx, ty, 4)) continue;
      seen.add(k);
      h.update(k + JSON.stringify(terrainAt(tx, ty)));
    }
    expect(h.digest("hex")).toBe("b0ac93fe39223a48f9ea36d7bc7dc76294f3f1dc");
  });
  it("edges follow the tree lattice (odd west/north, even east/south)", () => {
    for (const b of HEARTLAND) {
      expect(Math.abs(b.tx0 % 2)).toBe(1);
      expect(Math.abs(b.ty0 % 2)).toBe(1);
      expect(b.tx1 % 2).toBe(0);
      expect(b.ty1 % 2).toBe(0);
    }
    expect(inHeartland(0, 7)).toBe(true);
    expect(inHeartland(-300, -200)).toBe(false);
  });
});

describe("continent", () => {
  it("is deterministic", () => {
    for (const [x, y] of [[-300, -200], [100, 300], [-900, 0]]) expect(continentAt(x, y)).toEqual(continentAt(x, y));
  });
  it("is ringed by sea and has every land biome", () => {
    expect(elevation(CONTINENT.tx0, 0)).toBeLessThan(0.3);
    expect(biomeAt(CONTINENT.tx1 + 50, 0)).toBe("ocean");
    const found = new Set<Biome>();
    for (let y = CONTINENT.ty0; y <= CONTINENT.ty1; y += 9) for (let x = CONTINENT.tx0; x <= CONTINENT.tx1; x += 9) if (!inHeartland(x, y)) found.add(biomeAt(x, y));
    for (const b of ["ocean", "beach", "meadow", "forest", "darkwood", "swamp", "desert", "badlands", "snow", "snowpeak", "peak"] as Biome[]) expect(found.has(b), b).toBe(true);
  });
  it("open sea blocks; the Silverrun reaches the south coast", () => {
    expect(continentAt(CONTINENT.tx1 + 20, 0).collide).toBe(true);
    const river = continentAt(-613, 200);
    expect(river.ground.startsWith("water_")).toBe(true);
  });
});

describe("shores and ground edges", () => {
  // A coarse sweep over the whole continent's tiles.
  const cells: { tx: number; ty: number; ground: string }[] = [];
  for (let ty = CONTINENT.ty0; ty <= CONTINENT.ty1; ty += 2) for (let tx = CONTINENT.tx0; tx <= CONTINENT.tx1; tx += 2) {
    if (!inHeartland(tx, ty)) cells.push({ tx, ty, ground: continentAt(tx, ty).ground });
  }
  it("every ground tile the continent asks for exists in the tileset", async () => {
    const { names } = (await import("@/lib/terrain/wildsTiles.json")).default as { names: string[] };
    const have = new Set(names);
    const missing = [...new Set(cells.map((c) => c.ground))].filter((g) => !have.has(g));
    expect(missing).toEqual([]);
  });
  it("shores show the land they meet: no grass-and-sand bank beside swamp, beach or snow", () => {
    const grassy = cells.filter((c) => /^water_\d+$/.test(c.ground));
    for (const c of grassy) {
      // A plain (grass) shore only where every dry corner is grass ground.
      const wm = Number(c.ground.slice("water_".length));
      const dry = ([[c.tx, c.ty, 1], [c.tx + 1, c.ty, 2], [c.tx, c.ty + 1, 4], [c.tx + 1, c.ty + 1, 8]] as const).filter(([, , bit]) => !(wm & bit)).map(([x, y]) => biomeAt(x, y));
      for (const b of dry) expect(["meadow", "forest", "peak"], `${c.tx},${c.ty} ${c.ground}`).toContain(b);
    }
    expect(cells.some((c) => c.ground.startsWith("water_mud_"))).toBe(true);
    expect(cells.some((c) => c.ground.startsWith("water_sand_"))).toBe(true);
  });
  it("swamp pools fade into the river; grounds meet each other, not a strip of grass", () => {
    expect(cells.some((c) => c.ground.startsWith("swamp_mix_"))).toBe(true);
    expect(cells.some((c) => /^\w+_on_\w+_\d+$/.test(c.ground))).toBe(true);
  });
});

describe("the bigger world (10× the area)", () => {
  it("is about ten times the old 1,200 × 750 continent", () => {
    const area = (CONTINENT.tx1 - CONTINENT.tx0 + 1) * (CONTINENT.ty1 - CONTINENT.ty0 + 1);
    expect(area / (1200 * 750)).toBeGreaterThan(9.5);
    expect(area / (1200 * 750)).toBeLessThan(10.5);
  });
  it("keeps every town and its road on open land", () => {
    for (const t of TOWNS) {
      for (const [x, y] of [[t.sq.tx + 12, t.sq.ty + 7], [t.box.tx0, t.box.ty0], [t.box.tx1, t.box.ty1]]) {
        expect(elevation(x, y), `${t.name} at ${x},${y}`).toBeGreaterThan(0.33);
        expect(elevation(x, y), `${t.name} at ${x},${y}`).toBeLessThan(0.78);
      }
    }
    for (const road of ROADS) for (let i = 0; i < road.length; i += 10) {
      const [x, y] = road[i];
      if (!inHeartland(x, y)) expect(continentAt(x, y).collide ?? false, `road ${x},${y}`).toBe(false);
    }
  });
  it("names about fifty provinces, all different", () => {
    expect(PROVINCES.length).toBeGreaterThan(40);
    expect(new Set(PROVINCES.map((p) => p.name)).size).toBe(PROVINCES.length);
    expect(new Set(PROVINCES.map((p) => p.key)).size).toBe(PROVINCES.length);
  });
  it("puts the caverns under the sea north of the coast, and leaves their old spot to the overworld", () => {
    expect(CAVE_EXIT_TILE.ty).toBeLessThan(CONTINENT.ty0 - 100);
    expect(regionAt(-470 * 16, -450 * 16)?.key).not.toBe("caverns");
    expect(regionAt(CAVE_EXIT_TILE.tx * 16, CAVE_EXIT_TILE.ty * 16)?.key).toBe("caverns");
  });
});
