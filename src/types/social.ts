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

/** Someone the player blocked (GET /api/friends). */
export type BlockedPlayer = {
  userId: number;
  characterId: number | null;
  characterName: string | null;
};

/** A connected player you could add (GET /api/friends `online`). */
export type OnlinePlayer = {
  userId: number;
  characterId: number;
  username: string;
  characterName: string;
  level: number;
  /** Your relationship to them: nothing yet, you asked, or they asked you. */
  relation: "none" | "requested" | "incoming";
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
