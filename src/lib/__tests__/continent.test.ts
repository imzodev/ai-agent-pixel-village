// The open continent: the heartland stays exactly as hand-tuned, the
// generator is deterministic, every biome shows up, and the edge is sea.
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { terrainAt } from "@/lib/regions";
import { CONTINENT, HEARTLAND, biomeAt, continentAt, elevation, inHeartland } from "@/lib/continent";
import type { Biome } from "@/types/continent";

describe("heartland", () => {
  it("is unchanged by the continent (fingerprint of the hand-made terrain)", () => {
    // Recorded from the terrain before the continent existed; if the road,
    // its towns, the village or the fields change on purpose, re-record it.
    const h = crypto.createHash("sha1");
    const seen = new Set<string>();
    for (const b of HEARTLAND) for (let ty = b.ty0; ty <= b.ty1; ty++) for (let tx = b.tx0; tx <= b.tx1; tx += 3) {
      const k = `${tx},${ty}`;
      if (seen.has(k)) continue;
      seen.add(k);
      h.update(k + JSON.stringify(terrainAt(tx, ty)));
    }
    expect(h.digest("hex")).toBe("5b61847f8b305841ed197ceb067831f4bdba3d46");
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
