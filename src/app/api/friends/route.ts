// Friends API. GET lists requests + friends + presence + who you blocked.
// POST sends/accepts/declines a request, removes a friend, blocks or unblocks a player.

import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { characters, friendRequests, users } from "@/db/schema";
import { getContainer } from "@/lib/container";
import { getCurrentUser, handleApiError } from "@/lib/auth";
import { voiceBlocksChanged } from "@/lib/voiceServer";

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const c = getContainer();
    const [incoming, outgoing, friends, blocked, online] = await Promise.all([
      c.services.friend.listIncoming(me.id),
      db
        .select()
        .from(friendRequests)
        .where(eq(friendRequests.fromUserId, me.id)),
      c.services.friend.listFriendsWithPresence(me.id),
      c.services.friend.listBlocked(me.id),
      c.services.friend.listOnlineToAdd(me.id),
    ]);
    // Decorate incoming with fromUsername + characterName
    const fromIds = incoming.map((r) => r.fromUserId);
    const usernames = fromIds.length
      ? await db
          .select({ userId: users.id, username: users.username, characterName: characters.name })
          .from(users)
          .leftJoin(characters, eq(characters.userId, users.id))
          .where(inArray(users.id, fromIds))
      : [];
    const byId = new Map(usernames.map((u) => [u.userId, u]));
    return NextResponse.json({
      incoming: incoming.map((r) => ({ ...r, from: byId.get(r.fromUserId) ?? null })),
      outgoing,
      friends,
      blocked,
      online,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as {
      action: "send" | "accept" | "decline" | "remove" | "block" | "unblock";
      toUserId?: number;
      requestId?: number;
      userId?: number;
      characterId?: number;
    };
    const c = getContainer();
    if (body.action === "send") {
      if (!body.toUserId) return NextResponse.json({ error: "toUserId required" }, { status: 400 });
      const r = await c.services.friend.sendRequest(me.id, body.toUserId);
      return NextResponse.json({ ok: true, request: r });
    }
    if (body.action === "accept" || body.action === "decline") {
      if (!body.requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 });
      await c.services.friend.resolve(body.requestId, body.action === "accept" ? "accepted" : "declined", me.id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "remove" || body.action === "unblock") {
      if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
      if (body.action === "remove") await c.services.friend.removeFriend(me.id, body.userId);
      else {
        await c.services.friend.unblock(me.id, body.userId);
        voiceBlocksChanged(me.id, { userId: body.userId }, false);
      }
      return NextResponse.json({ ok: true });
    }
    if (body.action === "block") {
      if (!body.characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 });
      await c.services.friend.block(me.id, body.characterId);
      voiceBlocksChanged(me.id, { characterId: body.characterId }, true); // out of voice with them within a second
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return handleApiError(e);
  }
}
