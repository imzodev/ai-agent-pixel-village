// Drizzle adapter for friends. Stores requests + canonical (lower,higher)
// friendships so the (a,b) pair is unique regardless of insert order.

import { and, eq, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { FriendRequest, FriendRequestStatus, Friendship, Presence } from "@/types/social";
import { characters, users } from "@/db/schema";
import { friendRequests, friendships } from "@/db/schema";

const TWO_MIN = 2 * 60_000;
const FIFTEEN_MIN = 15 * 60_000;

export class DrizzleFriendRepo {
  constructor(private db: NodePgDatabase) {}

  // --- requests ---
  async createRequest(fromUserId: number, toUserId: number): Promise<FriendRequest> {
    const [row] = await this.db
      .insert(friendRequests)
      .values({ fromUserId, toUserId, status: "pending" })
      .returning();
    return row as FriendRequest;
  }

  async listIncoming(userId: number): Promise<FriendRequest[]> {
    return (await this.db
      .select()
      .from(friendRequests)
      .where(and(eq(friendRequests.toUserId, userId), eq(friendRequests.status, "pending")))) as FriendRequest[];
  }

  async listOutgoing(userId: number): Promise<FriendRequest[]> {
    return (await this.db
      .select()
      .from(friendRequests)
      .where(and(eq(friendRequests.fromUserId, userId), eq(friendRequests.status, "pending")))) as FriendRequest[];
  }

  async findRequest(id: number): Promise<FriendRequest | null> {
    const [row] = await this.db.select().from(friendRequests).where(eq(friendRequests.id, id)).limit(1);
    return (row as FriendRequest | undefined) ?? null;
  }

  async resolveRequest(id: number, status: FriendRequestStatus): Promise<void> {
    await this.db
      .update(friendRequests)
      .set({ status, resolvedAt: new Date() })
      .where(eq(friendRequests.id, id));
  }

  // --- friendships ---
  private canonical(a: number, b: number): [number, number] {
    return a < b ? [a, b] : [b, a];
  }

  async addFriend(userA: number, userB: number): Promise<Friendship> {
    const [a, b] = this.canonical(userA, userB);
    const [row] = await this.db.insert(friendships).values({ userA: a, userB: b }).returning();
    return row as Friendship;
  }

  async listFriends(userId: number): Promise<number[]> {
    const rows = await this.db
      .select({ a: friendships.userA, b: friendships.userB })
      .from(friendships)
      .where(or(eq(friendships.userA, userId), eq(friendships.userB, userId)));
    return rows.map((r) => (r.a === userId ? r.b : r.a));
  }

  // --- presence ---
  async listPresence(userIds: number[]): Promise<Presence[]> {
    if (userIds.length === 0) return [];
    const rows = await this.db
      .select({
        userId: characters.userId,
        username: users.username,
        characterId: characters.id,
        characterName: characters.name,
        lastSeenAt: characters.lastSeenAt,
        x: characters.x,
        y: characters.y,
      })
      .from(characters)
      .innerJoin(users, eq(users.id, characters.userId))
      .where(sql`${characters.userId} = ANY(${userIds})`);
    return rows.map((r) => {
      const minutes = Math.floor((Date.now() - new Date(r.lastSeenAt).getTime()) / 60_000);
      let status: Presence["status"] = "offline";
      const since = Date.now() - new Date(r.lastSeenAt).getTime();
      if (since < TWO_MIN) status = "online";
      else if (since < FIFTEEN_MIN) status = "away";
      return {
        userId: r.userId,
        username: r.username,
        characterId: r.characterId,
        characterName: r.characterName,
        x: r.x,
        y: r.y,
        status,
        minutesSinceSeen: status === "offline" ? null : minutes,
      };
    });
  }

  /** Returns the username + character name for the given user ids (one query). */
  async usernamesFor(userIds: number[]): Promise<Map<number, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: characters.userId, name: characters.name })
      .from(characters)
      .where(sql`${characters.userId} = ANY(${userIds})`);
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** Username lookup used by the API route when listing friends. */
  async getUsername(userId: number): Promise<string | null> {
    const [row] = await this.db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
    return row?.username ?? null;
  }
}
