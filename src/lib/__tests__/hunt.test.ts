// Hunting enemies (wolves): chase a nearby player within the leash, stop a
// tile short, never outrun the beat, and leave a running move alone.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} })); // moveStore's writer isn't used here

import { HUNT_MAX_TILES, huntTarget, planHunt } from "@/lib/hunt";
import { HUNT_RADIUS_PX, HUNT_SPEED, WORLD_TICK_MS } from "@/lib/constants";
import { moveDurationMs, moveDestination, tileCenter } from "@/lib/motion";
import { ENEMY_KINDS, ENEMY_ZONES } from "@/lib/progression";

const T = 16;
const open = async () => true;
const zone = { x: -50 * T, y: -50 * T, w: 100 * T, h: 100 * T };
const at = (tx: number, ty: number) => tileCenter({ tx, ty });
const wolf = (tx: number, ty: number, extra = {}) => ({ id: 7, ...at(tx, ty), movePath: null, moveStartAt: null, moveSpeed: null, ...extra });
const START = 1_000_000;

describe("wolf data", () => {
  it("wolves hunt, and live in Whisperwood", () => {
    expect(ENEMY_KINDS.wolf.hunts).toBe(true);
    expect(ENEMY_ZONES.find((z) => z.name === "whisperwood")!.kinds.wolf).toBeGreaterThan(0);
  });
  it("a chase leg always ends before the next beat", () => {
    expect((HUNT_MAX_TILES * T * 1000) / HUNT_SPEED).toBeLessThan(WORLD_TICK_MS);
  });
});

describe("huntTarget", () => {
  it("picks the nearest player within range and leash", () => {
    const from = at(0, 0);
    expect(huntTarget(from, [at(20, 0)], zone)).toBeNull(); // too far
    expect(huntTarget(from, [at(6, 0), at(3, 0)], zone)).toEqual(at(3, 0));
    const tiny = { x: -T, y: -T, w: 2 * T, h: 2 * T };
    expect(huntTarget(from, [at(7, 0)], tiny)).toBeNull(); // past the leash
    expect(HUNT_RADIUS_PX).toBeGreaterThanOrEqual(6 * T);
  });
});

describe("planHunt", () => {
  it("runs at the player and stops a tile short", async () => {
    const w = await planHunt(wolf(0, 0), [at(5, 0)], zone, START, open);
    expect(w).not.toBeNull();
    expect(w!.move.startAt).toBe(START);
    expect(w!.move.speed).toBe(HUNT_SPEED);
    expect(w!.move.after).toBe("hunt");
    expect(moveDestination(w!.move)).toEqual({ tx: 4, ty: 0 });
    expect(moveDurationMs(w!.move)).toBeLessThan(WORLD_TICK_MS);
  });
  it("ignores players out of reach", async () => {
    expect(await planHunt(wolf(0, 0), [at(30, 0)], zone, START, open)).toBeNull();
  });
  it("stands its ground when already at the player's heels", async () => {
    const w = await planHunt(wolf(0, 0), [at(1, 0)], zone, START, open);
    expect(moveDestination(w!.move)).toEqual({ tx: 0, ty: 0 });
  });
  it("leaves a move that is still running alone", async () => {
    const busy = wolf(3, 0, { movePath: [{ tx: 0, ty: 0 }, { tx: 3, ty: 0 }], moveStartAt: START - 100, moveSpeed: 1 });
    expect(await planHunt(busy, [at(5, 0)], zone, START, open)).toBeNull();
  });
  it("replaces a wander queued for the same beat, starting where it would have", async () => {
    const queued = wolf(0, 3, { movePath: [{ tx: 0, ty: 0 }, { tx: 0, ty: 3 }], moveStartAt: START, moveSpeed: 22 });
    const w = await planHunt(queued, [at(-4, 0)], zone, START, open);
    expect(w!.move.path[0]).toEqual({ tx: 0, ty: 0 });
    expect(moveDestination(w!.move)).toEqual({ tx: -3, ty: 0 });
  });
});
