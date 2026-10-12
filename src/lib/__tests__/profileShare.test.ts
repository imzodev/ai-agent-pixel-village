import { describe, expect, it } from "vitest";
import { profileShareText, shareSeed } from "@/lib/profileShare";
import type { Profile } from "@/types/profile";

function profile(over: Partial<Profile> = {}): Profile {
  return {
    username: "clover",
    look: { name: "Clover", level: 14, title: null, appearance: {} as Profile["look"]["appearance"], cosmetics: {} as Profile["look"]["cosmetics"] },
    memberSince: new Date(0),
    lastSeen: new Date(0),
    trophies: [],
    collectionPct: 10,
    achievements: [],
    bookPages: [],
    book: {
      fishCaught: 0, rareFish: [], creaturesBeaten: 0, toughest: [], towns: { visited: 1, total: 20 },
      places: { visited: 0, total: 0 }, folk: { met: 0, total: 0 }, cropsHarvested: 0, chestsDug: 0, lostCache: false,
    },
    reputation: [], lots: [], farmLevel: null, relicSets: [], dearFriends: [], moments: [],
    ...over,
  };
}

const proud = profile({
  book: { ...profile().book, toughest: [{ name: "Frost Giant", icon: "🧊", note: "boss" }], rareFish: [{ name: "Moonkoi", icon: "🐟", note: "legendary" }] },
  dearFriends: [{ key: "village_marigold", name: "Marigold", role: "Baker" }],
});

const SEEDS = [0, 1, 2, 3, 4, 5];

describe("profile share text", () => {
  it("leads with the best two things, in the player's voice", () => {
    for (const seed of SEEDS) {
      const t = profileShareText(proud, true, seed);
      expect(t).toContain("I took down the Frost Giant");
      expect(t).toContain("Marigold the baker calls me a dear friend now");
      expect(t).not.toContain("Moonkoi"); // only the top two
      expect(t).toMatch(/AI/);
    }
  });

  it("talks about the player when someone else shares", () => {
    for (const seed of SEEDS) {
      const t = profileShareText(proud, false, seed);
      expect(t).toContain("Clover");
      expect(t).toContain("calls them a dear friend");
      expect(t).not.toMatch(/\bI\b|\bme\b/);
    }
  });

  it("still has something to say for a brand-new player", () => {
    for (const seed of SEEDS) {
      const t = profileShareText(profile({ look: { ...proud.look, level: 3 } }), true, seed);
      expect(t).toContain("Level 3 so far");
      expect(t).toMatch(/AI/);
    }
  });

  it("never sounds like an ad", () => {
    for (const seed of SEEDS) for (const own of [true, false]) for (const p of [proud, profile()]) {
      const t = profileShareText(p, own, seed);
      expect(t).not.toMatch(/👇|[Nn]o download|\?|!|[Ff]ree/);
    }
  });

  it("gives the same text for the same seed, and varies across days", () => {
    expect(profileShareText(proud, true, 7)).toBe(profileShareText(proud, true, 7));
    const days = new Set(Array.from({ length: 8 }, (_, d) => profileShareText(proud, true, shareSeed("clover", d * 86_400_000))));
    expect(days.size).toBeGreaterThan(1);
  });

  it("always leaves room for the link", () => {
    const long = "X".repeat(120);
    for (const seed of SEEDS) for (const own of [true, false]) {
      const t = profileShareText(profile({
        look: { ...proud.look, name: long, title: long },
        book: { ...proud.book, toughest: [{ name: long, icon: "", note: "boss" }] },
        dearFriends: [{ key: "k", name: long, role: long }],
      }), own, seed);
      expect(t.length).toBeLessThanOrEqual(280 - 24);
    }
  });
});
