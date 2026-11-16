// Password recovery, the pure part: checking an email, hashing a reset
// token (only the hash is stored), and the email itself. A player may leave
// an email when they create or save a character; it's used for nothing else.
// Safe in the browser (the forms use it). Server: src/lib/passwordResetServer.ts.

import type { MailMessage, ResetLink } from "@/types/mail";

/** How long a reset link works. */
export const RESET_TTL_MS = 60 * 60_000;
/** Longest email accepted (RFC 5321's limit). */
export const EMAIL_MAX = 254;
/** Reset emails at most this often per address (a few, for typos and spam folders). */
export const RESET_PER_EMAIL_HOUR = 3;
/** Characters listed in one reset email (one address may hold a family's accounts). */
export const RESET_MAX_ACCOUNTS = 5;

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

/** Lower-cased and trimmed, or null when blank. */
export const normalizeEmail = (raw: unknown): string | null => {
  const e = String(raw ?? "").trim().toLowerCase();
  return e ? e : null;
};

/** Why an (already normalized) email can't be used, or null if it's fine. */
export function emailProblem(email: string): string | null {
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return "That doesn't look like an email address.";
  return null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The reset email: every character on this address, each with its own link. */
export function resetEmail(to: string, links: ResetLink[]): MailMessage {
  const one = links.length === 1;
  const lines = links.map((l) => `${l.username}: ${l.url}`).join("\n");
  return {
    to,
    subject: "Reset your thegroove password",
    text: `Someone (hopefully you) asked to reset the password for ${one ? "your character" : "these characters"} on thegroove.\n\n${lines}\n\nEach link works once, for the next hour. If you didn't ask, ignore this email: nothing changes.\n`,
    html: `<p>Someone (hopefully you) asked to reset the password for ${one ? "your character" : "these characters"} on thegroove.</p>`
      + `<ul>${links.map((l) => `<li><b>${esc(l.username)}</b>: <a href="${esc(l.url)}">set a new password</a></li>`).join("")}</ul>`
      + `<p>Each link works once, for the next hour. If you didn't ask, ignore this email: nothing changes.</p>`,
  };
}
