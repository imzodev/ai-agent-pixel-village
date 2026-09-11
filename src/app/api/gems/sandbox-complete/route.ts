// Sandbox completion (no Stripe configured). The StripeCheckoutAdapter
// redirects here when there's no STRIPE_SECRET_KEY; this route fulfills the
// purchase immediately so the app is usable without Stripe credentials.

import { NextResponse } from "next/server";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { GEM_PACKS } from "@/types/cosmetic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const description = url.searchParams.get("description") ?? "";
  // The metadata survives in the adapter's sandbox URL via `?metadata=...`;
  // but a cleaner path: read from a sandbox cookie set by the adapter.
  // For simplicity, accept `?packKey=` directly in the URL.
  const packKey = url.searchParams.get("packKey");
  const characterId = Number(url.searchParams.get("characterId"));
  if (!packKey || !characterId) {
    return NextResponse.redirect(new URL("/shop?purchase=invalid", req.url));
  }
  const pack = GEM_PACKS.find((p) => p.key === packKey);
  if (!pack) return NextResponse.redirect(new URL("/shop?purchase=invalid", req.url));
  await db
    .update(characters)
    .set({ gems: sql`gems + ${pack.gems}` })
    .where(eq(characters.id, characterId));
  return NextResponse.redirect(new URL(`/shop?purchase=ok&packKey=${pack.key}`, req.url));
}

// Re-export the description for typecheck visibility.
export const _descriptionPlaceholder = (d: string) => d;
