// Liar's dice for 2–4 players at an inn table. Everyone antes, rolls three
// dice in secret, and takes turns raising the bid ("at least five 4s
// between us") or calling the last bidder a liar. On a call every die is
// shown: if the bid holds, the caller loses a die, else the bidder does.
// Lose all your dice and you're out; the last one standing takes the pot.
// No wild ones. Pure; the server holds the table (src/lib/saloonServer.ts).

import type { DiceBid, DiceSeat, DiceTableState, DiceTableView } from "@/types/saloon";

export const DICE_PER_PLAYER = 3;
export const MAX_SEATS = 4;
/** Each turn lasts this long; a player who lets it run out loses a die. */
export const TURN_MS = 30_000;
/** A seated player who hasn't looked at the table this long is let go. */
export const SEAT_IDLE_MS = 45_000;
const LOG_LEN = 6;

export const emptyTable = (): DiceTableState => ({ phase: "waiting", ante: 0, pot: 0, seats: [], turn: 0, bid: null, deadline: 0, log: [], reveal: null });

const roll = (n: number, rand: () => number) => Array.from({ length: n }, () => 1 + Math.floor(rand() * 6));
const say = (t: DiceTableState, line: string) => { t.log = [...t.log, line].slice(-LOG_LEN); };
const live = (t: DiceTableState) => t.seats.filter((s) => !s.out);

/** Is `next` a legal raise over `prev`? More dice, or as many of a higher face. */
export function isRaise(prev: Pick<DiceBid, "qty" | "face"> | null, next: Pick<DiceBid, "qty" | "face">, totalDice: number): boolean {
  if (!Number.isInteger(next.qty) || !Number.isInteger(next.face) || next.face < 1 || next.face > 6 || next.qty < 1 || next.qty > totalDice) return false;
  if (!prev) return true;
  return next.qty > prev.qty || (next.qty === prev.qty && next.face > prev.face);
}

export const totalDice = (t: DiceTableState): number => live(t).reduce((n, s) => n + s.dice.length, 0);

/** The next player still in, after seat index `i`. */
function nextLive(t: DiceTableState, i: number): number {
  for (let k = 1; k <= t.seats.length; k++) {
    const j = (i + k) % t.seats.length;
    if (!t.seats[j].out) return j;
  }
  return i;
}

/** Everyone still in rolls again; `starter` opens the bidding. */
function newRound(t: DiceTableState, starter: number, now: number, rand: () => number): void {
  for (const s of live(t)) s.dice = roll(s.dice.length, rand);
  t.bid = null;
  t.turn = t.seats[starter]?.out ? nextLive(t, starter) : starter;
  t.deadline = now + TURN_MS;
}

/** Seat a player (waiting tables only). The first to sit sets the ante. */
export function sit(t: DiceTableState, who: { id: number; name: string }, ante: number, now: number): string | null {
  if (t.seats.some((s) => s.id === who.id)) return null;
  if (t.phase !== "waiting") return "A game's under way — wait for the next one.";
  if (t.seats.length >= MAX_SEATS) return "The table's full.";
  if (!t.seats.length) t.ante = ante;
  t.seats.push({ id: who.id, name: who.name, dice: [], out: false, seenAt: now });
  say(t, `${who.name} sits down.`);
  return null;
}

/** Start a waiting table (2+ players): the antes go in the pot. */
export function start(t: DiceTableState, now: number, rand = Math.random): string | null {
  if (t.phase !== "waiting") return "Already playing.";
  if (t.seats.length < 2) return "You need at least two players.";
  t.phase = "playing";
  t.pot = t.ante * t.seats.length;
  t.reveal = null;
  for (const s of t.seats) { s.dice = roll(DICE_PER_PLAYER, rand); s.out = false; }
  newRound(t, Math.floor(rand() * t.seats.length), now, rand);
  say(t, `The dice are cast! ${t.pot} 🪙 in the pot.`);
  return null;
}

/** The winner, once only one player has dice left. */
export function winnerOf(t: DiceTableState): DiceSeat | null {
  const l = live(t);
  return t.phase === "playing" && l.length === 1 ? l[0] : null;
}

/** `loser` loses a die; the next round starts with them (or after them). */
function loseDie(t: DiceTableState, loser: number, now: number, rand: () => number): void {
  const s = t.seats[loser];
  s.dice = s.dice.slice(1);
  if (!s.dice.length) { s.out = true; say(t, `${s.name} is out of dice!`); }
  if (!winnerOf(t)) newRound(t, s.out ? nextLive(t, loser) : loser, now, rand);
}

export function bid(t: DiceTableState, id: number, qty: number, face: number, now: number): string | null {
  if (t.phase !== "playing") return "No game going.";
  const s = t.seats[t.turn];
  if (s?.id !== id) return "It's not your turn.";
  if (!isRaise(t.bid, { qty, face }, totalDice(t))) return t.bid ? `Raise it: more than ${t.bid.qty}, or ${t.bid.qty} of a higher face.` : "That's not a bid.";
  t.bid = { qty, face, by: id };
  t.turn = nextLive(t, t.turn);
  t.deadline = now + TURN_MS;
  say(t, `${s.name}: "${qty} × ${face}s."`);
  return null;
}

/** Call the last bid a lie: show every die and settle it. */
export function call(t: DiceTableState, id: number, now: number, rand = Math.random): string | null {
  if (t.phase !== "playing") return "No game going.";
  const caller = t.turn;
  if (t.seats[caller]?.id !== id) return "It's not your turn.";
  if (!t.bid) return "There's no bid to call yet.";
  const b = t.bid;
  const count = live(t).reduce((n, s) => n + s.dice.filter((d) => d === b.face).length, 0);
  t.reveal = live(t).map((s) => ({ name: s.name, dice: [...s.dice] }));
  const bidder = t.seats.findIndex((s) => s.id === b.by);
  const holds = count >= b.qty;
  say(t, `${t.seats[caller].name} calls "Liar!" — there ${count === 1 ? "is" : "are"} ${count} × ${b.face}s. ${holds ? `${t.seats[caller].name}` : `${t.seats[bidder].name}`} loses a die.`);
  loseDie(t, holds ? caller : bidder, now, rand);
  return null;
}

/** Time out the current player (they lose a die), and let idle players go. */
export function tidy(t: DiceTableState, now: number, rand = Math.random): boolean {
  let changed = false;
  if (t.phase === "playing" && !winnerOf(t) && now > t.deadline) {
    say(t, `${t.seats[t.turn].name} took too long and loses a die.`);
    t.reveal = null;
    loseDie(t, t.turn, now, rand);
    changed = true;
  }
  for (const s of [...t.seats]) {
    if (!s.left && now - s.seenAt > SEAT_IDLE_MS) { leave(t, s.id, now, rand); changed = true; }
  }
  return changed;
}

/** Leave the table. In a game, that forfeits your ante. */
export function leave(t: DiceTableState, id: number, now: number, rand = Math.random): void {
  const i = t.seats.findIndex((s) => s.id === id);
  if (i < 0) return;
  const s = t.seats[i];
  say(t, `${s.name} leaves the table.`);
  if (t.phase === "waiting") { t.seats.splice(i, 1); if (!t.seats.length) Object.assign(t, emptyTable()); return; }
  s.left = true;
  if (s.out) return;
  s.dice = [];
  s.out = true;
  // Their dice (and maybe the bid) are gone: everyone rolls again.
  if (!winnerOf(t)) newRound(t, nextLive(t, i), now, rand);
}

/** Pay out a finished game and reset the table to waiting (winners stay seated). */
export function finish(t: DiceTableState): { winnerId: number; pot: number } | null {
  const w = winnerOf(t);
  if (!w) return null;
  const pot = t.pot;
  say(t, `🏆 ${w.name} wins ${pot} 🪙!`);
  t.phase = "waiting";
  t.pot = 0;
  t.bid = null;
  t.seats = t.seats.filter((s) => !s.left).map((s) => ({ ...s, dice: [], out: false }));
  return { winnerId: w.id, pot };
}

/** The table as player `me` sees it. */
export function diceView(t: DiceTableState, me: number): DiceTableView {
  return {
    phase: t.phase, ante: t.ante, pot: t.pot,
    seats: t.seats.map((s) => ({ id: s.id, name: s.name, count: s.dice.length, out: s.out, you: s.id === me })),
    yourDice: t.seats.find((s) => s.id === me)?.dice ?? [],
    turnId: t.phase === "playing" ? t.seats[t.turn]?.id ?? null : null,
    bid: t.bid, deadline: t.deadline, log: t.log, reveal: t.reveal, totalDice: totalDice(t),
  };
}
