// Drizzle adapter for friends. Stores requests + canonical (lower,higher)
// friendships so the (a,b) pair is unique regardless of insert order.

import { and, desc, eq, gt, inArray, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { BlockedPlayer, FriendRequest, FriendRequestStatus, Friendship, Presence } from "@/types/social";
import { characters, users } from "@/db/schema";
import { friendRequests, friendships, playerBlocks } from "@/db/schema";

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

  async removeFriend(userA: number, userB: number): Promise<void> {
    const [a, b] = this.canonical(userA, userB);
    await this.db.delete(friendships).where(and(eq(friendships.userA, a), eq(friendships.userB, b)));
  }

  /** Pending requests either way between two users become "cancelled". */
  async cancelRequestsBetween(userA: number, userB: number): Promise<void> {
    await this.db
      .update(friendRequests)
      .set({ status: "cancelled", resolvedAt: new Date() })
      .where(and(
        eq(friendRequests.status, "pending"),
        or(
          and(eq(friendRequests.fromUserId, userA), eq(friendRequests.toUserId, userB)),
          and(eq(friendRequests.fromUserId, userB), eq(friendRequests.toUserId, userA)),
        ),
      ));
  }

  // --- blocks ---
  async block(blockerUserId: number, blockedUserId: number): Promise<void> {
    await this.db.insert(playerBlocks).values({ blockerUserId, blockedUserId }).onConflictDoNothing();
  }

  async unblock(blockerUserId: number, blockedUserId: number): Promise<void> {
    await this.db.delete(playerBlocks).where(and(eq(playerBlocks.blockerUserId, blockerUserId), eq(playerBlocks.blockedUserId, blockedUserId)));
  }

  /** Whether either of the two blocked the other. */
  async blockedEitherWay(userA: number, userB: number): Promise<boolean> {
    const [row] = await this.db
      .select({ a: playerBlocks.blockerUserId })
      .from(playerBlocks)
      .where(or(
        and(eq(playerBlocks.blockerUserId, userA), eq(playerBlocks.blockedUserId, userB)),
        and(eq(playerBlocks.blockerUserId, userB), eq(playerBlocks.blockedUserId, userA)),
      ))
      .limit(1);
    return !!row;
  }

  async listBlocked(userId: number): Promise<BlockedPlayer[]> {
    return this.db
      .select({ userId: playerBlocks.blockedUserId, characterId: characters.id, characterName: characters.name })
      .from(playerBlocks)
      .leftJoin(characters, eq(characters.userId, playerBlocks.blockedUserId))
      .where(eq(playerBlocks.blockerUserId, userId));
  }

  async userOfCharacter(characterId: number): Promise<number | null> {
    const [row] = await this.db.select({ userId: characters.userId }).from(characters).where(eq(characters.id, characterId)).limit(1);
    return row?.userId ?? null;
  }

  async areFriends(userA: number, userB: number): Promise<boolean> {
    const [a, b] = this.canonical(userA, userB);
    const [row] = await this.db
      .select({ a: friendships.userA })
      .from(friendships)
      .where(and(eq(friendships.userA, a), eq(friendships.userB, b)))
      .limit(1);
    return !!row;
  }

  /** The pending request from one user to another, if any. */
  async findPending(fromUserId: number, toUserId: number): Promise<FriendRequest | null> {
    const [row] = await this.db
      .select()
      .from(friendRequests)
      .where(and(
        eq(friendRequests.fromUserId, fromUserId),
        eq(friendRequests.toUserId, toUserId),
        eq(friendRequests.status, "pending"),
      ))
      .limit(1);
    return (row as FriendRequest | undefined) ?? null;
  }

  // --- presence ---
  /** Characters seen in the last two minutes, most recent first (the caller filters out friends, blocks, itself). */
  async listOnline(limit: number): Promise<{ userId: number; characterId: number; username: string; characterName: string; level: number }[]> {
    return this.db
      .select({
        userId: characters.userId,
        characterId: characters.id,
        username: users.username,
        characterName: characters.name,
        level: characters.level,
      })
      .from(characters)
      .innerJoin(users, eq(users.id, characters.userId))
      .where(gt(characters.lastSeenAt, new Date(Date.now() - TWO_MIN)))
      .orderBy(desc(characters.lastSeenAt))
      .limit(limit);
  }

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
      .where(inArray(characters.userId, userIds));
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
      .where(inArray(characters.userId, userIds));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** Username lookup used by the API route when listing friends. */
  async getUsername(userId: number): Promise<string | null> {
    const [row] = await this.db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
    return row?.username ?? null;
  }
}
