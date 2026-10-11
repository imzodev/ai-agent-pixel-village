// Whether money can change hands. Real payments need STRIPE_SECRET_KEY. The
// "sandbox" (purchases that complete without paying, for trying the shop
// locally) only ever runs outside production: in production without a key,
// buying is simply closed ("coming soon"), never free.

/** Real Stripe payments are configured. */
export const paymentsLive = (): boolean => !!process.env.STRIPE_SECRET_KEY;

/** Free sandbox purchases are allowed (development only, without a Stripe key). */
export const sandboxAllowed = (): boolean => !paymentsLive() && process.env.NODE_ENV !== "production";

/** Buying (gems, sponsor reservations) is open at all. */
export const checkoutOpen = (): boolean => paymentsLive() || sandboxAllowed();
