// Notification rules: repeats merge, stacks are capped, expiry is tracked.
import { describe, expect, it } from "vitest";
import { GAIN_MS, MAX_GAINS, MAX_TOASTS, TOAST_MS, nextExpiry, pushGains, pushToast, sweep } from "./notifications";
import type { GainItem, ToastItem } from "@/types/notifications";

describe("notifications", () => {
  it("the same toast twice is one toast ×2, kept up longer", () => {
    let l: ToastItem[] = pushToast([], { text: "Too far." , kind: "bad" }, 0);
    l = pushToast(l, { text: "Too far.", kind: "bad" }, 1000);
    expect(l.length).toBe(1);
    expect(l[0].count).toBe(2);
    expect(l[0].until).toBe(1000 + TOAST_MS);
    l = pushToast(l, { text: "Too far.", kind: "info" }, 1000); // a different kind is its own toast
    expect(l.length).toBe(2);
  });
  it("a burst keeps only the newest few toasts", () => {
    let l: ToastItem[] = [];
    for (let i = 0; i < 10; i++) l = pushToast(l, { text: `n${i}` }, 0);
    expect(l.length).toBe(MAX_TOASTS);
    expect(l.at(-1)?.text).toBe("n9");
  });
  it("gains of the same item add up; the stack is capped", () => {
    let g: GainItem[] = pushGains([], [{ itemKey: "wood", qty: 1 }, { itemKey: "wood", qty: 2 }, { itemKey: "berry", qty: 1 }], 0);
    expect(g.map((x) => [x.itemKey, x.qty])).toEqual([["wood", 3], ["berry", 1]]);
    g = pushGains(g, Array.from({ length: 9 }, (_, i) => ({ itemKey: `k${i}`, qty: 1 })), 10);
    expect(g.length).toBe(MAX_GAINS);
    expect(g[0].until).toBe(10 + GAIN_MS);
  });
  it("sweeps expired ones and knows when to wake next", () => {
    const l: ToastItem[] = [pushToast([], { text: "a" }, 0)[0], pushToast([], { text: "b" }, 2000)[0]];
    expect(sweep(l, TOAST_MS).map((x) => x.text)).toEqual(["b"]);
    expect(sweep(l, 1)).toBe(l); // nothing expired: the same list, no re-render
    expect(nextExpiry(l, [])).toBe(TOAST_MS);
    expect(nextExpiry([], [])).toBeNull();
  });
});
