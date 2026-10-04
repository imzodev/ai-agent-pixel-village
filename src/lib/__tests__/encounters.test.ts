// Random encounters: every kind is complete, ambushes only where it's
// dangerous, and a helped merchant sells real goods.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { ENCOUNTERS, ENCOUNTER_PITY_BEATS, MERCHANT_STOCK, attackersFor, encounterNpcKey, isMerchantKey, pickEncounter, rollsEncounter } from "@/lib/encounters";
import { stockForNpc } from "@/lib/trade";
import type { EncounterKind } from "@/types/encounter";

const SEED_KEYS = new Set([...fs.readFileSync("src/lib/seed.ts", "utf8").matchAll(/\bkey: "([a-z_]+)"/g)].map((m) => m[1]));

describe("encounters", () => {
  it("every kind has a call, thanks and a reward; needs are real items", () => {
    for (const [k, d] of Object.entries(ENCOUNTERS)) {
      expect(d.call.length, k).toBeGreaterThan(5);
      expect(d.thanks.length, k).toBeGreaterThan(5);
      expect(d.reward.coins > 0 && d.reward.xp > 0 && d.reward.rep > 0, k).toBe(true);
      for (const item of d.need?.itemKeys ?? []) expect(SEED_KEYS.has(item), item).toBe(true);
    }
    expect(ENCOUNTERS.ambush.stranger).toBeNull();
    expect(ENCOUNTERS.beset.need).toBeNull();
  });
  it("no ambushes where it's safe", () => {
    const seen = (tier: number) => new Set(Array.from({ length: 100 }, (_, i) => pickEncounter(tier, () => i / 100)));
    expect(seen(1).has("ambush")).toBe(false);
    expect(seen(3).has("ambush")).toBe(true);
    for (const k of ["beset", "merchant", "hunter", "lost_child"] as EncounterKind[]) expect(seen(1).has(k), k).toBe(true);
  });
  it("a helped merchant sells real goods", () => {
    const key = encounterNpcKey("merchant", 42);
    expect(isMerchantKey(key)).toBe(true);
    expect(isMerchantKey(encounterNpcKey("hunter", 42))).toBe(false);
    expect(stockForNpc(key).map((t) => t.itemKey)).toEqual(MERCHANT_STOCK.map((t) => t.itemKey));
    for (const t of MERCHANT_STOCK) expect(SEED_KEYS.has(t.itemKey), t.itemKey).toBe(true);
  });
  it("random, but never too long a wait", () => {
    expect(rollsEncounter(1, () => 0.99)).toBe(false);
    expect(rollsEncounter(1, () => 0)).toBe(true);
    expect(rollsEncounter(ENCOUNTER_PITY_BEATS, () => 0.99)).toBe(true);
  });
  it("bigger groups face more beasts, within reason", () => {
    expect(attackersFor(3, 1)).toBe(3);
    expect(attackersFor(3, 3)).toBe(5);
    expect(attackersFor(3, 40)).toBe(7);
  });
});
