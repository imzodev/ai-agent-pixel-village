// A daily cap on LLM calls (per process: the web server and tickd each keep
// their own). Past it, chat and mind lines fall back to the scripted brain,
// so a surge of players (or a runaway loop) can't run up the bill. The count
// resets at midnight UTC. LLM_DAILY_MAX sets it (default 20,000; 0 = no cap).

/** A budget of `max` takes per UTC day; `take(now)` spends one if any are left. */
export function makeDailyBudget(max: number) {
  let day = "";
  let used = 0;
  let warned = false;
  return {
    take(nowMs = Date.now()): boolean {
      if (max <= 0) return true;
      const today = new Date(nowMs).toISOString().slice(0, 10);
      if (today !== day) { day = today; used = 0; warned = false; }
      if (used >= max) {
        if (!warned) { warned = true; console.warn(`[llm] daily budget of ${max} calls used up: scripted replies until midnight UTC`); }
        return false;
      }
      used++;
      return true;
    },
    used: () => used,
  };
}

const envMax = Number(process.env.LLM_DAILY_MAX ?? 20_000);
export const llmBudget = makeDailyBudget(Number.isFinite(envMax) ? envMax : 20_000);
