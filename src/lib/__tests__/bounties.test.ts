// Bounty boards: what each bounty asks, pays and says, the wanted cap,
// that gather items exist, and that every board stands by its town.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { GATHER, boardPoint, describe as describeBounty, pickKind, rewardFor, targetOf, titleOf, wantedName } from "@/lib/bounties";
import { TOWNS, townAt, townDecorAt } from "@/lib/settlements";
import type { BountyData } from "@/types/bounty";

const SEED_KEYS = new Set([...fs.readFileSync("src/lib/seed.ts", "utf8").matchAll(/\bkey: "([a-z_]+)"/g)].map((m) => m[1]));

describe("bounties", () => {
  const samples: BountyData[] = [
    { kind: "hunt", enemyKind: "wolf", qty: 5 },
    { kind: "gather", itemKey: "wood", qty: 4 },
    { kind: "delivery", toTown: TOWNS[0].key },
    { kind: "explore", x: 0, y: 0, place: "Fernvale" },
    { kind: "wanted", enemyKind: "frostwolf", name: "Old Ironjaw", x: 0, y: 0 },
  ];
  it("have a target, a title, a description and a reward", () => {
    for (const d of samples) {
      expect(targetOf(d)).toBeGreaterThan(0);
      expect(titleOf(d).length).toBeGreaterThan(3);
      expect(describeBounty(d).length).toBeGreaterThan(10);
      const r = rewardFor(d);
      expect(r.coins > 0 && r.xp > 0 && r.rep > 0).toBe(true);
    }
    expect(titleOf(samples[0])).toBe("Cull 5 Grey Wolves");
    expect(titleOf(samples[4])).toBe("WANTED: Old Ironjaw");
    expect(rewardFor(samples[4]).coins).toBeGreaterThan(rewardFor(samples[0]).coins);
  });
  it("post at most one wanted beast per board", () => {
    for (let i = 0; i < 50; i++) expect(pickKind(() => i / 50, true)).not.toBe("wanted");
    expect(new Set(Array.from({ length: 50 }, (_, i) => pickKind(() => i / 50, false))).has("wanted")).toBe(true);
    expect(wantedName(() => 0.5)).toMatch(/^\S+ \S+$/);
  });
  it("only ask for real items", () => {
    for (const items of Object.values(GATHER)) for (const k of items) expect(SEED_KEYS.has(k), k).toBe(true);
    expect(SEED_KEYS.has("parcel")).toBe(true);
  });
  it("each town's board stands in front of its notice board", () => {
    for (const t of TOWNS) {
      const b = boardPoint(t.key)!;
      expect(townAt(Math.floor(b.x / 16), Math.floor(b.y / 16))).toBe(t);
      expect(townDecorAt(t.sq.tx - 4, t.sq.ty + 11)?.lower).toBe("board_bl");
    }
  });
});
