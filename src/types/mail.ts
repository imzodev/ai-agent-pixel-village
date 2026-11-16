// Outgoing email (src/lib/adapters/mail.ts). Types only.

export type MailMessage = { to: string; subject: string; text: string; html: string };

/** What a password reset email lists: each character on that address, with its link. */
export type ResetLink = { username: string; url: string };
