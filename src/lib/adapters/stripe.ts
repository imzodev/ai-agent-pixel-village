// Stripe adapter. Implements the segregated ports (CheckoutPort,
// SubscriptionPort, RefundPort) with the project's existing Stripe
// dependency. Falls back to no-op URLs in sandbox mode (no STRIPE_SECRET_KEY).

import Stripe from "stripe";
import type { CheckoutInput, SubscriptionInput, CheckoutPort, SubscriptionPort, RefundPort } from "@/types/ports";

export class StripeCheckoutAdapter implements CheckoutPort, SubscriptionPort, RefundPort {
  private stripe: Stripe | null;
  private publicBase: string;

  constructor() {
    const key = process.env.STRIPE_SECRET_KEY;
    this.stripe = key ? new Stripe(key) : null;
    this.publicBase = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  }

  async createCheckoutSession(input: CheckoutInput): Promise<{ url: string; sessionId: string }> {
    if (!this.stripe) {
      // Sandbox mode: pretend the purchase succeeded by returning a URL that
      // completes the local webhook flow.
      const md = input.metadata ?? {};
      const params = new URLSearchParams({
        amount: String(input.amountCents),
        description: input.description,
        ...(md.packKey ? { packKey: md.packKey } : {}),
        ...(md.characterId ? { characterId: md.characterId } : {}),
      });
      return {
        url: `${this.publicBase}/api/gems/sandbox-complete?${params.toString()}`,
        sessionId: `sandbox_${Date.now()}`,
      };
    }
    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: input.currency,
            product_data: { name: input.description },
            unit_amount: input.amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: input.metadata,
    });
    return { url: session.url ?? "", sessionId: session.id };
  }

  async createSubscription(input: SubscriptionInput): Promise<{ url: string; subscriptionId: string }> {
    if (!this.stripe) {
      return {
        url: `${this.publicBase}/api/sponsors/sandbox-complete?email=${encodeURIComponent(input.customerEmail)}`,
        subscriptionId: `sandbox_sub_${Date.now()}`,
      };
    }
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: input.priceId, quantity: 1 }],
      customer_email: input.customerEmail,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: input.metadata,
    });
    return { url: session.url ?? "", subscriptionId: session.id };
  }

  async cancelSubscription(id: string): Promise<void> {
    if (!this.stripe) return;
    await this.stripe.subscriptions.cancel(id);
  }

  async refundPaymentIntent(intentId: string, amountCents?: number): Promise<void> {
    if (!this.stripe) return;
    await this.stripe.refunds.create({ payment_intent: intentId, amount: amountCents });
  }
}
