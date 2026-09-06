import type { characters, npcs, sponsors } from "@/db/schema";
import { getActiveProvider, chatWithFallback, type ChatMessage } from "@/lib/llm";

export type Offer =
  | { id: string; type: "mission"; missionId: number; label: string; line: string }
  | { id: string; type: "turnin"; missionId: number; label: string; line: string }
  | { id: string; type: "discount"; label: string; line: string }
  | { id: string; type: "gift"; itemKey: string; label: string; line: string };

export type BrainInput = {
  npc: typeof npcs.$inferSelect;
  sponsor: typeof sponsors.$inferSelect | null;
  character: typeof characters.$inferSelect;
  message: string;
  history: { role: string; text: string }[];
  offers: Offer[];
  hour: number;
  weather: string;
};

export type BrainOutput = { text: string; offerIds: string[]; source: "scripted" | "llm" | "remote" };

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export async function generateReply(input: BrainInput): Promise<BrainOutput> {
  if (input.npc.kind === "remote" && input.npc.webhookUrl) {
    const r = await remoteReply(input).catch(() => null);
    if (r) return r;
  }
  if (getActiveProvider()) {
    const r = await llmReply(input).catch((e) => {
      console.error("llm error", e);
      return null;
    });
    if (r) return r;
  }
  return scriptedReply(input);
}

// ---------- Scripted brain (always available) ----------
export function scriptedReply(input: BrainInput): BrainOutput {
  const { npc, sponsor, character, message, offers, history, hour, weather } = input;
  const m = message.toLowerCase().trim();
  const name = character.name;
  const first = history.length === 0;
  const parts: string[] = [];
  const offerIds: string[] = [];

  const timeWord = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const weatherAside =
    weather === "rain" ? pick([" Mind the puddles.", " Lovely rain, isn't it?"]) :
    weather === "snow" ? " Snow on the roofs — can you believe it?" :
    weather === "fog" ? " Thick fog today. Stay close to the lanterns." : "";

  if (first || /^(hi|hello|hey|yo|greetings|good)/.test(m)) {
    parts.push(first ? npc.greeting : pick([`Good ${timeWord}, ${name}!`, `${name}! Back again.`, `Well hello, ${name}.`]) + weatherAside);
  } else if (/who are you|your name|about you/.test(m)) {
    parts.push(`I'm ${npc.name}, the ${npc.role.toLowerCase()}. ${npc.persona.split(". ").slice(1, 2).join(". ")}.`);
  } else if (/thank/.test(m)) {
    parts.push(pick(["Any time.", "Don't mention it.", "That's what neighbors are for."]));
  } else if (/bye|see you|later|farewell/.test(m)) {
    parts.push(pick([`Safe travels, ${name}.`, "Come back soon!", "Mind the fox on your way."]));
  } else if (/weather|rain|snow|fog|sun/.test(m)) {
    parts.push(weather === "clear" ? "Clear skies for now. The ducks seem pleased." : `It's ${weather} at the moment.${weatherAside}`);
  } else if (/time|hour|late|early/.test(m)) {
    parts.push(`It's about ${Math.floor(hour)} o'clock, ${timeWord} by grove reckoning.`);
  } else if (/menu|sell|buy|shop|special|price/.test(m) && sponsor) {
    parts.push(`Ah, you've come to the right place. ${sponsor.pitch}`);
  } else if (/quest|mission|task|help|work|job/.test(m)) {
    parts.push(offers.some((o) => o.type === "mission") ? "Funny you should ask." : "Nothing pressing right now — but check back, things change around here.");
  } else if (/fox|cat|dog|sheep|cow|chicken|duck|rabbit|animal/.test(m)) {
    parts.push(pick(["The animals here mostly look after themselves. Pet them — they remember kindness.", "Ember the fox has been circling the chicken yard again. Keep an eye out."]));
  } else {
    parts.push(pick([
      `Hm, ${m.length > 40 ? "that's a lot to take in" : "is that so"}. ${pick(["Tell me more.", "The grove's full of surprises.", "You've a good head on you."])}`,
      `${pick(["Mm.", "Right.", "Interesting."])} ${pick(["Anyway —", "Now then,", "Where was I —"])} ${npc.role.toLowerCase()}s like me don't get many visitors, so this is nice.`,
    ]));
  }

  // Turn-ins first: reward the player for work already done.
  for (const o of offers) if (o.type === "turnin") { parts.push(o.line); offerIds.push(o.id); }
  // Then a mission offer (one at a time keeps it conversational).
  const missionOffer = offers.find((o) => o.type === "mission");
  if (missionOffer) { parts.push(missionOffer.line); offerIds.push(missionOffer.id); }
  // Gifts
  for (const o of offers) if (o.type === "gift") { parts.push(o.line); offerIds.push(o.id); }
  // The pitch — the reason a sponsored NPC exists, woven in as something the character would say anyway.
  const discount = offers.find((o) => o.type === "discount");
  if (discount && sponsor) {
    const lastNpc = [...history].reverse().find((h) => h.role === "npc")?.text ?? "";
    const pitchedRecently = lastNpc.includes(sponsor.discountCode) || lastNpc.includes("write you down a code");
    if (!pitchedRecently || /code|discount|deal|special|offer/.test(m)) {
      parts.push(pick([
        `Oh — and between us: ${sponsor.pitch} Want me to write you down a code?`,
        `Before you go — ${sponsor.pitch} I can jot you down a code, if you like.`,
        `You know, ${sponsor.pitch} Say the word and I'll write you down a code.`,
      ]));
      offerIds.push(discount.id);
    }
  }
  return { text: parts.join(" "), offerIds, source: "scripted" };
}

// ---------- LLM brain ----------
function systemPrompt(input: BrainInput) {
  const { npc, sponsor, character, offers, hour, weather } = input;
  const offerList = offers.map((o) => `- id="${o.id}" (${o.type}) ${o.label}: suggested line: "${o.line}"`).join("\n");
  return `You are ${npc.name}, the ${npc.role} in a cozy pixel-art village called the grove. Stay fully in character. Never mention being an AI.
Persona: ${npc.persona}
Mood: ${npc.mood}. It is ${Math.floor(hour)}:00 (${weather}). You are talking to a villager named ${character.name} (level ${character.level}).
${sponsor ? `You are sponsored by ${sponsor.businessName} ("${sponsor.tagline}"). You are two things at once: a helpful villager who hands out missions and items, AND an ambassador for the sponsor. Weave this pitch naturally into conversation as something you would genuinely say — never a hard sell, one mention at most per reply: "${sponsor.pitch}" When you make the pitch, include the offer with type "discount" so the player can accept a real discount code.` : "You are not sponsored by anyone; you simply help the player."}
Available offers you may extend this turn (include their ids in "offers" only if you actually mention them):
${offerList || "(none)"}
Reply with STRICT JSON only: {"text": "<1-3 short sentences, in character>", "offers": ["<offer id>", ...]}. Always include turnin offers if present.`;
}

async function llmReply(input: BrainInput): Promise<BrainOutput | null> {
  const sys = systemPrompt(input);
  const role = (h: { role: string }): "user" | "assistant" => (h.role === "npc" ? "assistant" : "user");
  const msgs: ChatMessage[] = [
    { role: "system", content: sys },
    ...input.history.slice(-8).map((h) => ({ role: role(h), content: h.text })),
    { role: "user", content: input.message || "(walks up and waves)" },
  ];
  const r = await chatWithFallback(
    msgs,
    { jsonMode: true, temperature: 0.8, maxTokens: 300 },
  );
  if (!r) return null;
  return parseBrainJson(r.text, input, "llm");
}

function parseBrainJson(raw: string, input: BrainInput, source: BrainOutput["source"]): BrainOutput | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const j = JSON.parse(match[0]);
    const valid = new Set(input.offers.map((o) => o.id));
    const offerIds = Array.isArray(j.offers) ? j.offers.filter((id: unknown) => typeof id === "string" && valid.has(id)) : [];
    for (const o of input.offers) if (o.type === "turnin" && !offerIds.includes(o.id)) offerIds.push(o.id);
    if (typeof j.text !== "string" || !j.text.trim()) return null;
    return { text: j.text.trim().slice(0, 600), offerIds, source };
  } catch {
    return null;
  }
}

// ---------- Remote agent (HTTP webhook) ----------
async function remoteReply(input: BrainInput): Promise<BrainOutput | null> {
  const { npc } = input;
  const res = await fetch(npc.webhookUrl!, {
    method: "POST",
    headers: { "content-type": "application/json", "x-grove-agent-key": npc.apiKey ?? "" },
    body: JSON.stringify({
      type: "conversation",
      npc: { id: npc.id, key: npc.key, name: npc.name, role: npc.role, persona: npc.persona },
      sponsor: input.sponsor ? { businessName: input.sponsor.businessName, pitch: input.sponsor.pitch, discountCode: input.sponsor.discountCode } : null,
      player: { id: input.character.id, name: input.character.name, level: input.character.level },
      message: input.message,
      history: input.history.slice(-10),
      offers: input.offers.map(({ id, type, label, line }) => ({ id, type, label, line })),
      world: { hour: input.hour, weather: input.weather },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const raw = await res.text();
  return parseBrainJson(raw, input, "remote");
}
