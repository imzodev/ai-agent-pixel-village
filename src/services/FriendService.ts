// Friend service. Owns the rules around requests, accept/decline, and
// canonical friendship pairs. Presence is computed on demand.

import type { CharacterRepository } from "@/types/ports";
import type { AnalyticsPort } from "@/types/ports";
import type { DrizzleFriendRepo } from "@/db/repos/friend";
import type { BlockedPlayer, FriendRequest, FriendRequestStatus, OnlinePlayer, Presence } from "@/types/social";

export class FriendService {
  constructor(
    private repo: DrizzleFriendRepo,
    private characters: CharacterRepository,
    private analytics: AnalyticsPort,
  ) {}

  async sendRequest(fromUserId: number, toUserId: number): Promise<FriendRequest> {
    if (fromUserId === toUserId) throw new Error("cannot friend self");
    if (await this.repo.blockedEitherWay(fromUserId, toUserId)) throw new Error("cannot friend this player");
    if (await this.repo.areFriends(fromUserId, toUserId)) throw new Error("already friends");
    // They already asked you: asking back is the same as accepting.
    const theirs = await this.repo.findPending(toUserId, fromUserId);
    if (theirs) {
      await this.resolve(theirs.id, "accepted", fromUserId);
      return { ...theirs, status: "accepted" };
    }
    const mine = await this.repo.findPending(fromUserId, toUserId);
    if (mine) return mine;
    const req = await this.repo.createRequest(fromUserId, toUserId);
    this.analytics.track("friend_request_sent", { toUserId });
    return req;
  }

  /** Players connected right now that `userId` could add (not themselves, friends or blocked either way). */
  async listOnlineToAdd(userId: number): Promise<OnlinePlayer[]> {
    const [online, friendIds, incoming, outgoing] = await Promise.all([
      this.repo.listOnline(60),
      this.repo.listFriends(userId),
      this.repo.listIncoming(userId),
      this.repo.listOutgoing(userId),
    ]);
    const friends = new Set(friendIds);
    const asked = new Set(incoming.map((r) => r.fromUserId));
    const requested = new Set(outgoing.map((r) => r.toUserId));
    const out: OnlinePlayer[] = [];
    for (const p of online) {
      if (p.userId === userId || friends.has(p.userId)) continue;
      if (await this.repo.blockedEitherWay(userId, p.userId)) continue;
      out.push({ ...p, relation: asked.has(p.userId) ? "incoming" : requested.has(p.userId) ? "requested" : "none" });
    }
    return out;
  }

  async resolve(requestId: number, decision: "accepted" | "declined", byUserId: number): Promise<void> {
    const req = await this.repo.findRequest(requestId);
    if (!req) throw new Error("request not found");
    if (req.toUserId !== byUserId) throw new Error("only recipient can resolve");
    await this.repo.resolveRequest(requestId, decision);
    if (decision === "accepted") {
      await this.repo.addFriend(req.fromUserId, req.toUserId);
    }
    this.analytics.track("friend_request_resolved", { decision, requestId });
  }

  async removeFriend(userId: number, friendUserId: number): Promise<void> {
    await this.repo.removeFriend(userId, friendUserId);
  }

  /** Block the player with this character: unfriends them and drops pending requests either way. */
  async block(userId: number, characterId: number): Promise<void> {
    const other = await this.repo.userOfCharacter(characterId);
    if (other == null) throw new Error("player not found");
    if (other === userId) throw new Error("cannot block self");
    await this.repo.block(userId, other);
    await this.repo.removeFriend(userId, other);
    await this.repo.cancelRequestsBetween(userId, other);
    this.analytics.track("player_blocked", {});
  }

  async unblock(userId: number, blockedUserId: number): Promise<void> {
    await this.repo.unblock(userId, blockedUserId);
  }

  async listBlocked(userId: number): Promise<BlockedPlayer[]> {
    return this.repo.listBlocked(userId);
  }

  async listIncoming(userId: number): Promise<FriendRequest[]> {
    return this.repo.listIncoming(userId);
  }

  async listFriendsWithPresence(userId: number): Promise<Presence[]> {
    const ids = await this.repo.listFriends(userId);
    return this.repo.listPresence(ids);
  }
}
