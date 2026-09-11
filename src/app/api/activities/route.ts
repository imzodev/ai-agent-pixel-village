// Activities API. GET lists live activities. POST joins/leaves/submits.

import { NextResponse } from "next/server";
import { getContainer } from "@/lib/container";
import { requireCharacter, handleApiError } from "@/lib/auth";

export async function GET() {
  try {
    const c = getContainer();
    const list = await c.services.activity.listLive();
    return NextResponse.json({ activities: list });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ch = await requireCharacter();
    const body = (await req.json().catch(() => ({}))) as {
      action?: "join" | "leave" | "submit";
      activityId?: number;
      delta?: Record<string, unknown>;
    };
    if (!body.action || !body.activityId) {
      return NextResponse.json({ error: "action + activityId required" }, { status: 400 });
    }
    const c = getContainer();
    if (body.action === "join") await c.services.activity.join(body.activityId, ch.id);
    else if (body.action === "leave") await c.services.activity.leave(body.activityId, ch.id);
    else if (body.action === "submit") {
      const result = await c.services.activity.submitResult(body.activityId, ch.id, body.delta ?? {});
      return NextResponse.json({ ok: true, result });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
