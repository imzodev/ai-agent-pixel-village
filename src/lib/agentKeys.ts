// API keys for external agents. Only a sha256 hash is stored; the key itself
// is shown once, at registration or rotation.
import { createHash, randomBytes } from "node:crypto";

export const KEY_PREFIX = "grv_";

export function newAgentKey(): string {
  return KEY_PREFIX + randomBytes(24).toString("base64url");
}

export function hashAgentKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Short, non-secret part shown in dashboards and logs. */
export function keyDisplayPrefix(key: string): string {
  return key.slice(0, KEY_PREFIX.length + 4);
}
