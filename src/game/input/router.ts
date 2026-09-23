// Input command router. Holds command registrations, held-set, virtual
// (touch) axis, and focus state. Owns no DOM and no Phaser — adapters
// feed it via trigger/setHeld/setTextFocused, handlers register commands
// via register(), and the scene polls axis()/isHeld().
//
// Modal keymaps (a LIFO stack) let a menu rebind the keyboard for its
// own context — e.g. the trade modal can bind `Enter` to "sell 1" and
// `Escape` to close, while the global `B` (bag) is silently captured.
// The topmost keymap wins; unmapped keys still fall through to global.

import type {
  BindingMode,
  CommandId,
  CommandScope,
  InputCommand,
} from "@/types/input";
import { axisFromHeld } from "./axis";

export type KeyBinding = {
  readonly keys: readonly string[];
  readonly command: CommandId;
  readonly mode: BindingMode;
};

export type ModalKeymap = {
  /** Debug label shown in dev tools. */
  readonly label: string;
  /** Bindings active while this keymap is on top. */
  readonly bindings: readonly KeyBinding[];
  /** Command handlers invoked by `trigger` / `setHeld` for this keymap. */
  readonly handlers: readonly InputCommand[];
};

export type InputRouter = {
  /** Register a command handler in the GLOBAL handler map. Returns a disposer. */
  register(cmd: InputCommand): () => void;
  /**
   * Set the global key bindings (the default layer). Replaces any prior
   * global bindings. The router looks these up only when no modal
   * keymap matches the pressed key.
   */
  setGlobalBindings(bindings: readonly KeyBinding[]): void;
  /**
   * Push a modal keymap onto the stack. The topmost keymap's bindings
   * and handlers take priority over the global ones. Returns a disposer
   * that pops the keymap (safe to call multiple times).
   */
  pushKeymap(km: ModalKeymap): () => void;
  /** True if any modal keymap is active. */
  isModalOpen(): boolean;
  /** Look up the command + mode bound to a normalised key, modal-first. */
  lookup(key: string): { command: CommandId; mode: BindingMode } | null;
  /** Programmatic press (touch button, gamepad). Routed through the
   *  same modal-first dispatch path. */
  trigger(id: CommandId): void;
  /** Update the held-set for a hold-mode command (modal-first). */
  setHeld(id: CommandId, held: boolean): void;
  /** True while the command is held. */
  isHeld(id: CommandId): boolean;
  /** Current movement axis (virtual joystick takes priority over keys). */
  axis(): { x: number; y: number };
  /** Touch joystick reports its normalized vector here. */
  setVirtualAxis(x: number, y: number): void;
  /** Set focus state (router's DOM adapter owns this; tests can set it). */
  setTextFocused(focused: boolean): void;
  /** Drop all state and handlers (for tests). */
  dispose(): void;
};

export function createInputRouter(): InputRouter {
  const globalHandlers = new Map<CommandId, InputCommand>();
  let globalBindings: ReadonlyArray<KeyBinding> = [];
  const globalBindingIndex = new Map<string, { command: CommandId; mode: BindingMode }>();
  const held = new Set<CommandId>();
  let virtualAxis: { x: number; y: number } = { x: 0, y: 0 };
  let textFocused = false;
  const keymapStack: ModalKeymap[] = [];

  function findCommand(id: CommandId): { cmd: InputCommand; scope: CommandScope } | null {
    // Modal keymap handlers take priority over global.
    for (let i = keymapStack.length - 1; i >= 0; i--) {
      const h = keymapStack[i].handlers.find((c) => c.id === id);
      if (h) return { cmd: h, scope: h.scope };
    }
    const g = globalHandlers.get(id);
    return g ? { cmd: g, scope: g.scope } : null;
  }

  function dispatch(id: CommandId): void {
    const found = findCommand(id);
    if (!found) return;
    if (found.scope === "gameplay" && textFocused) return;
    if (found.scope === "gameplay" && keymapStack.length > 0) return;
    found.cmd.run();
  }

  return {
    register(cmd) {
      globalHandlers.set(cmd.id, cmd);
      return () => {
        if (globalHandlers.get(cmd.id) === cmd) globalHandlers.delete(cmd.id);
        held.delete(cmd.id);
      };
    },
    setGlobalBindings(bindings) {
      globalBindings = bindings;
      globalBindingIndex.clear();
      for (const b of bindings) {
        for (const k of b.keys) globalBindingIndex.set(k, { command: b.command, mode: b.mode });
      }
    },
    pushKeymap(km) {
      keymapStack.push(km);
      let alive = true;
      return () => {
        if (!alive) return;
        alive = false;
        const i = keymapStack.indexOf(km);
        if (i >= 0) keymapStack.splice(i, 1);
      };
    },
    isModalOpen() {
      return keymapStack.length > 0;
    },
    lookup(key) {
      // Modal keymaps first; the topmost wins. If any modal is open
      // and the key isn't in the topmost modal's bindings, the lookup
      // returns null so the key is NOT routed through the global layer
      // (the modal "captures" unmapped keys).
      for (let i = keymapStack.length - 1; i >= 0; i--) {
        for (const b of keymapStack[i].bindings) {
          if (b.keys.includes(key)) return { command: b.command, mode: b.mode };
        }
        // Topmost modal didn't bind this key — don't fall through.
        if (keymapStack.length > 0) return null;
      }
      // Then global.
      return globalBindingIndex.get(key) ?? null;
    },
    trigger(id) {
      dispatch(id);
    },
    setHeld(id, on) {
      if (on) held.add(id);
      else held.delete(id);
    },
    isHeld(id) {
      return held.has(id);
    },
    axis() {
      // Text input owns movement while focused.
      if (textFocused) return { x: 0, y: 0 };
      // Modal keymaps block movement while open.
      if (keymapStack.length > 0) return { x: 0, y: 0 };
      // Joystick takes priority when it's actually being driven.
      if (virtualAxis.x !== 0 || virtualAxis.y !== 0) return virtualAxis;
      return axisFromHeld(held);
    },
    setVirtualAxis(x, y) {
      virtualAxis = { x, y };
    },
    setTextFocused(focused) {
      textFocused = focused;
    },
    dispose() {
      globalHandlers.clear();
      globalBindings = [];
      globalBindingIndex.clear();
      held.clear();
      virtualAxis = { x: 0, y: 0 };
      textFocused = false;
      keymapStack.length = 0;
    },
  };
}

/** Process-wide singleton. Same pattern as `bus`. */
export const inputRouter: InputRouter = createInputRouter();
