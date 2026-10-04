// Bicycles: faster than running, sold where players shop, on a free key,
// and drawn the same width in every frame.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { BIKE_ART, BIKE_ITEM, BIKE_SPEED_MULT } from "@/lib/bike";
import { stockForNpc } from "@/lib/trade";
import { SETTLEMENT_NPCS } from "@/lib/settlements";
import { DEFAULT_KEY_BINDINGS } from "@/game/input/bindings";

describe("bikes", () => {
  it("riding beats running", () => {
    const src = fs.readFileSync("src/game/WorldScene.ts", "utf8");
    const run = Number(/RUN_SPEED_MULT = ([\d.]+)/.exec(src)?.[1]);
    expect(BIKE_SPEED_MULT).toBeGreaterThan(run);
  });
  it("is a real item, sold by Pip and every town's shopkeeper", () => {
    expect(fs.readFileSync("src/lib/seed.ts", "utf8")).toContain(`key: "${BIKE_ITEM}"`);
    expect(stockForNpc("shopkeeper").some((t) => t.itemKey === BIKE_ITEM)).toBe(true);
    const shops = SETTLEMENT_NPCS.filter((n) => n.job === "shopkeeper");
    expect(shops.length).toBeGreaterThan(0);
    for (const n of shops) expect(stockForNpc(n.key).some((t) => t.itemKey === BIKE_ITEM), n.key).toBe(true);
  });
  it("V rides, and no key does two things", () => {
    expect(DEFAULT_KEY_BINDINGS.find((b) => b.command === "player.bike")?.keys).toContain("v");
    const keys = DEFAULT_KEY_BINDINGS.flatMap((b) => b.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("every view has two frames of the same size, using only its palette", () => {
    for (const view of ["side", "front", "back"]) {
      const [a, b] = [BIKE_ART[`${view}_0`], BIKE_ART[`${view}_1`]];
      expect(a.rows.length).toBe(b.rows.length);
      const w = a.rows[0].length;
      for (const r of [...a.rows, ...b.rows]) {
        expect(r.length, view).toBe(w);
        for (const c of r) if (c !== ".") expect(a.palette[c], `${view} ${c}`).toBeDefined();
      }
    }
  });
});
