// Friend service. Owns the rules around requests, accept/decline, and
// canonical friendship pairs. Presence is computed on demand.

import type { CharacterRepository } from "@/types/ports";
import type { AnalyticsPort } from "@/types/ports";
import type { DrizzleFriendRepo } from "@/db/repos/friend";
import type { BlockedPlayer, FriendRequest, FriendRequestStatus, Presence } from "@/types/social";

export class FriendService {
  constructor(
    private repo: DrizzleFriendRepo,
    private characters: CharacterRepository,
    private analytics: AnalyticsPort,
  ) {}

  async sendRequest(fromUserId: number, toUserId: number): Promise<FriendRequest> {
    if (fromUserId === toUserId) throw new Error("cannot friend self");
    if (await this.repo.blockedEitherWay(fromUserId, toUserId)) throw new Error("cannot friend this player");
    const req = await this.repo.createRequest(fromUserId, toUserId);
    this.analytics.track("friend_request_sent", { toUserId });
    return req;
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
