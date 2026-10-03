// Blackjack against the innkeeper: dealer stands on all 17s, blackjack
// pays 3 to 2, double down on your first two cards. Pure; the server keeps
// the shoe (src/lib/saloonServer.ts).

import type { BlackjackHand, BlackjackView, Card } from "@/types/saloon";

/** A shuffled shoe of `decks` decks. */
export function newShoe(decks = 4, rand = Math.random): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) for (let suit = 0; suit < 4; suit++) for (let rank = 1; rank <= 13; rank++) shoe.push({ rank, suit });
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

/** A hand's best total (aces count 11 when that doesn't bust). */
export function handTotal(cards: readonly Card[]): number {
  let total = 0, aces = 0;
  for (const c of cards) {
    total += c.rank === 1 ? 11 : Math.min(10, c.rank);
    if (c.rank === 1) aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

export const isBlackjack = (cards: readonly Card[]): boolean => cards.length === 2 && handTotal(cards) === 21;

/** Deal a new hand for `bet`. Naturals are settled at once. */
export function deal(bet: number, rand = Math.random): BlackjackHand {
  const shoe = newShoe(4, rand);
  const h: BlackjackHand = { bet, player: [shoe.pop()!, shoe.pop()!], dealer: [shoe.pop()!, shoe.pop()!], shoe, status: "playing", doubled: false };
  if (isBlackjack(h.player) || isBlackjack(h.dealer)) settle(h);
  return h;
}

/** The dealer draws to 17, then the hand is scored. */
function settle(h: BlackjackHand): void {
  const p = handTotal(h.player);
  if (isBlackjack(h.player)) { h.status = isBlackjack(h.dealer) ? "push" : "blackjack"; return; }
  if (isBlackjack(h.dealer)) { h.status = "lost"; return; }
  if (p > 21) { h.status = "bust"; return; }
  while (handTotal(h.dealer) < 17) h.dealer.push(h.shoe.pop()!);
  const d = handTotal(h.dealer);
  h.status = d > 21 || p > d ? "won" : p === d ? "push" : "lost";
}

export function hit(h: BlackjackHand): void {
  if (h.status !== "playing") return;
  h.player.push(h.shoe.pop()!);
  const t = handTotal(h.player);
  if (t > 21) h.status = "bust";
  else if (t === 21) settle(h);
}

export function stand(h: BlackjackHand): void {
  if (h.status === "playing") settle(h);
}

/** Double the bet, take exactly one card, and stand. */
export function double(h: BlackjackHand): void {
  if (h.status !== "playing" || h.player.length !== 2) return;
  h.doubled = true;
  h.bet *= 2;
  h.player.push(h.shoe.pop()!);
  settle(h);
}

/** What a finished hand pays back in total (stake included); 0 for a loss. */
export function payout(h: BlackjackHand): number {
  switch (h.status) {
    case "blackjack": return h.bet + Math.floor(h.bet * 1.5);
    case "won": return h.bet * 2;
    case "push": return h.bet;
    default: return 0;
  }
}

/** The hand as its player sees it. */
export function blackjackView(h: BlackjackHand): BlackjackView {
  const over = h.status !== "playing";
  return {
    bet: h.bet,
    player: h.player,
    dealer: over ? h.dealer : [h.dealer[0], null],
    playerTotal: handTotal(h.player),
    dealerTotal: over ? handTotal(h.dealer) : null,
    status: h.status,
    canDouble: h.status === "playing" && h.player.length === 2,
    net: over ? payout(h) - h.bet : null,
  };
}
