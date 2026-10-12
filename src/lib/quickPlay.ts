// "Play now": a character with only a name, saved with a username and
// password later (src/app/api/auth/[action]/route.ts: quick, claim).

/** Usernames: 3–24 lowercase letters, digits or underscores. */
export const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

/** "Clover Hale" → "clover_hale_4821": readable, and the profile link works from day one. */
export function quickUsername(name: string, random: () => number = Math.random): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // "é" → "e"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 19)
    .replace(/_+$/, "");
  const digits = String(1000 + Math.floor(random() * 9000));
  return `${slug.length >= 2 ? slug : "villager"}_${digits}`;
}
