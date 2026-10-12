// Where a guide arrow points (the tutorial's and the journey's): a world
// position for a target, from what the snapshot shows.
import type { Snapshot } from "@/game/bus";
import { positionAt } from "@/lib/motion";
import { COMMON_FIELD } from "@/lib/commonField";
import type { TutorialTarget } from "@/types/tutorial";

/** World position of a step's target, from what the snapshot shows. */
export function locateTarget(t: TutorialTarget, s: Snapshot): { x: number; y: number; npcId?: number } | null {
  const me = s.me;
  const near = <T extends { x: number; y: number }>(list: T[]): T | null => {
    if (!me || list.length === 0) return list[0] ?? null;
    return list.reduce((a, b) => (Math.hypot(b.x - me.x, b.y - me.y) < Math.hypot(a.x - me.x, a.y - me.y) ? b : a));
  };
  const now = Date.now();
  switch (t.kind) {
    case "point": return { x: t.x, y: t.y };
    case "npc": {
      const n = s.npcs.find((n) => n.key === t.npcKey);
      if (!n) return null;
      const p = n.move ? positionAt(n.move, now) : n;
      return { x: p.x, y: p.y, npcId: n.id };
    }
    case "enemy": {
      const live = s.enemies.filter((e) => e.kind === t.enemyKind && e.hp > 0).map((e) => (e.move ? { ...e, ...positionAt(e.move, now) } : e));
      const e = near(live);
      return e ? { x: e.x, y: e.y } : t.fallback;
    }
    case "freeLand":
    case "freeLot": {
      // Your own lot first, else the nearest unclaimed one.
      const prefix = t.kind === "freeLot" ? t.prefix : "land_";
      const land = s.buildings.filter((b) => b.key.startsWith(prefix));
      const lot = (key: string) => s.lots.find((l) => l.key === key);
      const mine = land.filter((b) => me && lot(b.key)?.owner?.id === me.id);
      const free = land.filter((b) => { const l = lot(b.key); return !l || !l.owner; });
      const b = near((mine.length ? mine : free).map((b) => ({ ...b, x: b.doorX, y: b.doorY })));
      if (b) return { x: b.x, y: b.y };
      // Every field taken: the Common Field (gathering wheat counts too).
      return t.kind === "freeLand" ? { x: (COMMON_FIELD.tx + COMMON_FIELD.w / 2) * 16, y: (COMMON_FIELD.ty + COMMON_FIELD.h) * 16 } : null;
    }
  }
}
