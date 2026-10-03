// Saloon games: blackjack scoring and payouts, liar's dice bids and
// showdowns, arm-wrestling pulls, and the daily limits.
import { describe, expect, it } from "vitest";
import { deal, double, handTotal, hit, payout, stand, blackjackView } from "@/lib/saloon/blackjack";
import { bid, call, diceView, emptyTable, finish, isRaise, leave, sit, start, tidy, winnerOf, TURN_MS, DICE_PER_PLAYER } from "@/lib/saloon/dice";
import { decided, needleAt, pullScore } from "@/lib/saloon/arm";
import { DAILY_LOSS_CAP, DAILY_WIN_CAP, mayPlay, validBet } from "@/lib/saloon/rules";
import type { BlackjackHand, Card } from "@/types/saloon";

const C = (rank: number): Card => ({ rank, suit: 0 });
const hand = (player: number[], dealer: number[], shoe: number[] = []): BlackjackHand => ({ bet: 10, player: player.map(C), dealer: dealer.map(C), shoe: shoe.map(C), status: "playing", doubled: false });

describe("blackjack", () => {
  it("counts aces as 11 or 1", () => {
    expect(handTotal([C(1), C(13)])).toBe(21);
    expect(handTotal([C(1), C(1), C(9)])).toBe(21);
    expect(handTotal([C(1), C(5), C(10)])).toBe(16);
    expect(handTotal([C(12), C(11), C(2)])).toBe(22);
  });
  it("dealer draws to 17; payouts are right", () => {
    const h = hand([10, 8], [10, 6], [5]); // dealer draws a 5 → 21
    stand(h);
    expect(handTotal(h.dealer)).toBe(21);
    expect(h.status).toBe("lost");
    expect(payout(h)).toBe(0);
    const w = hand([10, 9], [10, 7]);
    stand(w);
    expect(w.status).toBe("won");
    expect(payout(w)).toBe(20);
    const p = hand([10, 7], [10, 7]);
    stand(p);
    expect(payout(p)).toBe(10);
  });
  it("busting loses; doubling doubles the bet and takes one card", () => {
    const b = hand([10, 6], [10, 7], [9]);
    hit(b);
    expect(b.status).toBe("bust");
    const d = hand([5, 6], [10, 7], [10]);
    double(d);
    expect(d.bet).toBe(20);
    expect(d.player.length).toBe(3);
    expect(d.status).toBe("won");
    expect(payout(d)).toBe(40);
  });
  it("a natural pays 3:2 at once, and the hole card stays hidden mid-hand", () => {
    let seen = false;
    for (let k = 0; k < 400 && !seen; k++) {
      const h = deal(10);
      if (h.status === "blackjack") { expect(payout(h)).toBe(25); seen = true; }
      if (h.status === "playing") expect(blackjackView(h).dealer[1]).toBeNull();
    }
    expect(seen).toBe(true);
  });
});

describe("liar's dice", () => {
  const table = () => {
    const t = emptyTable();
    sit(t, { id: 1, name: "Ann" }, 10, 0);
    sit(t, { id: 2, name: "Bo" }, 99, 0);
    return t;
  };
  it("the first to sit sets the ante; starting needs two", () => {
    const t = emptyTable();
    sit(t, { id: 1, name: "Ann" }, 10, 0);
    expect(start(t, 0)).toMatch(/two/);
    sit(t, { id: 2, name: "Bo" }, 99, 0);
    expect(t.ante).toBe(10);
    expect(start(t, 0, () => 0)).toBeNull();
    expect(t.pot).toBe(20);
    expect(t.seats.every((s) => s.dice.length === DICE_PER_PLAYER)).toBe(true);
  });
  it("raises must go up: more dice, or a higher face", () => {
    expect(isRaise(null, { qty: 1, face: 3 }, 6)).toBe(true);
    expect(isRaise({ qty: 2, face: 3 }, { qty: 2, face: 4 }, 6)).toBe(true);
    expect(isRaise({ qty: 2, face: 3 }, { qty: 3, face: 1 }, 6)).toBe(true);
    expect(isRaise({ qty: 2, face: 3 }, { qty: 2, face: 3 }, 6)).toBe(false);
    expect(isRaise({ qty: 2, face: 3 }, { qty: 7, face: 3 }, 6)).toBe(false);
  });
  it("a call costs the wrong side a die, and the last one standing wins the pot", () => {
    const t = table();
    start(t, 0, () => 0); // everyone rolls 1s; seat 0 opens
    t.seats[0].dice = [6, 6, 6];
    t.seats[1].dice = [2, 2, 2];
    t.turn = 0;
    expect(bid(t, 2, 1, 6, 0)).toMatch(/turn/);
    expect(bid(t, 1, 4, 6, 0)).toBeNull(); // a lie: only three 6s
    expect(call(t, 2, 0)).toBeNull();
    expect(t.seats[0].dice.length).toBe(2); // the bidder lost one
    expect(t.reveal?.length).toBe(2);
    // Knock Ann down to nothing.
    t.seats[0].out = true; t.seats[0].dice = [];
    expect(winnerOf(t)?.id).toBe(2);
    expect(finish(t)).toEqual({ winnerId: 2, pot: 20 });
    expect(t.phase).toBe("waiting");
  });
  it("a slow turn costs a die; walking out forfeits", () => {
    const t = table();
    start(t, 0, () => 0);
    const slow = t.seats[t.turn];
    for (const s of t.seats) s.seenAt = TURN_MS + 1;
    expect(tidy(t, TURN_MS + 1)).toBe(true);
    expect(slow.dice.length).toBe(DICE_PER_PLAYER - 1);
    leave(t, 1, TURN_MS + 2);
    expect(winnerOf(t)?.id).toBe(2);
    finish(t);
    expect(t.seats.map((s) => s.id)).toEqual([2]); // the one who left is gone
  });
  it("you only ever see your own dice", () => {
    const t = table();
    start(t, 0);
    const v = diceView(t, 1);
    expect(v.yourDice).toEqual(t.seats[0].dice);
    expect(JSON.stringify(v.seats)).not.toContain("dice");
  });
});

describe("arm wrestling", () => {
  const r = { startAt: 0, periodMs: 1000, phase: 0, zone: 0.5 };
  it("the needle sweeps 0→1→0, and a pull on the mark scores 100", () => {
    expect(needleAt(r, 0)).toBeCloseTo(0);
    expect(needleAt(r, 500)).toBeCloseTo(1);
    expect(needleAt(r, 250)).toBeCloseTo(0.5);
    expect(pullScore(r, 250)).toBe(100);
    expect(pullScore(r, 0)).toBe(0);
  });
  it("best of three", () => {
    expect(decided({ a: [90, 80], b: [10, 20] })).toBe("a");
    expect(decided({ a: [90, null], b: [10, null] })).toBeNull();
    expect(decided({ a: [90, 10, 50], b: [10, 90, 50] })).toBe("draw");
  });
});

describe("limits", () => {
  it("bets and daily caps", () => {
    expect(validBet(5) && validBet(50)).toBe(true);
    expect(validBet(4) || validBet(51) || validBet(7.5)).toBe(false);
    expect(mayPlay(0).ok).toBe(true);
    expect(mayPlay(DAILY_WIN_CAP).ok).toBe(false);
    expect(mayPlay(-DAILY_LOSS_CAP).ok).toBe(false);
  });
});
