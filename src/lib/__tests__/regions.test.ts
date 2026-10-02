// The generated world west of the village: the road is walkable end to
// end, the river and mountains wall it in, the caverns are connected, and
// the chunk generator is deterministic and agrees with the terrain rules.

import { describe, expect, it } from "vitest";
import { CAVERN_FLOOR, CAVE_MOUTH_TX, REGION_NODES, ROAD, regionAt, terrainAt, terrainWalkable } from "@/lib/regions";
import { defaultChunk } from "@/lib/chunkGen";

/** Blocked tiles of a generated chunk, as the collision loader sees them. */
function blockedInChunk(cx: number, cy: number): Set<string> {
  const out = new Set<string>();
  for (const L of defaultChunk(cx, cy).layers) {
    if (L.name !== "DecorationLower" && L.name !== "Collision") continue;
    L.data.forEach((g, i) => { if (g) out.add(`${cx * 24 + (i % 24)},${-cy * 15 + Math.floor(i / 24)}`); });
  }
  return out;
}
const chunkOf = (tx: number, ty: number) => ({ cx: Math.floor(tx / 24), cy: -Math.floor(ty / 15) });
const blockedCache = new Map<string, Set<string>>();
function blocked(tx: number, ty: number): boolean {
  const { cx, cy } = chunkOf(tx, ty);
  const k = `${cx},${cy}`;
  if (!blockedCache.has(k)) blockedCache.set(k, blockedInChunk(cx, cy));
  return blockedCache.get(k)!.has(`${tx},${ty}`);
}

describe("the King's Road", () => {
  it("is walkable from the village to Brightwater, bridge included", () => {
    for (let tx = ROAD.tx0; tx <= ROAD.tx1; tx++) {
      for (let ty = ROAD.ty0; ty <= ROAD.ty1; ty++) expect(blocked(tx, ty), `${tx},${ty}`).toBe(false);
    }
  });

  it("keeps every region node on open ground", () => {
    for (const n of REGION_NODES) expect(blocked(n.tx, n.ty), `${n.kind} at ${n.tx},${n.ty}`).toBe(false);
  });
});

describe("barriers", () => {
  it("the Silverrun can only be crossed on the bridge", () => {
    for (let ty = -200; ty <= 200; ty++) {
      if (ty >= ROAD.ty0 && ty <= ROAD.ty1) continue;
      // Some tile across the river's width blocks on every other row.
      let wall = false;
      for (let tx = -620; tx <= -606; tx++) if (blocked(tx, ty)) { wall = true; break; }
      expect(wall, `row ${ty}`).toBe(true);
    }
  });

  it("the Greyspine pass is the way through the mountains", () => {
    for (const ty of [-100, -20, 0, 20, 100]) {
      let solid = 0;
      for (let tx = -560; tx <= -400; tx++) if (!terrainWalkable(tx, ty)) solid++;
      expect(solid, `row ${ty}`).toBeGreaterThan(150);
    }
    for (let tx = -576; tx <= -385; tx++) expect(terrainWalkable(tx, 7), `pass at ${tx}`).toBe(true);
  });

  it("leaves the cave mouth to its stamp, in a flat stretch of cliff", () => {
    for (let dx = -2; dx <= 2; dx++) {
      expect(terrainAt(CAVE_MOUTH_TX + dx, 1)).toEqual({ ground: "grass" }); // the stamp draws and blocks it
      expect(terrainWalkable(CAVE_MOUTH_TX + dx, 2)).toBe(true); // standing room in front
    }
    for (const dx of [-5, -4, -3, 3, 4, 5]) expect(terrainAt(CAVE_MOUTH_TX + dx, 1).lower).toBe("cliff_base");
  });
});

describe("caverns", () => {
  it("every room is reachable from the entry hall", () => {
    const start = CAVERN_FLOOR[0];
    const key = (x: number, y: number) => `${x},${y}`;
    const seen = new Set([key(start.tx0 + 2, start.ty0 + 2)]);
    const queue: [number, number][] = [[start.tx0 + 2, start.ty0 + 2]];
    while (queue.length) {
      const [x, y] = queue.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (seen.has(k) || !terrainWalkable(nx, ny)) continue;
        seen.add(k);
        queue.push([nx, ny]);
      }
    }
    for (const r of CAVERN_FLOOR) {
      const cx = Math.round((r.tx0 + r.tx1) / 2), cy = Math.round((r.ty0 + r.ty1) / 2);
      // The room centre or a neighbour (a pillar may sit on the centre).
      const ok = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]].some(([dx, dy]) => seen.has(key(cx + dx, cy + dy)));
      expect(ok, `room at ${cx},${cy}`).toBe(true);
    }
  });
});

describe("generator", () => {
  it("is deterministic and leaves plain chunks as grass", () => {
    expect(defaultChunk(-10, 1)).toEqual(defaultChunk(-10, 1));
    const plain = defaultChunk(10, 10);
    for (const L of plain.layers) if (L.name !== "Ground") expect(L.data.every((g) => g === 0), L.name).toBe(true);
  });

  it("names the regions along the road", () => {
    expect(regionAt(-200 * 16, 7 * 16)?.key).toBe("whisperwood");
    expect(regionAt(-330 * 16, 7 * 16)?.key).toBe("hollowmere");
    expect(regionAt(-700 * 16, 7 * 16)?.key).toBe("brightwater");
    expect(regionAt(100 * 16, 7 * 16)).toBeNull();
  });
});
