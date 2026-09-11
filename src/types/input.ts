// Client-side input. Phaser scene reads; touch/keyboard adapters write.

export type Facing = "up" | "down" | "left" | "right";

export type InputState = {
  /** Normalized -1..1 for each axis. Keyboard snaps to cardinal; joystick is continuous. */
  axisX: number;
  axisY: number;
  /** Bitfield of action button presses this frame. */
  actions: ActionSet;
  /** True when a text input is focused (chat, modal) — disables gameplay input. */
  textFocused: boolean;
};

export const ACTIONS = ["interact", "bag", "shop", "map"] as const;
export type Action = (typeof ACTIONS)[number];
export type ActionSet = Record<Action, boolean>;

export const defaultInputState = (): InputState => ({
  axisX: 0,
  axisY: 0,
  actions: { interact: false, bag: false, shop: false, map: false },
  textFocused: false,
});
