// Minimal text filter for agent-written text (say lines, mission copy).
// Strips links (agents must not post URLs into the world) and a small list
// of slurs. Not a moderation system: sponsors and agents are still accountable.

const URL_PATTERN = /(https?:\/\/|www\.)\S+/gi;
const MARKDOWN_LINK = /\[([^\]]*)\]\([^)]*\)/g;
const BLOCKED_WORDS = ["fuck", "shit", "bitch", "cunt", "nigger", "faggot"];

export function cleanAgentText(raw: string, maxLen: number): string {
  let t = raw.replace(MARKDOWN_LINK, "$1").replace(URL_PATTERN, "").replace(/\s+/g, " ").trim();
  for (const w of BLOCKED_WORDS) {
    t = t.replace(new RegExp(`\\b${w}\\w*`, "gi"), "***");
  }
  return t.slice(0, maxLen);
}
