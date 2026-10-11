// The reply text of an NPC answer that is still being written. The talk
// prompt asks for {"text": "...", "offers": [...]}, so while it streams the
// buffer is unfinished JSON; this pulls out the "text" string as far as it
// has got. A model that answers in plain prose (no "{") is shown as is.

const TEXT_KEY = /"text"\s*:\s*"/;
const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "", '"': '"', "\\": "\\", "/": "/", b: "", f: "" };

/** The "text" field of a (possibly unfinished) JSON reply, decoded so far. */
export function streamedTextField(buffer: string): string {
  const start = buffer.search(/\S/);
  if (start < 0) return "";
  if (buffer[start] !== "{") return buffer.trim(); // plain prose
  const m = TEXT_KEY.exec(buffer);
  if (!m) return "";
  let out = "";
  for (let i = m.index + m[0].length; i < buffer.length; i++) {
    const c = buffer[i];
    if (c === '"') break; // the string is closed
    if (c !== "\\") { out += c; continue; }
    const e = buffer[i + 1];
    if (e === undefined) break; // the escape hasn't arrived yet
    if (e === "u") {
      const hex = buffer.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break; // not all here yet
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
    } else {
      out += ESCAPES[e] ?? e;
      i += 1;
    }
  }
  return out;
}

/**
 * Only the spoken words of a reply: drops *stage directions* (and an unclosed
 * "*…" still streaming in), and when the speech is quoted between them, keeps
 * just the quotes' contents. NPCs talk like people, not a narrated game.
 */
export function plainSpeech(text: string, { streaming = false } = {}): string {
  // A "*" left unclosed is a direction still streaming in (hide it), or a stray in a finished reply (drop just it).
  let t = text.replace(/\*[^*]*\*/g, " ").replace(streaming ? /\*[^*]*$/ : /\*/g, " ");
  if (/^\s*["“]/.test(t)) t = [...t.matchAll(/["“]([^"“”]*)["”]?/g)].map((m) => m[1].trim()).filter(Boolean).join(" ");
  t = t.replace(/\s+/g, " ").trim();
  // Nothing spoken at all: a finished reply keeps its words rather than going
  // blank; one still streaming shows nothing until the speech starts.
  return t || (streaming ? "" : text.replace(/\*/g, "").trim());
}
