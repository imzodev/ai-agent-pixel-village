// The player's guide (/guide): its tables come from the game's data, and
// name only real people, items and places.
import { describe, expect, it } from "vitest";
import { animalRows, bossRows, buildRows, fishRows, furnitureNames, jobRows, parcelRows, perkRows, repRows, rootkingWhen, saplingRows, townRows, PARCEL_PRICE } from "@/lib/guide";
import { CONTROLS } from "@/lib/controls";
import { formatBinding } from "@/game/input/bindings";
import { FISH_DEFS } from "@/lib/fishing";
import { TOWNS } from "@/lib/settlements";
import { JOB_DEFS } from "@/lib/jobs";

describe("the player's guide", () => {
  it("fills every table, with no empty cells or raw keys", () => {
    for (const rows of [jobRows(), fishRows(), townRows(), saplingRows(), bossRows(), perkRows(), repRows(), animalRows(), parcelRows(), buildRows("barn"), buildRows("workshop")]) {
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) for (const c of r) { expect(c.trim()).not.toBe(""); expect(c).not.toMatch(/\b[a-z]+_[a-z_]+\b/); }
    }
    expect(furnitureNames().every((n) => !n.includes("_"))).toBe(true);
  });
  it("covers everything: every fish, every town, every job's employer", () => {
    expect(fishRows()).toHaveLength(FISH_DEFS.length);
    expect(townRows().flatMap((r) => r[1].split(", "))).toHaveLength(TOWNS.length);
    const employers = jobRows().map((r) => r[1]).join(" ");
    for (const j of JOB_DEFS.filter((d) => /^(village|hollowmere|brightwater)_/.test(d.employerKey))) expect(employers, j.key).toMatch(/\(/);
  });
  it("tells the real rules: parcel price, controls with real keys, the boss's hour", () => {
    expect(PARCEL_PRICE).toBe(2000);
    for (const [c] of CONTROLS) if (c !== "move") expect(formatBinding(c), c).toBeTruthy();
    expect(rootkingWhen("6@18")).toBe("Saturdays at 18:00 UTC");
    expect(rootkingWhen("nonsense")).toBe("once a week");
  });
});
