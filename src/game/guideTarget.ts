// Where a guide arrow points (the tutorial's and the journey's): a world
// position for a target, from what the snapshot shows.
import type { Snapshot } from "@/game/bus";
import { positionAt } from "@/lib/motion";
import { COMMON_FIELD } from "@/lib/commonField";
import { SITES, siteByKey } from "@/lib/homesteadSites";
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
    case "homestead": {
      // Your homestead first, else the nearest free site in sight; out of
      // sight, the first sites to open (block 0, nearest the village).
      const signOf = (key: string) => { const site = siteByKey(key); return site ? { x: site.sign.tx * 16 + 8, y: site.sign.ty * 16 + 8 } : null; };
      const sites = s.lots.filter((l) => l.kind === "homestead");
      const mine = sites.find((l) => me && l.owner?.id === me.id);
      if (mine) return signOf(mine.key);
      const free = near(sites.filter((l) => !l.owner).flatMap((l) => signOf(l.key) ?? []));
      if (free) return free;
      if (sites.length && t.orCommonField) return { x: (COMMON_FIELD.tx + COMMON_FIELD.w / 2) * 16, y: (COMMON_FIELD.ty + COMMON_FIELD.h) * 16 }; // every one in sight taken
      return near(SITES.filter((x) => x.block === 0).map((x) => ({ x: x.sign.tx * 16 + 8, y: x.sign.ty * 16 + 8 })));
    }
  }
}
