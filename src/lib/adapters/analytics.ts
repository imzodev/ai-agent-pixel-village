// Analytics adapter: the services' events. The money funnel (MONEY_EVENTS) is
// kept in our own events table (src/lib/track.ts) for the stats page; the
// rest is only logged in development. Swap in PostHog / Plausible here.

import { track } from "@/lib/track";
import type { AnalyticsPort } from "@/types/ports";
import type { TrackKind } from "@/types/analytics";

const MONEY_EVENTS: ReadonlySet<string> = new Set<TrackKind>(["gem_checkout_started", "gem_purchase_fulfilled", "cosmetic_bought_gems", "cosmetic_bought_coins"]);

/** Flat, short meta values (the events table's shape). */
function flat(props: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 80);
  }
  return out;
}

export class ConsoleAnalyticsAdapter implements AnalyticsPort {
  track(event: string, properties: Record<string, unknown> = {}, userId?: number): void {
    if (MONEY_EVENTS.has(event)) {
      const characterId = typeof properties.characterId === "number" ? properties.characterId : null;
      track(event as TrackKind, characterId, flat(properties));
    }
    if (process.env.NODE_ENV === "production") return;
    console.log(`[analytics] ${event}`, { userId, ...properties });
  }
  identify(userId: number, traits?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "production") return;
    console.log(`[analytics] identify`, { userId, ...traits });
  }
}
