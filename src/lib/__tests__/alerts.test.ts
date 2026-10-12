import { describe, expect, it } from "vitest";
import { ALERT_THROTTLE_MS, BURST_COUNT, BURST_WINDOW_MS, recordError, shouldSend, webhookBody } from "@/lib/alerts";
import type { AlertState } from "@/types/alerts";

const fresh = (): AlertState => ({ lastSent: {}, errors: [] });

describe("alerts", () => {
  it("sends each kind at most once per throttle window", () => {
    const s = fresh();
    expect(shouldSend(s, "fatal", 0)).toBe(true);
    expect(shouldSend(s, "fatal", 1000)).toBe(false);
    expect(shouldSend(s, "db_down", 1000)).toBe(true); // kinds are separate
    expect(shouldSend(s, "fatal", ALERT_THROTTLE_MS)).toBe(true);
  });

  it("calls it a burst only when enough errors land inside the window", () => {
    const s = fresh();
    for (let i = 0; i < BURST_COUNT - 1; i++) expect(recordError(s, i * 1000)).toBe(false);
    expect(recordError(s, BURST_COUNT * 1000)).toBe(true);
    const spread = fresh();
    const gap = BURST_WINDOW_MS / (BURST_COUNT - 2);
    let burst = false;
    for (let i = 0; i < BURST_COUNT * 3; i++) burst ||= recordError(spread, i * gap);
    expect(burst).toBe(false);
  });

  it("speaks each webhook's format", () => {
    expect(JSON.parse(webhookBody("https://discord.com/api/webhooks/1/abc", "hi").body)).toEqual({ content: "hi" });
    expect(JSON.parse(webhookBody("https://hooks.slack.com/services/x", "hi").body)).toEqual({ text: "hi" });
    expect(webhookBody("https://ntfy.sh/thegroove-alerts", "hi")).toEqual({ body: "hi", contentType: "text/plain" });
  });
});
