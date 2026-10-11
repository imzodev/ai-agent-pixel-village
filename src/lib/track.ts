// Self-hosted analytics: record what players do (signups, daily play, the
// tutorial, shares) in our own database, read back by /api/admin/stats.
// Never throws and never slows a request down: tracking is best effort.

import { db } from "@/db";
import { activeDays, events } from "@/db/schema";
import type { TrackKind } from "@/types/analytics";

/** Record an event. Fire and forget. */
export function track(kind: TrackKind, characterId?: number | null, meta: Record<string, string | number | boolean> = {}): void {
  void db.insert(events).values({ kind, characterId: characterId ?? null, meta }).catch((e) => console.warn("[track]", e instanceof Error ? e.message : e));
}

const marked = new Set<string>();
/** This character played today (once per day per process; the table dedupes the rest). */
export function markActive(characterId: number, nowMs = Date.now()): void {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const key = `${characterId}:${day}`;
  if (marked.has(key)) return;
  if (marked.size > 50_000) marked.clear();
  marked.add(key);
  void db.insert(activeDays).values({ characterId, day }).onConflictDoNothing().catch((e) => console.warn("[track]", e instanceof Error ? e.message : e));
}
