// Client-side input types. Types only — no runtime code.
// Behaviour and bindings live in src/game/input/*.

/** Normalized keyboard + touch axis, sampled by the scene each frame. */
export type InputState = {
  axisX: number;
  axisY: number;
  /** True when a text field has focus; gameplay commands are gated. */
  textFocused: boolean;
};

/** Every action exposed by the game. A binding maps a key to one of these. */
export type CommandId =
  | "player.interact"
  | "player.attack"
  | "player.craft"
  | "player.sell"
  // Open the NPC's shop (what they sell), like player.sell opens selling.
  | "player.buy"
  // Cast / strike / reel while fishing (needs a rod and deep water ahead).
  | "player.fish"
  // Get on / off your bicycle (src/lib/bike.ts).
  | "player.bike"
  // Dodge roll: a quick dash with a moment of invulnerability (short cooldown).
  | "player.dodge"
  | "trade.sell"
  | "trade.focus_qty"
  | "ui.bag"
  | "ui.shop"
  | "ui.map"
  | "ui.close"
  | "move.up"
  | "move.down"
  | "move.left"
  | "move.right"
  // Held: move at run speed (Shift on keyboard, full joystick push on touch).
  | "move.run";

/** "press" fires once on keydown; "hold" reports its state each frame. */
export type BindingMode = "press" | "hold";

/** A single keyboard binding. Multiple keys may map to one command. */
export type KeyBinding = {
  readonly keys: readonly string[];
  readonly command: CommandId;
  readonly mode: BindingMode;
};

/** Whether a command participates in gameplay gating. */
export type CommandScope = "gameplay" | "ui";

/** A command handler is just a zero-arg runnable. The router owns state. */
export type InputCommand = {
  readonly id: CommandId;
  readonly scope: CommandScope;
  readonly run: () => void;
};

/** Snapshot of the world the router needs to gate dispatch. */
export type InputContext = {
  textFocused: boolean;
};
