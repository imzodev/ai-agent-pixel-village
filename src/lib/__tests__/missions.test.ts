// The village's missions point at villagers that exist, and repeatable ones
// rest before they're offered again.
import { describe, expect, it } from "vitest";
import { MISSION_DEFS } from "@/lib/missionDefs";
import { NPC_DEFS } from "@/lib/npcDefs";
import { REPEAT_COOLDOWN_MS, canTake } from "@/lib/missionRules";

const keys = new Set(NPC_DEFS.map((n) => n.key));

describe("missions", () => {
  it("are given by, and send you to, villagers who exist", () => {
    for (const m of MISSION_DEFS) {
      expect(keys.has(m.npc), `${m.key} giver ${m.npc}`).toBe(true);
      if (m.requirement.type === "talk") expect(keys.has(m.requirement.npcKey), `${m.key} → ${m.requirement.npcKey}`).toBe(true);
    }
  });
  it("have unique keys", () => {
    expect(new Set(MISSION_DEFS.map((m) => m.key)).size).toBe(MISSION_DEFS.length);
  });
  it("offers a repeatable mission again only after it has rested", () => {
    const now = Date.UTC(2026, 9, 12, 12);
    expect(canTake({ repeatable: false }, null, now)).toBe(true);
    expect(canTake({ repeatable: false }, new Date(now - 10 * REPEAT_COOLDOWN_MS), now)).toBe(false);
    expect(canTake({ repeatable: true }, new Date(now - REPEAT_COOLDOWN_MS + 60_000), now)).toBe(false);
    expect(canTake({ repeatable: true }, new Date(now - REPEAT_COOLDOWN_MS), now)).toBe(true);
  });
});
