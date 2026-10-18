// Jobs: who hires, what a day's shift is and pays, ranks, being let go, the
// three-job limit, couriers' routes, guards' ground and escorts' pay.
import { describe, expect, it } from "vitest";
import {
  ESCORT_SHARE, FIRE_AFTER_DAYS, JOB_DEFS, MAX_JOBS, RANK_AT, REHIRE_MS, dayKey, daysBetween, escortEarned, flatWage, hireBlock, inGuardArea,
  jobDef, letGo, letterPay, letterRecipients, nextStreak, pickRecipients, rankFor, shiftNeed, shiftPay, supplyPay, toNextRank,
} from "@/lib/jobs";
import { npcDef } from "@/lib/npcDefs";
import { isGoods } from "@/lib/economy";
import { ITEM_DEFS } from "@/lib/itemDefs";
import { SHOP_STOCK, TRADES } from "@/lib/trade";
import { DEAR_DISCOUNT } from "@/lib/economy";
import { PROFILE_OF } from "@/lib/mind/profiles";
import { townOfNpc } from "@/lib/reputation";

describe("the jobs on offer", () => {
  it("every employer is a real NPC, and suppliers ask for real goods", () => {
    for (const j of JOB_DEFS) {
      expect(npcDef(j.employerKey), j.key).toBeTruthy();
      if (j.shift.kind === "supply") for (const k of j.shift.items) expect(isGoods(k), `${j.key}: ${k}`).toBe(true);
    }
    expect(new Set(JOB_DEFS.map((j) => j.key)).size).toBe(JOB_DEFS.length);
    expect(jobDef("supply_village_hollis")?.shift).toMatchObject({ kind: "supply", items: ["wheat"], qty: 20 });
    expect(JOB_DEFS.some((j) => j.kind === "courier") && JOB_DEFS.some((j) => j.kind === "guard") && JOB_DEFS.some((j) => j.kind === "escort")).toBe(true);
    expect(ITEM_DEFS.find((i) => i.key === "letter")?.value).toBe(0); // can't be sold
  });
  it("suppliers are paid more than selling the goods, but never more than buying them", () => {
    const shopMin = (k: string) => Math.min(...Object.entries(SHOP_STOCK).flatMap(([npc, st]) => st.filter((t) => t.itemKey === k).map((t) => {
      const unit = t.price / t.qty;
      return PROFILE_OF[npc] ? Math.ceil(unit * (1 - DEAR_DISCOUNT)) : townOfNpc(npc) ? Math.max(1, Math.round(unit * 0.85)) : unit;
    })));
    for (const j of JOB_DEFS) {
      if (j.shift.kind !== "supply") continue;
      for (const k of j.shift.items) {
        const unit = supplyPay(k, 10) / 10;
        const market = Math.max(...Object.values(TRADES).flatMap((l) => l.filter((t) => t.itemKey === k).map((t) => t.price)));
        expect(unit, `${j.key}: ${k} beats the market`).toBeGreaterThan(market);
        expect(unit, `${j.key}: ${k} under the shops`).toBeLessThan(shopMin(k));
      }
    }
  });
  it("a day's shift pays a steady, modest wage that grows with rank", () => {
    for (const j of JOB_DEFS) {
      const pay = [0, 1, 2].map((r) => shiftPay(j, r));
      expect(pay[0], j.key).toBeGreaterThanOrEqual(40);
      expect(pay[2], j.key).toBeLessThanOrEqual(260);
      expect(pay[2], j.key).toBeGreaterThan(pay[0]);
    }
    expect(flatWage("supplier", 2)).toBeGreaterThan(flatWage("supplier", 0));
    expect(shiftNeed(jobDef("supply_village_hollis")!.shift, 2)).toBeGreaterThan(shiftNeed(jobDef("supply_village_hollis")!.shift, 0));
  });
});

describe("ranks, days and being let go", () => {
  it("promotes at 5 and 15 shifts", () => {
    expect(RANK_AT).toEqual([0, 5, 15]);
    expect([0, 4, 5, 14, 15, 99].map(rankFor)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(toNextRank(3)).toBe(2);
    expect(toNextRank(20)).toBeNull();
  });
  it("counts days in UTC, keeps streaks and lets go after missed days", () => {
    expect(dayKey(Date.UTC(2026, 9, 18, 23, 59))).toBe("2026-10-18");
    expect(daysBetween("2026-10-18", "2026-10-21")).toBe(3);
    expect(nextStreak("2026-10-17", 4, "2026-10-18")).toBe(5);
    expect(nextStreak("2026-10-15", 4, "2026-10-18")).toBe(1);
    expect(nextStreak("2026-10-18", 4, "2026-10-18")).toBe(4);
    // last shift on the 18th: the 19th–21st missed is FIRE_AFTER_DAYS; let go on the 22nd
    expect(FIRE_AFTER_DAYS).toBe(3);
    expect(letGo("2026-10-18", "2026-10-01", "2026-10-21")).toBe(false);
    expect(letGo("2026-10-18", "2026-10-01", "2026-10-22")).toBe(true);
    // hired and never worked
    expect(letGo(null, "2026-10-18", "2026-10-20")).toBe(false);
    expect(letGo(null, "2026-10-18", "2026-10-21")).toBe(true);
  });
  it("three jobs at most, one per employer, the level asked, and a day before going back", () => {
    const now = 1e12, hollis = jobDef("supply_village_hollis")!, courier = jobDef("courier_post")!, escort = jobDef("escort_caravan")!;
    expect(hireBlock(hollis, { level: 5, activeKeys: [], endedAt: null, now })).toBe("");
    expect(hireBlock(hollis, { level: 5, activeKeys: ["supply_village_hollis"], endedAt: null, now })).toMatch(/already/);
    expect(hireBlock(courier, { level: 5, activeKeys: ["a", "b", "c"].slice(0, MAX_JOBS), endedAt: null, now })).toMatch(/3 jobs/);
    expect(hireBlock(escort, { level: 1, activeKeys: [], endedAt: null, now })).toMatch(/level/);
    expect(hireBlock(hollis, { level: 5, activeKeys: [], endedAt: now - REHIRE_MS + 1, now })).toMatch(/tomorrow/);
    expect(hireBlock(hollis, { level: 5, activeKeys: [], endedAt: now - REHIRE_MS, now })).toBe("");
  });
});

describe("couriers, guards and escorts", () => {
  it("letters go farther as you rise, to real NPCs, never twice in a day, never to the moving caravan", () => {
    const r0 = letterRecipients("village_hettie", 0), r1 = letterRecipients("village_hettie", 1), r2 = letterRecipients("village_hettie", 2);
    expect(r0.every((k) => k.startsWith("village_") || k.startsWith("hollowmere_"))).toBe(true);
    expect(r1.some((k) => k.startsWith("brightwater_"))).toBe(true);
    expect(r2.length).toBeGreaterThan(r1.length);
    for (const r of [r0, r1, r2]) expect(r.includes("village_tamsin") || r.includes("village_hettie")).toBe(false);
    const today = pickRecipients(7, "2026-10-18", "village_hettie", 0, 3);
    expect(new Set(today).size).toBe(3);
    expect(today.every((k) => npcDef(k))).toBe(true);
    expect(pickRecipients(7, "2026-10-18", "village_hettie", 0, 3)).toEqual(today); // the same all day
    expect(pickRecipients(7, "2026-10-19", "village_hettie", 0, 3)).not.toEqual(today);
    expect(letterPay({ tx: 0, ty: 0 }, { tx: 400, ty: 0 }, 0)).toBeGreaterThan(letterPay({ tx: 0, ty: 0 }, { tx: 20, ty: 0 }, 0));
    expect(letterPay({ tx: 0, ty: 0 }, { tx: 400, ty: 0 }, 2)).toBeGreaterThan(letterPay({ tx: 0, ty: 0 }, { tx: 400, ty: 0 }, 0));
  });
  it("a guard's kills count only near their town", () => {
    const s = jobDef("guard_hollowmere_sorrel")!.shift;
    if (s.kind !== "guard") throw new Error("not a guard job");
    expect(inGuardArea(s, s.tx * 16, s.ty * 16)).toBe(true);
    expect(inGuardArea(s, (s.tx + s.radius + 5) * 16, s.ty * 16)).toBe(false);
    expect(inGuardArea(jobDef("courier_post")!.shift, s.tx * 16, s.ty * 16)).toBe(false);
  });
  it("an escort is paid for riding along most of the way and being there at the end", () => {
    expect(escortEarned(4, 5, true)).toBe(true);
    expect(escortEarned(2, 5, true)).toBe(2 / 5 >= ESCORT_SHARE);
    expect(escortEarned(5, 5, false)).toBe(false);
    expect(escortEarned(0, 0, true)).toBe(false);
  });
});
