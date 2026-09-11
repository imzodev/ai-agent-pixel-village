// Input adapter. Reads from the virtual joystick + action buttons + keyboard
// and produces an InputState every frame. Pure UI logic — no Phaser imports.

import nipplejs from "nipplejs";
import type { Action, InputState } from "@/types/input";
import { defaultInputState } from "@/types/input";

export type InputSource = {
  getState(): InputState;
  destroy(): void;
};

const DEADZONE = 0.18;
const MAX_DIST = 50; // px from joystick center to max input

export function createInputSource(opts: { onAction: (a: Action) => void; container: HTMLElement }): InputSource {
  const state = defaultInputState();
  const keys = new Set<string>();

  // --- Joystick (left thumb) ---
  const joy = nipplejs.create({
    zone: opts.container,
    mode: "dynamic",
    position: { left: "18%", bottom: "20%" },
    color: "rgba(255,255,255,0.55)",
    size: 110,
    restOpacity: 0.55,
  }) as unknown as { on: (e: string, cb: (...args: unknown[]) => void) => void; destroy: () => void };
  joy.on("move", (...args: unknown[]) => {
    const data = args[1] as { vector?: { x: number; y: number }; distance?: number } | undefined;
    if (!data) return;
    const dx = data.vector?.x ?? 0;
    const dy = data.vector?.y ?? 0;
    const dist = data.distance ?? 0;
    const mag = Math.min(1, dist / MAX_DIST);
    state.axisX = Math.abs(dx) < DEADZONE ? 0 : dx * mag;
    state.axisY = Math.abs(dy) < DEADZONE ? 0 : dy * mag;
  });
  joy.on("end", () => {
    state.axisX = 0;
    state.axisY = 0;
  });

  // --- Action buttons (right thumb) ---
  const buttons: Array<{ el: HTMLButtonElement; action: Action; label: string }> = [];
  for (const [action, label, key] of [
    ["interact", "A", "E"],
    ["bag", "B", "B"],
    ["shop", "S", "Y"],
    ["map", "M", "M"],
  ] as const) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "grove-action-btn";
    el.dataset.action = action;
    el.textContent = label;
    el.setAttribute("aria-label", label);
    // Thumb-reachable right column.
    el.style.position = "absolute";
    el.style.right = action === "interact" ? "8%" : action === "bag" ? "20%" : action === "shop" ? "8%" : "20%";
    el.style.bottom = action === "interact" ? "20%" : action === "bag" ? "12%" : action === "shop" ? "12%" : "20%";
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      state.actions[action] = true;
      opts.onAction(action);
    });
    el.addEventListener("pointerup", () => { state.actions[action] = false; });
    el.addEventListener("pointercancel", () => { state.actions[action] = false; });
    // also support the keyboard fallback so devs can test in a desktop browser
    keys.add(key);
    document.addEventListener("keydown", (e) => {
      if (e.key.toUpperCase() === key) {
        state.actions[action] = true;
        opts.onAction(action);
      }
    });
    document.addEventListener("keyup", (e) => {
      if (e.key.toUpperCase() === key) state.actions[action] = false;
    });
    opts.container.appendChild(el);
    buttons.push({ el, action, label });
  }

  // Detect text input focus (chat, modal) — disables gameplay input.
  const focusCheck = () => {
    const t = document.activeElement;
    state.textFocused = !!(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as HTMLElement).isContentEditable));
  };
  document.addEventListener("focusin", focusCheck);
  document.addEventListener("focusout", focusCheck);

  return {
    getState: () => ({ ...state }),
    destroy() {
      joy.destroy();
      buttons.forEach((b) => b.el.remove());
    },
  };
}
