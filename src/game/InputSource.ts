// Touch input adapter. The arrow pad (left thumb) writes the movement axis
// to the router; on the right thumb's side, the run button toggles running
// and each action button triggers a router command. No keyboard code lives
// here — keyboard is its own adapter (domKeyboard.ts) so the two paths
// stay independent and testable.
//
// The controls sit in a container with pointer-events: none (taps between
// them reach the game), so every control that takes touches turns them back
// on for itself.

import type { InputRouter } from "./input/router";
import { RUN_BUTTON, TOUCH_BUTTONS } from "./input/touchButtons";
import { dpadAxis } from "./input/dpad";

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

export function createInputSource(opts: {
  router: InputRouter;
  container: HTMLElement;
}): InputSource {
  // --- Arrow pad (left thumb) ---
  // One element takes the whole touch: press an arrow and slide between
  // them without lifting (pointer capture keeps the pad receiving moves).
  const pad = document.createElement("div");
  pad.className = "grove-dpad";
  pad.setAttribute("role", "group");
  pad.setAttribute("aria-label", "Movement");
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
    const axis = dpadAxis(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    opts.router.setVirtualAxis(axis.x, axis.y);
    ARROWS.forEach((a, i) => arrowEls[i].classList.toggle("active", a.x === axis.x && a.y === axis.y && (axis.x !== 0 || axis.y !== 0)));
  };
  const release = () => {
    padPointer = null;
    opts.router.setVirtualAxis(0, 0);
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

  // Run: a toggle for the right thumb (the left one is on the arrows), on
  // top of the action buttons. Tap to run, tap again to walk.
  let running = false;
  const run = document.createElement("button");
  run.type = "button";
  run.className = "grove-action-btn grove-run-btn";
  run.textContent = "🏃";
  run.setAttribute("aria-label", "Run");
  run.setAttribute("aria-pressed", "false");
  run.style.position = "absolute";
  run.style.right = RUN_BUTTON.right;
  run.style.bottom = RUN_BUTTON.bottom;
  run.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    running = !running;
    opts.router.setHeld("move.run", running);
    run.classList.toggle("active", running);
    run.setAttribute("aria-pressed", String(running));
  });
  opts.container.appendChild(run);

  // Presses on the touch controls stay there: Phaser listens on the window
  // for presses outside its canvas and would select whatever is under a
  // button or the stick. (Listeners on this element itself still run.)
  const keepOffCanvas = (e: Event) => e.stopPropagation();
  opts.container.addEventListener("touchstart", keepOffCanvas);
  opts.container.addEventListener("mousedown", keepOffCanvas);

  // --- Action buttons (right thumb) ---
  for (const b of TOUCH_BUTTONS) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "grove-action-btn";
    el.dataset.command = b.id;
    el.textContent = b.label;
    el.setAttribute("aria-label", b.ariaLabel);
    el.style.position = "absolute";
    el.style.right = b.right;
    el.style.bottom = b.bottom;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      opts.router.trigger(b.id);
    });
    opts.container.appendChild(el);
  }

  return {
    getAxis: () => ({ x: 0, y: 0 }),
    destroy() {
      release();
      opts.router.setHeld("move.run", false);
      pad.remove();
      run.remove();
      opts.container.removeEventListener("touchstart", keepOffCanvas);
      opts.container.removeEventListener("mousedown", keepOffCanvas);
      opts.container.querySelectorAll(".grove-action-btn").forEach((el) => el.remove());
    },
  };
}
