// Which billboards a player has really seen (src/lib/billboards.ts): a view
// counts after IMPRESSION_DWELL_MS within IMPRESSION_RANGE_PX of the board,
// at most once per poster every IMPRESSION_REPEAT_MS. Pure; the scene feeds
// it once a second and sends what it collects in batches
// (/api/billboards/events).

export const IMPRESSION_RANGE_PX = 160;
export const IMPRESSION_DWELL_MS = 2_000;
export const IMPRESSION_REPEAT_MS = 30 * 60_000;
export const IMPRESSION_BATCH = 20;

export class ImpressionTracker {
  /** When each poster in range came into range (cleared when it leaves). */
  private since = new Map<number, number>();
  /** When each poster was last counted. */
  private counted = new Map<number, number>();
  private queue: number[] = [];

  /** The posters near the player now (rental id and where the board is). */
  observe(boards: readonly { rentalId: number; x: number; y: number }[], me: { x: number; y: number }, now: number): void {
    const inRange = new Set<number>();
    for (const b of boards) {
      if (Math.hypot(b.x - me.x, b.y - me.y) > IMPRESSION_RANGE_PX) continue;
      inRange.add(b.rentalId);
      const from = this.since.get(b.rentalId);
      if (from === undefined) { this.since.set(b.rentalId, now); continue; }
      const last = this.counted.get(b.rentalId);
      if (now - from >= IMPRESSION_DWELL_MS && (last === undefined || now - last >= IMPRESSION_REPEAT_MS)) {
        this.counted.set(b.rentalId, now);
        if (!this.queue.includes(b.rentalId)) this.queue.push(b.rentalId);
      }
    }
    for (const id of [...this.since.keys()]) if (!inRange.has(id)) this.since.delete(id);
  }

  /** The views to send (at most a batch), removed from the queue. */
  drain(): number[] {
    return this.queue.splice(0, IMPRESSION_BATCH);
  }
}
