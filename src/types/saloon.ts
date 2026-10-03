// Saloon games in the inns (src/lib/saloon/*). Types only.

export type SaloonGame = "blackjack" | "dice" | "arm";

/** A playing card: rank 1 (ace) … 13 (king), suit 0–3. */
export type Card = { rank: number; suit: number };

export type BlackjackStatus = "playing" | "blackjack" | "won" | "lost" | "push" | "bust";

/** A blackjack hand as stored on the server (the shoe never leaves it). */
export type BlackjackHand = {
  bet: number;
  player: Card[];
  dealer: Card[];
  shoe: Card[];
  status: BlackjackStatus;
  doubled: boolean;
};

/** A blackjack hand as the player sees it (the hole card hidden until the end). */
export type BlackjackView = {
  bet: number;
  player: Card[];
  dealer: (Card | null)[];
  playerTotal: number;
  dealerTotal: number | null;
  status: BlackjackStatus;
  canDouble: boolean;
  /** Coins won (+) or lost (−) once the hand is over. */
  net: number | null;
};

/** A bid in liar's dice: at least `qty` dice show `face`. */
export type DiceBid = { qty: number; face: number; by: number };

export type DiceSeat = { id: number; name: string; dice: number[]; out: boolean; seenAt: number; /** Walked out mid-game: dropped when it ends. */ left?: boolean };

/** A liar's dice table as stored on the server. */
export type DiceTableState = {
  phase: "waiting" | "playing";
  ante: number;
  pot: number;
  seats: DiceSeat[];
  /** Whose turn: an index into `seats`. */
  turn: number;
  bid: DiceBid | null;
  /** When the current turn times out (ms). */
  deadline: number;
  /** The last few things that happened, newest last. */
  log: string[];
  /** The last showdown: everyone's dice, revealed. */
  reveal: { name: string; dice: number[] }[] | null;
};

/** A liar's dice table as one player sees it (only their own dice). */
export type DiceTableView = {
  phase: "waiting" | "playing";
  ante: number;
  pot: number;
  seats: { id: number; name: string; count: number; out: boolean; you: boolean }[];
  yourDice: number[];
  turnId: number | null;
  bid: DiceBid | null;
  deadline: number;
  log: string[];
  reveal: { name: string; dice: number[] }[] | null;
  totalDice: number;
};

/** One sweep of the arm-wrestling needle: where the sweet spot is and how fast it moves. */
export type ArmRound = { startAt: number; periodMs: number; phase: number; zone: number };

export type ArmMatchState = {
  /** Who's wrestling: the challenger, and the opponent (null = the innkeeper). */
  a: number;
  b: number | null;
  aName: string;
  bName: string;
  stake: number;
  status: "invited" | "playing" | "done";
  round: number;
  rounds: ArmRound[];
  /** Each side's score per round (0–100), null until they pull. */
  scores: { a: (number | null)[]; b: (number | null)[] };
  winner: number | null;
  createdAt: number;
};

export type ArmMatchView = ArmMatchState & { id: number; you: "a" | "b" };

export type SaloonLeader = { name: string; net: number };

/** Everything the saloon tab needs. */
export type SaloonView = {
  blackjack: BlackjackView | null;
  dice: DiceTableView;
  arm: ArmMatchView | null;
  /** Invitations to arm-wrestle waiting for you. */
  invites: { id: number; from: string; stake: number }[];
  /** Your net winnings today, and how far you may go. */
  today: number;
  dailyCap: number;
  leaders: SaloonLeader[];
  serverTime: number;
};

/** The database or a transaction on it: saloon money moves inside the
 *  same transaction that locks the table or match. */
export type DbExec = Parameters<Parameters<(typeof import("@/db"))["db"]["transaction"]>[0]>[0] | (typeof import("@/db"))["db"];
