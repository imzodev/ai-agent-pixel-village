// Saloon rules shared by every game: stakes and daily limits. Coins only.

/** Smallest and largest bet / ante / stake. */
export const MIN_BET = 5;
export const MAX_BET = 50;
/** Net winnings per day after which the house stops taking your bets. */
export const DAILY_WIN_CAP = 300;
/** Net losses per day after which the innkeeper sends you home. */
export const DAILY_LOSS_CAP = 400;

export const validBet = (n: number): boolean => Number.isInteger(n) && n >= MIN_BET && n <= MAX_BET;

/** Whether a player at `today` net may still play. */
export function mayPlay(today: number): { ok: true } | { ok: false; error: string } {
  if (today >= DAILY_WIN_CAP) return { ok: false, error: `"You've cleaned me out for today, friend." (Daily winnings limit: ${DAILY_WIN_CAP} 🪙)` };
  if (today <= -DAILY_LOSS_CAP) return { ok: false, error: `"I think that's enough for today. Go home and sleep it off." (Daily loss limit: ${DAILY_LOSS_CAP} 🪙)` };
  return { ok: true };
}
