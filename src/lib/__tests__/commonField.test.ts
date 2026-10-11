// The Common Field: its art, its wheat and Hollis line up, on open ground,
// away from the enemies (the north woods and the Rootking moved above it).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import LAYOUT from "@/lib/commonField.json";
import { COMMON_FIELD, COMMON_FIELD_STAMPS, commonFieldWheat } from "@/lib/commonField";
import { inHeartland } from "@/lib/continent";
import { terrainWalkable } from "@/lib/regions";
import { BOSS_SPOT, ENEMY_ZONES } from "@/lib/progression";
import { NORTH_WOODS, WILD_ZONES, tilePoint } from "@/lib/worldmap";
import { npcDef } from "@/lib/npcDefs";
import type { Rect } from "@/lib/worldmap";

const manifest = JSON.parse(fs.readFileSync("public/buildings/buildings.json", "utf8"));
const entries: { key: string; tx: number; ty: number; file: string }[] = Array.isArray(manifest) ? manifest : manifest.buildings;
const blockedIn = new Map<string, number[]>();
const blocked = (tx: number, ty: number): boolean => {
  const s = COMMON_FIELD_STAMPS.find((st) => tx >= st.tx && tx < st.tx + 24 && ty >= st.ty && ty < st.ty + 15)!;
  if (!blockedIn.has(s.file)) {
    const t = JSON.parse(fs.readFileSync(`public${s.file}`, "utf8"));
    blockedIn.set(s.file, t.layers.find((l: { name: string }) => l.name === "Collision").data);
  }
  return blockedIn.get(s.file)![(ty - s.ty) * 24 + (tx - s.tx)] === 1;
};
const inRect = (p: { x: number; y: number }, r: Rect) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const FIELD_PX: Rect = { x: COMMON_FIELD.tx * 16, y: COMMON_FIELD.ty * 16, w: COMMON_FIELD.w * 16, h: COMMON_FIELD.h * 16 };

describe("the Common Field", () => {
  it("is 120×60 tiles of stamps, each in the buildings manifest", () => {
    expect([COMMON_FIELD.w, COMMON_FIELD.h]).toEqual([120, 60]);
    expect(COMMON_FIELD_STAMPS).toHaveLength(20);
    const covered = new Set<string>();
    for (const s of COMMON_FIELD_STAMPS) {
      expect(entries.find((e) => e.key === s.key)).toMatchObject({ tx: s.tx, ty: s.ty, file: s.file });
      for (let r = 0; r < 15; r++) for (let c = 0; c < 24; c++) covered.add(`${s.tx + c},${s.ty + r}`);
    }
    expect(covered.size).toBe(120 * 60);
    expect(covered.has(`${COMMON_FIELD.tx},${COMMON_FIELD.ty}`) && covered.has(`${COMMON_FIELD.tx + 119},${COMMON_FIELD.ty + 59}`)).toBe(true);
  });

  it("is cleared land: heartland all the way, walkable inside the fence", () => {
    const { top, bottom, left, right } = LAYOUT.fence;
    for (let r = top + 1; r < bottom; r += 3) for (let c = left + 1; c < right; c += 3) {
      const tx = COMMON_FIELD.tx + c, ty = COMMON_FIELD.ty + r;
      expect(inHeartland(tx, ty), `${tx},${ty}`).toBe(true);
      expect(terrainWalkable(tx, ty), `${tx},${ty}`).toBe(true);
    }
  });

  it("grows its wheat inside the fence, never on a fence, bale or sign", () => {
    const wheat = commonFieldWheat();
    expect(wheat.length).toBeGreaterThan(900);
    for (const [tx, ty] of wheat) {
      const c = tx - COMMON_FIELD.tx, r = ty - COMMON_FIELD.ty;
      expect(c > LAYOUT.fence.left && c < LAYOUT.fence.right && r > LAYOUT.fence.top && r < LAYOUT.fence.bottom, `${tx},${ty}`).toBe(true);
      expect(blocked(tx, ty), `blocked at ${tx},${ty}`).toBe(false);
    }
  });

  it("keeps enemies off the field and Hollis, and the Rootking in the north woods", () => {
    for (const z of ENEMY_ZONES) expect(overlaps(z.rect, FIELD_PX), z.name).toBe(false);
    for (const z of WILD_ZONES) expect(overlaps(z, FIELD_PX)).toBe(false);
    const hollis = npcDef("village_hollis")!;
    const home = tilePoint(hollis.tilePos[0], hollis.tilePos[1]);
    for (const z of ENEMY_ZONES) expect(inRect(home, z.rect), z.name).toBe(false);
    expect(terrainWalkable(hollis.tilePos[0], hollis.tilePos[1])).toBe(true);
    expect(inRect(BOSS_SPOT, NORTH_WOODS)).toBe(true);
    expect(inRect(BOSS_SPOT, FIELD_PX)).toBe(false);
    expect(terrainWalkable(Math.floor(BOSS_SPOT.x / 16), Math.floor(BOSS_SPOT.y / 16))).toBe(true);
  });
});
