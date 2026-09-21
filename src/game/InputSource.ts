// Touch input adapter. The joystick writes its vector to the router;
// each on-screen button triggers a router command. No keyboard code lives
// here — keyboard is its own adapter (domKeyboard.ts) so the two paths
// stay independent and testable.

import nipplejs from "nipplejs";
import type { InputRouter } from "./input/router";
import { TOUCH_BUTTONS } from "./input/touchButtons";

export type InputSource = {
  getAxis(): { x: number; y: number };
  destroy(): void;
};

const DEADZONE = 0.18;
const MAX_DIST = 50;

export function createInputSource(opts: {
  router: InputRouter;
  container: HTMLElement;
}): InputSource {
  // --- Joystick (left thumb) ---
  const joy = nipplejs.create({
    zone: opts.container,
    mode: "dynamic",
    position: { left: "18%", bottom: "20%" },
    color: "rgba(255,255,255,0.55)",
    size: 110,
    restOpacity: 0.55,
  }) as unknown as {
    on: (e: string, cb: (...args: unknown[]) => void) => void;
    destroy: () => void;
  };
  joy.on("move", (...args: unknown[]) => {
    const data = args[1] as { vector?: { x: number; y: number }; distance?: number } | undefined;
    if (!data) return;
    const dx = data.vector?.x ?? 0;
    const dy = data.vector?.y ?? 0;
    const dist = data.distance ?? 0;
    const mag = Math.min(1, dist / MAX_DIST);
    opts.router.setVirtualAxis(
      Math.abs(dx) < DEADZONE ? 0 : dx * mag,
      Math.abs(dy) < DEADZONE ? 0 : dy * mag,
    );
  });
  joy.on("end", () => opts.router.setVirtualAxis(0, 0));

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
      joy.destroy();
      opts.container.querySelectorAll(".grove-action-btn").forEach((el) => el.remove());
    },
  };
}
