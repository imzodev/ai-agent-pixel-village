// Friends + presence. Server-authoritative; client polls via the existing
// /api/world snapshot.

export type FriendRequestStatus = "pending" | "accepted" | "declined" | "cancelled";

export type FriendRequest = {
  id: number;
  fromUserId: number;
  toUserId: number;
  status: FriendRequestStatus;
  createdAt: Date;
  resolvedAt: Date | null;
};

export type Friendship = {
  /** Lower user id, always. */
  userA: number;
  /** Higher user id, always. */
  userB: number;
  createdAt: Date;
};

export type Presence = {
  userId: number;
  characterId: number;
  username: string;
  characterName: string;
  x: number;
  y: number;
  /** "online" if lastSeenAt < 2 min, "away" if < 15 min, else "offline". */
  status: "online" | "away" | "offline";
  /** Minutes since last heartbeat; null if offline. */
  minutesSinceSeen: number | null;
};
