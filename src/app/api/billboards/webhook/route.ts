// Stripe webhook. Every paid thing (gems, sponsors, billboards) goes through
// one dispatcher, so this URL or /api/gems/webhook or /api/billboards/webhook
// can be the one registered in Stripe (src/lib/stripeWebhook.ts).
import { handleStripeWebhook } from "@/lib/stripeWebhook";

export const dynamic = "force-dynamic";
export const POST = handleStripeWebhook;
