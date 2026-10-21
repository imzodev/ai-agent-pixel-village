// Inviting friends: someone who arrives through your profile or one of your
// shared moments (src/components/RefMark.tsx, ref "u:<username>" / "m:<id>")
// and reaches REFERRAL_LEVEL earns you both gems, once. Pure;
// src/lib/referralServer.ts carries it out.

/** The level an invited friend must reach before either of you is paid. */
export const REFERRAL_LEVEL = 3;
/** Gems each of you gets. */
export const REFERRAL_GEMS = 50;
/** At most this many friends pay you in a calendar month (keeps it honest). */
export const REFERRAL_MONTHLY_CAP = 20;

/** Who a ref cookie points at: a username, or a moment (whose owner invited). */
export function parseRef(ref: string | null | undefined): { username: string } | { momentId: string } | null {
  const m = String(ref ?? "").match(/^([um]):([A-Za-z0-9_-]{1,40})$/);
  if (!m) return null;
  return m[1] === "u" ? { username: m[2] } : { momentId: m[2] };
}

/** Whether a level-up just crossed the referral level. */
export const reachedReferralLevel = (from: number, to: number): boolean => from < REFERRAL_LEVEL && to >= REFERRAL_LEVEL;

/** The link to send friends: your profile (it marks them as yours). */
export const inviteLink = (origin: string, username: string): string => `${origin}/u/${encodeURIComponent(username)}`;
