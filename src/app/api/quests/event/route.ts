// POST /api/quests/event — gameplay events flow through here so progress
// is tracked server-side. Idempotent and rate-limited by the service.

import { NextResponse } from "next/server";
import { getContainer } from "@/lib/container";
import { requireCharacter, handleApiError } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const ch = await requireCharacter();
    const body = (await req.json().catch(() => ({}))) as {
      kind?: "collect" | "pet" | "talk" | "visit" | "spend_coins";
      payload?: Record<string, number | string>;
    };
    if (!body.kind) return NextResponse.json({ error: "kind required" }, { status: 400 });
    const c = getContainer();
    const updated = await c.services.quest.recordEvent(ch.id, { kind: body.kind, payload: body.payload ?? {} });
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return handleApiError(e);
  }
}
