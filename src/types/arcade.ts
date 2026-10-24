// The arcade: minigames with a daily course, server-checked runs, boards and
// weekly prizes (src/lib/arcade/, src/lib/arcadeServer.ts). Whistle, Harvest
// Haul, Fishing Derby, Marigold's Oven and Beehive Builder so far; each game's own types are in src/types/<game>.ts. Types only.

export type ArcadeGameKey = "whistle" | "haul" | "derby" | "oven" | "hive";

/** What a run came to: the score, how long it took, and the game's own counts. */
export type ArcadeResult = { score: number; ticks: number; perfect: boolean; detail: Record<string, number> };

/**
 * A game, as the frame sees it: its course for a day, how to check a run's
 * inputs, and how to replay them. Pure (the browser and the server both use it).
 */
export type ArcadeGameDef = {
  key: ArcadeGameKey;
  name: string;
  emoji: string;
  /** One line under the name ("Herd 30 sheep past the wolves"). */
  tagline: string;
  /** The page it's played on ("/whistle"). */
  path: string;
  /** Courses are numbered from this day. */
  epoch: string;
  tickMs: number;
  prize: { gems: readonly number[]; title: string; cosmetic: string };
  courseFor: (day: string, salt: string) => unknown;
  cleanInputs: (raw: unknown) => unknown[] | null;
  replay: (course: unknown, inputs: unknown[]) => ArcadeResult;
  /** How the result reads in a sentence ("26/30 sheep penned, 2 taken by wolves"). */
  describe: (r: Pick<ArcadeResult, "detail">) => string;
};

/** A leaderboard line. */
export type ArcadeBoardRow = { rank: number; name: string; score: number; runId?: string; me?: boolean };

/** GET /api/arcade/<game>. */
export type ArcadeView<C = unknown> = {
  game: ArcadeGameKey;
  day: string;
  number: number;
  course: C;
  /** ms until the next course. */
  nextInMs: number;
  today: ArcadeBoardRow[];
  week: ArcadeBoardRow[];
  /** Last week's top three. */
  champions: ArcadeBoardRow[];
  me: { name: string; best: number | null; rank: number | null; weekRank: number | null } | null;
};

/** POST /api/arcade/<game>/start. */
export type ArcadeStart<C = unknown> = { day: string; course: C; token: string };

/** POST /api/arcade/<game>/submit. */
export type ArcadeSubmitResult = ArcadeResult & { runId: string; rank: number; best: number; shareUrl: string };

/** A stored run, for its replay page. */
export type ArcadeRunView<C = unknown, I = unknown> = {
  id: string; game: ArcadeGameKey; day: string; number: number; course: C;
  name: string; username: string | null; score: number; detail: Record<string, number>; inputs: I[];
};

/** A replay job for the worker (src/lib/arcade/replayPool.ts). */
export type ArcadeReplayJob = { id: number; game: ArcadeGameKey; course: unknown; inputs: unknown[] };
export type ArcadeReplayDone = { id: number; result: ArcadeResult | null; error?: string };
export type ArcadeReplayPool = {
  next: number;
  waiting: Map<number, { job: ArcadeReplayJob; resolve: (r: ArcadeResult | null) => void; timer: ReturnType<typeof setTimeout> | null }>;
  queue: number[];
  workers: { proc: import("node:child_process").ChildProcess; busy: number | null }[];
};

/** The /play hub: each game today. */
export type ArcadeHubGame = { key: ArcadeGameKey; name: string; emoji: string; tagline: string; path: string; number: number; leader: ArcadeBoardRow | null; players: number };

/** A minigame's place in the village (src/lib/arcade/spots.ts). */
export type ArcadeSpot = { game: ArcadeGameKey; tx: number; ty: number; w: number; h: number; signRows: number; name: string };

/** What a game's HUD shows, refreshed a few times a second: the clock, a few counts, and pips (breath…). */
export type ArcadeHud = {
  /** Seconds left, or null when the game has no clock showing. */
  seconds: number | null;
  chips: { icon: string; text: string; title: string; warn?: boolean }[];
  /** 0–1 each (Whistle's breath). */
  pips?: number[];
  /** A word on what's happening ("Load the cart", "To market"). */
  phase?: string;
};

/** A game's playing field (src/components/<game>/…Field.tsx): plays or replays a run. */
export type ArcadeFieldProps = {
  course: unknown;
  mode: "play" | "replay";
  /** play: the run goes once this is true; replay: plays while true. */
  running: boolean;
  /** replay: the run's inputs. */
  inputs?: readonly unknown[];
  sound?: boolean;
  speed?: number;
  onHud?: (h: ArcadeHud) => void;
  /** The inputs that took effect (for the server to replay) and the result. */
  onDone?: (inputs: unknown[], result: ArcadeResult) => void;
  /** Change it to start over. */
  runKey?: number;
};

/** A game's screen parts for the shell (src/components/arcade/clientGames.ts). */
export type ArcadeClientGame = {
  Field: (props: ArcadeFieldProps) => import("react").ReactNode;
  /** The how-to on the intro card: [icon, text]. */
  howTo: readonly (readonly [string, string])[];
  /** The first line on the intro card. */
  pitch: string;
};
