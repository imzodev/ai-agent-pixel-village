// Password reset tokens (server only: Node's crypto). Only a token's hash is
// stored, so a leaked table can't be used to reset anyone's password.

import { createHash, randomBytes } from "crypto";

/** A fresh token for a reset link: 32 random bytes, hex. */
export const newResetToken = (): string => randomBytes(32).toString("hex");

/** The stored form of a reset token. */
export const tokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");

/** Is this shaped like one of our tokens? */
export const isResetToken = (t: string): boolean => /^[0-9a-f]{64}$/.test(t);
