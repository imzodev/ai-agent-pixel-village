// Operator alerts (src/lib/alerts.ts). Types only.

/** What an alert is about; each kind is throttled on its own. */
export type AlertKind = "fatal" | "error_burst" | "db_down";

/** When each kind was last sent, and recent error times (ms). */
export type AlertState = { lastSent: Partial<Record<AlertKind, number>>; errors: number[] };
