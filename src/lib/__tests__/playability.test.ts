// Launch playability: the journey after the tutorial, key hints for the
// device in hand, danger levels, the daily streak and the boss countdown.
import { describe, expect, it } from "vitest";
import { JOURNEY } from "@/lib/journey";
import { NPC_DEFS } from "@/lib/npcDefs";
import { deviceKeys, TOUCH_KEYS } from "@/lib/keyHints";
import { TOUCH_BUTTONS, TOUCH_LABEL } from "@/game/input/touchButtons";
import { dangerNotice, suggestedLevel } from "@/lib/danger";
import { nextStreak, streakReward } from "@/lib/streak";
import { countdownText } from "@/lib/countdown";
import { TUTORIAL_STEPS } from "@/lib/tutorial";

const npcKeys = new Set(NPC_DEFS.map((n) => n.key));

describe("the journey", () => {
  it("is a ladder of unique goals that point at real villagers and pay more as they go", () => {
    expect(JOURNEY.length).toBeGreaterThanOrEqual(10);
    expect(new Set(JOURNEY.map((g) => g.key)).size).toBe(JOURNEY.length);
    for (const g of JOURNEY) {
      if (g.target?.kind === "npc") expect(npcKeys.has(g.target.npcKey), `${g.key} → ${g.target.npcKey}`).toBe(true);
      expect(g.reward.coins > 0 && g.reward.xp > 0, g.key).toBe(true);
    }
    expect(JOURNEY.at(-1)!.reward.xp).toBeGreaterThan(JOURNEY[0].reward.xp);
  });
});

describe("key hints", () => {
  it("name the touch buttons on a phone and keep the keys on a keyboard", () => {
    expect(TOUCH_KEYS.E).toBe("A");
    expect(TOUCH_KEYS.J).toBe("⚔");
    // Three buttons: dodge and the bike share B (held for the bike), fishing is A.
    expect(TOUCH_KEYS.K).toBe("B");
    expect(TOUCH_KEYS.V).toBe("hold B");
    expect(TOUCH_KEYS.R).toBe("A");
    const labels = new Set(TOUCH_BUTTONS.map((b) => b.label));
    for (const v of Object.values(TOUCH_LABEL)) expect(labels.has(v!.replace(/^hold /, "")) || v === "push the stick", v).toBe(true);
    expect(deviceKeys("Talk (E), then attack (J).", true)).toBe("Talk (A), then attack (⚔).");
    expect(deviceKeys("Talk (E), then attack (J).", false)).toBe("Talk (E), then attack (J).");
    for (const s of TUTORIAL_STEPS) expect(deviceKeys(s.hint, true), s.title).not.toMatch(/\((E|J)\)/);
  });
});

describe("danger levels", () => {
  it("warn when the land gets harder than the player, not when it gets easier", () => {
    expect(suggestedLevel(1)).toBe(1);
    expect(suggestedLevel(8)).toBe(30);
    expect(dangerNotice(4, 2, 3)?.kind).toBe("bad");
    expect(dangerNotice(4, 2, 3)?.text).toContain("level 12+");
    expect(dangerNotice(4, 3, 20)?.kind).toBe("info");
    expect(dangerNotice(2, 4, 1)).toBeNull(); // heading home
    expect(dangerNotice(2, 1, 1)).toBeNull(); // the heartland's edge isn't worth a warning
  });
});

describe("the daily streak", () => {
  const s = (current: number, last: string | null, grace: string | null = null) => ({ current, lastCompletedOn: last, graceUsedOn: grace });
  it("grows day by day, forgives one missed day a month, and starts over otherwise", () => {
    expect(nextStreak(s(4, "2026-10-11"), "2026-10-12")).toMatchObject({ current: 5, changed: true });
    expect(nextStreak(s(4, "2026-10-12"), "2026-10-12")).toMatchObject({ current: 4, changed: false });
    expect(nextStreak(s(4, "2026-10-10"), "2026-10-12")).toMatchObject({ current: 5, graceUsedOn: "2026-10" });
    expect(nextStreak(s(4, "2026-10-10", "2026-10"), "2026-10-12")).toMatchObject({ current: 1 });
    expect(nextStreak(s(9, "2026-10-01"), "2026-10-12")).toMatchObject({ current: 1 });
    expect(nextStreak(s(0, null), "2026-10-12")).toMatchObject({ current: 1 });
  });
  it("pays on day 3 and every 7th day", () => {
    expect(streakReward(3)).toEqual({ coins: 50, gems: 0 });
    expect(streakReward(7)).toEqual({ coins: 0, gems: 10 });
    expect(streakReward(14)).toEqual({ coins: 0, gems: 10 });
    expect(streakReward(5)).toBeNull();
  });
});

describe("countdowns", () => {
  it("read in a word or two", () => {
    expect(countdownText((2 * 24 + 4) * 3600_000)).toBe("2d 4h");
    expect(countdownText((3 * 60 + 12) * 60_000)).toBe("3h 12m");
    expect(countdownText(8 * 60_000)).toBe("8m");
    expect(countdownText(-5)).toBe("0m");
  });
});
