// Tell a human when production breaks. With ALERT_WEBHOOK_URL set (a Discord
// or Slack incoming webhook, or an ntfy.sh topic URL), the server and tickd
// post there on a crash, on a burst of errors, and when the database is
// unreachable. Each kind is sent at most once per ALERT_THROTTLE_MS, so a bad
// minute never floods the channel. Without the env var nothing is sent.

import os from "node:os";
import type { AlertKind, AlertState } from "@/types/alerts";

export const ALERT_THROTTLE_MS = 10 * 60_000;
/** An error burst: this many errors within the window. */
export const BURST_COUNT = 20;
export const BURST_WINDOW_MS = 5 * 60_000;

const state: AlertState = { lastSent: {}, errors: [] };

/** True when `kind` may be sent now (and records it). */
export function shouldSend(s: AlertState, kind: AlertKind, now: number): boolean {
  const last = s.lastSent[kind];
  if (last !== undefined && now - last < ALERT_THROTTLE_MS) return false;
  s.lastSent[kind] = now;
  return true;
}

/** Records an error; true when it makes a burst. */
export function recordError(s: AlertState, now: number): boolean {
  s.errors.push(now);
  while (s.errors.length && now - s.errors[0] > BURST_WINDOW_MS) s.errors.shift();
  return s.errors.length >= BURST_COUNT;
}

/** The request body for the webhook's kind of service. */
export function webhookBody(url: string, text: string): { body: string; contentType: string } {
  if (/discord(app)?\.com\/api\/webhooks/.test(url)) return { body: JSON.stringify({ content: text }), contentType: "application/json" };
  if (/hooks\.slack\.com/.test(url)) return { body: JSON.stringify({ text }), contentType: "application/json" };
  return { body: text, contentType: "text/plain" }; // ntfy and anything else that takes plain text
}

/** Sends an alert unless it was sent recently. Never throws. */
export async function sendAlert(kind: AlertKind, text: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url || !shouldSend(state, kind, Date.now())) return;
  const who = `${process.env.SERVICE_NAME ?? "ai-village"}@${os.hostname()}`;
  const { body, contentType } = webhookBody(url, `🚨 thegroove ${kind.replace("_", " ")} (${who}): ${text}`.slice(0, 1800));
  try {
    await fetch(url, { method: "POST", headers: { "content-type": contentType }, body, signal: AbortSignal.timeout(5000) });
  } catch {
    // An alert that can't be sent must not cause more errors.
  }
}

/** Counts an error; posts once the errors make a burst. */
export function noteError(message: string): void {
  if (!process.env.ALERT_WEBHOOK_URL) return;
  if (recordError(state, Date.now())) void sendAlert("error_burst", `${state.errors.length} errors in ${BURST_WINDOW_MS / 60_000} min. Latest: ${message}`);
}
