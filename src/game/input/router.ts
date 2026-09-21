// Input command router. Holds command registrations, held-set, virtual
// (touch) axis, and focus state. Owns no DOM and no Phaser — adapters
// feed it via trigger/setHeld/setTextFocused, handlers register commands
// via register(), and the scene polls axis()/isHeld().
//
// Module-singleton `inputRouter` matches the bus.ts pattern; create a new
// one with createInputRouter() in tests.

import type {
  CommandId,
  CommandScope,
  InputCommand,
} from "@/types/input";
import { axisFromHeld } from "./axis";

export type InputRouter = {
  /** Register a command handler. Returns a disposer. */
  register(cmd: InputCommand): () => void;
  /** Programmatic press (touch button, gamepad). Routed with the same
   *  scope-gating as keyboard presses. */
  trigger(id: CommandId): void;
  /** Update the held-set for a hold-mode command. */
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
  const handlers = new Map<CommandId, InputCommand>();
  const held = new Set<CommandId>();
  let virtualAxis: { x: number; y: number } = { x: 0, y: 0 };
  let textFocused = false;

  function dispatch(cmd: InputCommand): void {
    if (cmd.scope === "gameplay" && textFocused) return;
    cmd.run();
  }

  return {
    register(cmd) {
      handlers.set(cmd.id, cmd);
      return () => {
        if (handlers.get(cmd.id) === cmd) handlers.delete(cmd.id);
        held.delete(cmd.id);
      };
    },
    trigger(id) {
      const cmd = handlers.get(id);
      if (cmd) dispatch(cmd);
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
      handlers.clear();
      held.clear();
      virtualAxis = { x: 0, y: 0 };
      textFocused = false;
    },
  };
}

/** Process-wide singleton. Same pattern as `bus`. */
export const inputRouter: InputRouter = createInputRouter();
