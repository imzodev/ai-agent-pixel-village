// Gem service. Encapsulates the rules for purchasing/spending gems so route
// handlers stay thin. Depends on port interfaces (no Drizzle/Stripe imports).

import type { CharacterRepository, CheckoutPort } from "@/types/ports";
import type { AnalyticsPort } from "@/types/ports";
import type { DrizzleGemRepo } from "@/db/repos/gem";
import { GEM_PACKS, type GemPack, type GemPackKey } from "@/types/cosmetic";

export class GemService {
  constructor(
    private characters: CharacterRepository,
    private gems: DrizzleGemRepo,
    private checkout: CheckoutPort,
    private analytics: AnalyticsPort,
  ) {}

  getPacks(): readonly GemPack[] {
    return GEM_PACKS;
  }

  /** Returns the checkout URL the client should redirect to. */
  async startCheckout(input: { characterId: number; packKey: GemPackKey; userId?: number }): Promise<{ url: string }> {
    const pack = GEM_PACKS.find((p) => p.key === input.packKey);
    if (!pack) throw new Error(`unknown pack ${input.packKey}`);
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const session = await this.checkout.createCheckoutSession({
      amountCents: pack.priceCents,
      currency: "usd",
      description: `${pack.gems} gems`,
      metadata: { characterId: String(input.characterId), packKey: pack.key, gems: String(pack.gems) },
      successUrl: `${base}/shop?purchase=ok`,
      cancelUrl: `${base}/shop?purchase=cancel`,
    });
    this.analytics.track("gem_checkout_started", { packKey: pack.key, characterId: input.characterId }, input.userId);
    return { url: session.url };
  }

  /** Fulfill a Stripe webhook (or sandbox callback) by crediting the gems. */
  async fulfill(input: { characterId: number; packKey: GemPackKey; stripeSessionId: string | null; userId?: number }): Promise<{ balance: number }> {
    const pack = GEM_PACKS.find((p) => p.key === input.packKey);
    if (!pack) throw new Error(`unknown pack ${input.packKey}`);
    const res = await this.gems.credit(input.characterId, pack.gems, "purchase", input.packKey, input.stripeSessionId);
    this.analytics.track(
      "gem_purchase_fulfilled",
      { packKey: input.packKey, gems: pack.gems, balance: res.balance },
      input.userId,
    );
    return res;
  }

  /** Spend gems. Returns the new balance or throws if insufficient. */
  async spend(input: { characterId: number; amount: number; source?: "spend"; userId?: number }): Promise<{ balance: number }> {
    if (input.amount <= 0) throw new Error("amount must be positive");
    const res = await this.gems.debit(input.characterId, input.amount, input.source ?? "spend");
    if (!res.ok) throw new Error("insufficient gems");
    this.analytics.track("gem_spend", { amount: input.amount, balance: res.balance }, input.userId);
    return { balance: res.balance };
  }

  async getBalance(characterId: number): Promise<number> {
    return this.gems.getBalance(characterId);
  }
}
