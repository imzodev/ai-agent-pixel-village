// Text filters. Agent-written text (say lines, mission copy) and everything
// players write that others see: chat, character names and usernames (shown
// in the world, on public profiles and on share cards). Not a full moderation
// system: reports and bans (src/app/api/report, src/app/api/admin) back it up.

const URL_PATTERN = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|gg|xyz|ru|cn|tk|ly|me|co)\b\S*/gi;
const MARKDOWN_LINK = /\[([^\]]*)\]\([^)]*\)/g;

/** Why a player can be reported (the report window's buttons; checked by /api/report). */
export const REPORT_REASONS: readonly string[] = ["Offensive chat", "Offensive name", "Spam or ads", "Cheating", "Harassment", "Other"];

/** Unambiguous: matched anywhere, even inside other words ("xXfuckXx"). */
const STRONG = ["fuck", "cunt", "nigger", "nigga", "faggot", "retard", "tranny", "kike", "wetback", "hitler", "kkk", "porn", "whore"];
/** Short words that hide inside innocent ones (grape, spicy, Hancock, Dickens):
 *  matched only as a whole word (or its plural). */
const WHOLE = ["shit", "bitch", "dick", "cock", "pussy", "asshole", "bastard", "slut", "wanker", "twat", "fag", "spic", "chink", "nazi", "rape"];
/** Names that would pass for staff or the game itself. */
const RESERVED = ["admin", "moderator", "official", "thegroove", "staff", "support", "system"];

/** Undo the usual disguises: 1337-speak, repeated letters, separators. */
export function normalizeForMatch(raw: string): string {
  const map: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s", "!": "i", "|": "i" };
  return raw.toLowerCase().replace(/[01345789@$!|]/g, (c) => map[c] ?? c).replace(/[^a-z]/g, "").replace(/(.)\1{2,}/g, "$1$1");
}

export function cleanAgentText(raw: string, maxLen: number): string {
  return maskWords(raw.replace(MARKDOWN_LINK, "$1").replace(URL_PATTERN, "").replace(/\s+/g, " ").trim()).slice(0, maxLen);
}

const stars = (m: string) => "*".repeat(Math.min(m.length, 6));
function maskWords(t: string): string {
  for (const w of STRONG) t = t.replace(new RegExp(`\\w*${w}\\w*`, "gi"), stars);
  for (const w of WHOLE) t = t.replace(new RegExp(`\\b${w}(s|es)?\\b`, "gi"), stars);
  return t;
}

/** A player's chat line as others will see it: no links, bad words masked, one line, capped. */
export function cleanPlayerChat(raw: string, maxLen = 140): string {
  return maskWords(raw.replace(MARKDOWN_LINK, "$1").replace(URL_PATTERN, "").replace(/\s+/g, " ").trim()).slice(0, maxLen).trim();
}

/** Why a character name or username can't be used, or null if it's fine. */
export function nameProblem(raw: string): string | null {
  const n = normalizeForMatch(raw);
  // Words inside the name: split on anything that isn't a letter or digit, and at camelCase.
  const tokens = raw.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9@$!|]+/).map(normalizeForMatch).filter(Boolean);
  const squeezed = n.replace(/(.)\1+/g, "$1"); // "fuuuck" → "fuck"
  if (STRONG.some((w) => n.includes(w) || squeezed.includes(w)) || WHOLE.some((w) => n === w || n === `${w}s` || tokens.some((t) => t === w || t === `${w}s`))) return "That name isn't allowed here.";
  if (RESERVED.some((w) => n.includes(w))) return "That name is reserved.";
  if (URL_PATTERN.test(raw)) { URL_PATTERN.lastIndex = 0; return "Names can't contain links."; }
  URL_PATTERN.lastIndex = 0;
  return null;
}
