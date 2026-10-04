// Fresh batches: when one is due, what's left, and where the loaves sit.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { BAKE_INTERVAL_MS, BATCH_LOAVES, BREAD_REACH_PX, BREAD_TABLES, batchDue, loavesLeft, tableByKey, tablePoint } from "@/lib/bakery";
import { loafSlots } from "@/game/breadTable";
import { npcDef } from "@/lib/npcDefs";

describe("bread tables", () => {
  it("a batch is due at first and then every interval", () => {
    expect(batchDue(null, 0)).toBe(true);
    expect(batchDue(1000, 1000 + BAKE_INTERVAL_MS - 1)).toBe(false);
    expect(batchDue(1000, 1000 + BAKE_INTERVAL_MS)).toBe(true);
  });
  it("counts the loaves left", () => {
    expect(loavesLeft(null)).toBe(0);
    expect(loavesLeft({ qty: BATCH_LOAVES, taken: 3 })).toBe(BATCH_LOAVES - 3);
    expect(loavesLeft({ qty: 2, taken: 5 })).toBe(0);
  });
  it("every table has a real baker and sits in front of its bakery", () => {
    const manifest = JSON.parse(fs.readFileSync("public/buildings/buildings.json", "utf8")) as { buildings: { key: string; tx: number; ty: number }[] };
    for (const t of BREAD_TABLES) {
      expect(npcDef(t.bakerKey), t.bakerKey).toBeDefined();
      const b = manifest.buildings.find((x) => x.key === t.key)!;
      expect(b, t.key).toBeDefined();
      expect(t.tx - b.tx).toBe(10); // template cols 10–11, row 13 (scripts/draw-trade-buildings.mjs)
      expect(t.ty - b.ty).toBe(13);
      expect(tableByKey(t.key)).toBe(t);
    }
  });
  it("lays a full batch out on the table, in reach of where you stand", () => {
    const t = BREAD_TABLES[0];
    const slots = loafSlots(t);
    expect(slots).toHaveLength(BATCH_LOAVES);
    const at = tablePoint(t);
    for (const s of slots) {
      expect(s.x).toBeGreaterThanOrEqual(t.tx * 16);
      expect(s.x + 8).toBeLessThanOrEqual((t.tx + 2) * 16);
      expect(Math.hypot(s.x - at.x, s.y - at.y)).toBeLessThan(BREAD_REACH_PX);
    }
  });
});
