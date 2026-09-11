// Console analytics adapter (default). Swap with PostHog / Plausible in the
// composition root when ready.

import type { AnalyticsPort } from "@/types/ports";

export class ConsoleAnalyticsAdapter implements AnalyticsPort {
  track(event: string, properties?: Record<string, unknown>, userId?: number): void {
    if (process.env.NODE_ENV === "production") {
      // keep logs quiet in prod — wire a real provider here.
      return;
    }
    console.log(`[analytics] ${event}`, { userId, ...properties });
  }
  identify(userId: number, traits?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "production") return;
    console.log(`[analytics] identify`, { userId, ...traits });
  }
}
