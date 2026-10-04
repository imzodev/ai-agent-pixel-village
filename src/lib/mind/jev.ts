// Jev (TypeSafe System One): send a state and typed questions, get typed
// answers with probabilities and confidence. One call answers every
// question in parallel. Never throws: no key, a timeout, a bad answer →
// null, and the caller falls back to its scripted policy.
//
//   POST https://api.typesafe.ai/v1/systemone   Authorization: Bearer <key>

import type { JevAnswers, JevQuestion } from "@/types/mind";

const URL = process.env.TYPESAFE_BASE_URL ?? "https://api.typesafe.ai/v1/systemone";
export const JEV_TIMEOUT_MS = 3000;

export function jevEnabled(): boolean {
  return !!process.env.TYPESAFE_API_KEY;
}

/** Parse a response body into choices and scores (unknown shapes are dropped). */
export function parseJev(body: unknown): JevAnswers | null {
  const answers = (body as { answers?: Record<string, Record<string, unknown>> } | null)?.answers;
  if (!answers || typeof answers !== "object") return null;
  const out: JevAnswers = { choices: {}, scores: {} };
  for (const [name, a] of Object.entries(answers)) {
    const probabilities = (a.probabilities ?? {}) as Record<string, number>;
    const confidence = typeof a.confidence === "number" ? a.confidence : 0;
    if (a.type === "choice" && typeof a.choice === "string") out.choices[name] = { choice: a.choice, confidence, probabilities };
    else if (a.type === "score" && typeof a.score === "number") out.scores[name] = { score: a.score, confidence, probabilities };
  }
  return out;
}

/** Ask Jev. Returns null on any failure. */
export async function askJev(state: string, questions: Record<string, JevQuestion>, fetchImpl: typeof fetch = fetch): Promise<JevAnswers | null> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), JEV_TIMEOUT_MS);
  try {
    const res = await fetchImpl(URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ state, model: process.env.TYPESAFE_MODEL ?? "jev-latest", questions }),
      signal: ctl.signal,
    });
    if (!res.ok) { console.warn(`[jev] HTTP ${res.status}`); return null; }
    return parseJev(await res.json());
  } catch (e) {
    console.warn("[jev]", e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
