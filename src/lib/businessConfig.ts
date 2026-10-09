// Validation for a sponsor's business agent settings. Pure (no db): the
// PATCH route supplies the known place and item keys. Everything the sponsor
// types is clamped or refused here, so the mind can trust the stored config.
import type { BudgetPeriod, ShoppingRule } from "@/types/businessAgent";
import { cleanAgentText } from "@/lib/moderation";

export const PITCH_LINES_MAX = 5;
export const PITCH_LINE_CHARS = 140;
export const PATROL_MAX = 6;
export const SHOPPING_MAX = 5;
export const MAX_PRICE_CAP = 200;
export const PER_PERIOD_CAP = 20;
export const COOLDOWN_MIN = 60;
export const COOLDOWN_MAX = 1440;
export const DEFAULT_COOLDOWN_MIN = 360;

export type BusinessSettings = {
  pitchLines: string[];
  patrol: string[];
  shopping: ShoppingRule[];
  budgetCoins: number;
  budgetPeriod: BudgetPeriod;
  pitchCooldownMin: number;
  enabled: boolean;
};

export type SettingsContext = {
  placeKeys: ReadonlySet<string>;
  itemKeys: ReadonlySet<string>;
  /** Largest budget per day the server allows (env AGENT_BUDGET_MAX_DAILY). */
  budgetCapPerDay: number;
};

/** Only the fields present in `input` are returned, validated. */
export function validateSettings(input: Record<string, unknown>, ctx: SettingsContext): { ok: true; value: Partial<BusinessSettings> } | { ok: false; error: string } {
  const out: Partial<BusinessSettings> = {};

  if (input.pitchLines !== undefined) {
    if (!Array.isArray(input.pitchLines) || input.pitchLines.length > PITCH_LINES_MAX) return { ok: false, error: `pitchLines: up to ${PITCH_LINES_MAX} lines` };
    out.pitchLines = input.pitchLines.map((l) => cleanAgentText(String(l ?? ""), PITCH_LINE_CHARS)).filter(Boolean);
  }

  if (input.patrol !== undefined) {
    if (!Array.isArray(input.patrol) || input.patrol.length > PATROL_MAX) return { ok: false, error: `patrol: up to ${PATROL_MAX} places` };
    const keys = input.patrol.map(String);
    const unknown = keys.find((k) => !ctx.placeKeys.has(k));
    if (unknown) return { ok: false, error: `patrol: unknown place "${unknown}"` };
    out.patrol = [...new Set(keys)];
  }

  if (input.shopping !== undefined) {
    if (!Array.isArray(input.shopping) || input.shopping.length > SHOPPING_MAX) return { ok: false, error: `shopping: up to ${SHOPPING_MAX} items` };
    const rules: ShoppingRule[] = [];
    for (const r of input.shopping as Record<string, unknown>[]) {
      const itemKey = String(r?.itemKey ?? "");
      if (!ctx.itemKeys.has(itemKey)) return { ok: false, error: `shopping: unknown item "${itemKey}"` };
      const maxPrice = Math.floor(Number(r.maxPrice));
      const perPeriod = Math.floor(Number(r.perPeriod));
      if (!(maxPrice >= 1 && maxPrice <= MAX_PRICE_CAP)) return { ok: false, error: `shopping: maxPrice for ${itemKey} must be 1-${MAX_PRICE_CAP}` };
      if (!(perPeriod >= 1 && perPeriod <= PER_PERIOD_CAP)) return { ok: false, error: `shopping: perPeriod for ${itemKey} must be 1-${PER_PERIOD_CAP}` };
      rules.push({ itemKey, maxPrice, perPeriod });
    }
    out.shopping = rules;
  }

  if (input.budgetPeriod !== undefined) {
    if (input.budgetPeriod !== "day" && input.budgetPeriod !== "week") return { ok: false, error: "budgetPeriod: day or week" };
    out.budgetPeriod = input.budgetPeriod;
  }

  if (input.budgetCoins !== undefined) {
    const period = out.budgetPeriod ?? "day";
    const cap = ctx.budgetCapPerDay * (period === "week" ? 7 : 1);
    const coins = Math.floor(Number(input.budgetCoins));
    if (!(coins >= 0 && coins <= cap)) return { ok: false, error: `budgetCoins: 0-${cap} per ${period}` };
    out.budgetCoins = coins;
  }

  if (input.pitchCooldownMin !== undefined) {
    const m = Math.floor(Number(input.pitchCooldownMin));
    if (!(m >= COOLDOWN_MIN && m <= COOLDOWN_MAX)) return { ok: false, error: `pitchCooldownMin: ${COOLDOWN_MIN}-${COOLDOWN_MAX}` };
    out.pitchCooldownMin = m;
  }

  if (input.enabled !== undefined) out.enabled = input.enabled === true;

  return { ok: true, value: out };
}
