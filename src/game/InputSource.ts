// Touch input adapter: one stick and three buttons, the handheld layout.
// The arrow pad (left thumb) writes the movement axis to the router, and
// pushing it all the way out runs. On the right thumb's side, A acts on
// whatever is in front of you, ⚔ attacks (held: keeps swinging) and B goes
// back (or rolls); held, B gets you on or off the bike. No keyboard code
// lives here — keyboard is its own adapter (domKeyboard.ts) so the two
// paths stay independent and testable.
//
// The controls sit in a container with pointer-events: none (taps between
// them reach the game), so every control that takes touches turns them back
// on for itself.

import type { InputRouter } from "./input/router";
import { BIKE_HOLD_MS, TOUCH_BUTTONS } from "./input/touchButtons";
import { dpadAxis, dpadRuns } from "./input/dpad";
import { bus } from "./bus";

export type InputSource = {
  getAxis(): { x: number; y: number };
  destroy(): void;
};

/** Arrow cells in the pad's 3×3 grid (row, column). */
const ARROWS = [
  { row: 1, col: 2, label: "▲", aria: "Walk up", x: 0, y: -1 },
  { row: 2, col: 1, label: "◀", aria: "Walk left", x: -1, y: 0 },
  { row: 2, col: 3, label: "▶", aria: "Walk right", x: 1, y: 0 },
  { row: 3, col: 2, label: "▼", aria: "Walk down", x: 0, y: 1 },
] as const;

/** No follow-up click when the finger lifts: a button that opened a window
 *  (the farm, a shop) would otherwise have the browser's click land on the
 *  window's backdrop under the finger and close it straight away. Only
 *  cancelling touchend stops that click; preventDefault on pointerdown doesn't. */
const noGhostClick = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };

export function createInputSource(opts: {
  router: InputRouter;
  container: HTMLElement;
}): InputSource {
  // --- Arrow pad (left thumb) ---
  // One element takes the whole touch: press an arrow and slide between
  // them without lifting (pointer capture keeps the pad receiving moves).
  // Pushed out past RUN_FRACTION of the pad's radius, you run.
  const pad = document.createElement("div");
  pad.className = "grove-dpad";
  pad.setAttribute("role", "group");
  pad.setAttribute("aria-label", "Movement: push all the way to run");
  const arrowEls = ARROWS.map((a) => {
    const el = document.createElement("div");
    el.className = "grove-dpad-arrow";
    el.textContent = a.label;
    el.setAttribute("aria-label", a.aria);
    el.style.gridRow = String(a.row);
    el.style.gridColumn = String(a.col);
    pad.appendChild(el);
    return el;
  });
  let padPointer: number | null = null;
  const steer = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const axis = dpadAxis(dx, dy);
    const moving = axis.x !== 0 || axis.y !== 0;
    const running = moving && dpadRuns(dx, dy, Math.min(r.width, r.height) / 2);
    opts.router.setVirtualAxis(axis.x, axis.y);
    opts.router.setHeld("move.run", running);
    pad.classList.toggle("running", running);
    ARROWS.forEach((a, i) => arrowEls[i].classList.toggle("active", a.x === axis.x && a.y === axis.y && moving));
  };
  const release = () => {
    padPointer = null;
    opts.router.setVirtualAxis(0, 0);
    opts.router.setHeld("move.run", false);
    pad.classList.remove("running");
    for (const el of arrowEls) el.classList.remove("active");
  };
  pad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    padPointer = e.pointerId;
    pad.setPointerCapture(e.pointerId);
    steer(e);
  });
  pad.addEventListener("pointermove", (e) => { if (e.pointerId === padPointer) steer(e); });
  pad.addEventListener("pointerup", (e) => { if (e.pointerId === padPointer) release(); });
  pad.addEventListener("pointercancel", (e) => { if (e.pointerId === padPointer) release(); });
  opts.container.appendChild(pad);

  // Presses on the touch controls stay there: Phaser listens on the window
  // for presses outside its canvas and would select whatever is under a
  // button or the stick. (Listeners on this element itself still run.)
  const keepOffCanvas = (e: Event) => e.stopPropagation();
  opts.container.addEventListener("touchstart", keepOffCanvas);
  opts.container.addEventListener("mousedown", keepOffCanvas);

  // --- Action buttons (right thumb) ---
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const unsubs: (() => void)[] = [];
  for (const b of TOUCH_BUTTONS) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `grove-action-btn${b.size === "big" ? " grove-big" : ""}`;
    el.dataset.command = b.id;
    el.textContent = b.label;
    el.setAttribute("aria-label", b.ariaLabel);
    el.style.position = "absolute";
    el.style.right = b.right;
    el.style.bottom = b.bottom;
    el.addEventListener("touchend", noGhostClick);
    if (b.hold) {
      // Held while the finger is down (pointer capture keeps the release ours).
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); opts.router.setHeld(b.id, true); });
      const up = () => opts.router.setHeld(b.id, false);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("lostpointercapture", up);
    } else if (b.longPress) {
      // A tap fires on release; held for BIKE_HOLD_MS, the long-press command
      // fires instead (while still held) and the release does nothing.
      const long = b.longPress;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let fired = false;
      const clear = () => { if (timer) { clearTimeout(timer); timers.delete(timer); timer = null; } el.classList.remove("charging"); };
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        fired = false;
        el.classList.add("charging");
        timer = setTimeout(() => { fired = true; clear(); opts.router.trigger(long); }, BIKE_HOLD_MS);
        timers.add(timer);
      });
      el.addEventListener("pointerup", () => { const tap = !fired; clear(); if (tap) opts.router.trigger(b.id); });
      el.addEventListener("pointercancel", clear);
      if (long === "player.bike") {
        // A little 🚲 on B while you own a bike, so the long-press can be found.
        const badge = document.createElement("span");
        badge.className = "grove-btn-badge";
        badge.textContent = "🚲";
        badge.hidden = true;
        el.appendChild(badge);
        unsubs.push(bus.on("hasBike", (has) => { badge.hidden = !has; }));
      }
    } else {
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        opts.router.trigger(b.id);
      });
    }
    opts.container.appendChild(el);
  }

  return {
    getAxis: () => ({ x: 0, y: 0 }),
    destroy() {
      release();
      for (const t of timers) clearTimeout(t);
      for (const u of unsubs) u();
      for (const b of TOUCH_BUTTONS) if (b.hold) opts.router.setHeld(b.id, false);
      pad.remove();
      opts.container.removeEventListener("touchstart", keepOffCanvas);
      opts.container.removeEventListener("mousedown", keepOffCanvas);
      opts.container.querySelectorAll(".grove-action-btn").forEach((el) => el.remove());
    },
  };
}
