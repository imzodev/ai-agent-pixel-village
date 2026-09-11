// Friend service. Owns the rules around requests, accept/decline, and
// canonical friendship pairs. Presence is computed on demand.

import type { CharacterRepository } from "@/types/ports";
import type { AnalyticsPort } from "@/types/ports";
import type { DrizzleFriendRepo } from "@/db/repos/friend";
import type { FriendRequest, FriendRequestStatus, Presence } from "@/types/social";

export class FriendService {
  constructor(
    private repo: DrizzleFriendRepo,
    private characters: CharacterRepository,
    private analytics: AnalyticsPort,
  ) {}

  async sendRequest(fromUserId: number, toUserId: number): Promise<FriendRequest> {
    if (fromUserId === toUserId) throw new Error("cannot friend self");
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

  async listIncoming(userId: number): Promise<FriendRequest[]> {
    return this.repo.listIncoming(userId);
  }

  async listFriendsWithPresence(userId: number): Promise<Presence[]> {
    const ids = await this.repo.listFriends(userId);
    return this.repo.listPresence(ids);
  }
}
