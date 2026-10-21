// Site-wide facts shown on public pages (legal pages, footers).

/** Where players write to us (privacy requests, appeals, anything). Set
 *  NEXT_PUBLIC_CONTACT_EMAIL to change it. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "hello@thegroove.fun";

/** When the privacy policy and terms last changed. */
export const LEGAL_UPDATED = "October 21, 2026";

/** Cookie a shared page (/m, /u) leaves, so a signup can be credited to it (RefMark). */
export const REF_COOKIE = "grove_ref";
/** Where a visitor first came from (src/lib/acquisition.ts): "source|campaign", kept 30 days. */
export const SRC_COOKIE = "grove_src";
