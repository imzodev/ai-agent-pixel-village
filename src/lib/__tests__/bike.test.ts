// Bicycles: faster than running, sold where players shop, on a free key,
// and drawn the same width in every frame.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { BIKE_ITEM } from "@/lib/bike";
import { RIDE_FRAMES, newBuf, riderSheet } from "@/game/riding";
import { FRAME, ROWS } from "@/game/lpc";
import { stockForNpc } from "@/lib/trade";
import { SETTLEMENT_NPCS } from "@/lib/settlements";
import { DEFAULT_KEY_BINDINGS } from "@/game/input/bindings";
import { BIKE_SPEED_MULT, RUN_SPEED_MULT } from "@/lib/speedGuard";

describe("bikes", () => {
  it("riding beats running", () => {
    expect(BIKE_SPEED_MULT).toBeGreaterThan(RUN_SPEED_MULT);
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
  it("the riding sheet has every direction, and the pedals really turn", () => {
    // A blank character still gets a bike and legs in every frame.
    const sheet = riderSheet(newBuf(576, 512), "#f1c9a5", "female");
    expect(sheet.w).toBe(FRAME * RIDE_FRAMES);
    expect(sheet.h).toBe(FRAME * 4);
    const frame = (row: number, f: number) => {
      const out: number[] = [];
      for (let y = 0; y < FRAME; y++) for (let x = 0; x < FRAME; x++) out.push(sheet.d[((row * FRAME + y) * sheet.w + f * FRAME + x) * 4 + 3]);
      return out.join(",");
    };
    for (const row of Object.values(ROWS)) {
      const frames = Array.from({ length: RIDE_FRAMES }, (_, f) => frame(row, f));
      for (const f of frames) expect(f).toMatch(/255/);
      expect(new Set(frames).size, `row ${row}`).toBeGreaterThan(1); // it animates
    }
  });
});
