// Shop displays: lined up with their building and rack, showing goods the
// shop really sells, one piece per unit (or per bundle).
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { SHOP_DISPLAYS, fullCounts, piecesFor } from "@/lib/shopDisplay";
import { DISPLAY_SPRITES } from "@/game/shopDisplay";
import { profileFor } from "@/lib/mind/profiles";
import { SHOP_STOCK } from "@/lib/trade";

const manifest = JSON.parse(fs.readFileSync("public/buildings/buildings.json", "utf8")) as { buildings: { key: string; tx: number; ty: number }[] };

describe("shop displays", () => {
  it("sit on their building, with goods the shop sells", () => {
    for (const d of SHOP_DISPLAYS) {
      const b = manifest.buildings.find((x) => x.key === d.key)!;
      expect(b, d.key).toBeDefined();
      expect([d.buildingTx, d.buildingTy]).toEqual([b.tx, b.ty]);
      const shelf = profileFor(d.npcKey)?.shelf ?? {};
      const sold = new Set((SHOP_STOCK[d.npcKey] ?? []).map((t) => t.itemKey));
      for (const s of d.slots) {
        expect(shelf[s.itemKey], `${d.npcKey} shelf ${s.itemKey}`).toBeDefined();
        expect(sold.has(s.itemKey), `${d.npcKey} sells ${s.itemKey}`).toBe(true);
        expect(DISPLAY_SPRITES[s.sprite], s.sprite).toBeDefined();
        for (const [x, y] of s.at) { // on the rack (template x 52–106, beam 170 – shelf 197)
          const w = Math.max(...DISPLAY_SPRITES[s.sprite].rows.map((r) => r.length)), h = DISPLAY_SPRITES[s.sprite].rows.length;
          expect(x).toBeGreaterThanOrEqual(55);
          expect(x + w).toBeLessThanOrEqual(104);
          expect(y).toBeGreaterThan(170);
          expect(y + h).toBeLessThanOrEqual(197);
        }
      }
    }
  });
  it("show one piece per unit or bundle, capped by the rack", () => {
    const slot = { per: 10, at: [[0, 0], [0, 0], [0, 0]] };
    expect([0, 1, 10, 11, 25, 200].map((n) => piecesFor(slot, n))).toEqual([0, 1, 1, 2, 3, 3]);
    expect(piecesFor({ per: 1, at: [[0, 0]] }, 4)).toBe(1);
    expect(fullCounts(SHOP_DISPLAYS[0])).toEqual({ axe: 3, stone_sword: 3, arrow: 3 });
  });
});
