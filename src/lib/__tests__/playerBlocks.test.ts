// Blocking a player (FriendService): it unfriends them, drops pending requests
// either way, and refuses new requests in both directions until unblocked.
import { describe, expect, it } from "vitest";
import { FriendService } from "@/services/FriendService";
import type { DrizzleFriendRepo } from "@/db/repos/friend";

function world() {
  const blocks = new Set<string>(), friends = new Set<string>(), requests: { from: number; to: number; status: string }[] = [];
  const pair = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const charUser: Record<number, number> = { 101: 1, 102: 2 };
  const repo = {
    userOfCharacter: async (c: number) => charUser[c] ?? null,
    block: async (a: number, b: number) => { blocks.add(`${a}>${b}`); },
    unblock: async (a: number, b: number) => { blocks.delete(`${a}>${b}`); },
    blockedEitherWay: async (a: number, b: number) => blocks.has(`${a}>${b}`) || blocks.has(`${b}>${a}`),
    removeFriend: async (a: number, b: number) => { friends.delete(pair(a, b)); },
    addFriend: async (a: number, b: number) => { friends.add(pair(a, b)); },
    cancelRequestsBetween: async (a: number, b: number) => {
      for (const r of requests) if (r.status === "pending" && pair(r.from, r.to) === pair(a, b)) r.status = "cancelled";
    },
    createRequest: async (from: number, to: number) => { const r = { from, to, status: "pending" }; requests.push(r); return r; },
  } as unknown as DrizzleFriendRepo;
  const service = new FriendService(repo, {} as never, { track: () => {} } as never);
  return { service, friends, requests, pair };
}

describe("blocking a player", () => {
  it("unfriends them and cancels pending requests", async () => {
    const w = world();
    w.friends.add(w.pair(1, 2));
    await w.service.sendRequest(2, 1);
    await w.service.block(1, 102);
    expect(w.friends.has(w.pair(1, 2))).toBe(false);
    expect(w.requests.every((r) => r.status === "cancelled")).toBe(true);
  });

  it("refuses requests both ways until unblocked", async () => {
    const w = world();
    await w.service.block(1, 102);
    await expect(w.service.sendRequest(2, 1)).rejects.toThrow();
    await expect(w.service.sendRequest(1, 2)).rejects.toThrow();
    await w.service.unblock(1, 2);
    await expect(w.service.sendRequest(2, 1)).resolves.toBeTruthy();
  });

  it("can't block yourself or nobody", async () => {
    const w = world();
    await expect(w.service.block(1, 101)).rejects.toThrow();
    await expect(w.service.block(1, 999)).rejects.toThrow();
  });
});
