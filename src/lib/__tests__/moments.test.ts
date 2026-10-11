// Moments: the milestones, what each card says, the X link, the dear-friend
// crossing, and the character layers shared by the game and the share cards.
import { describe, expect, it } from "vitest";
import { dearFriendMoment, lairBossMoment, levelMilestone, levelMoment, rootkingMoment, titleCase, xShareUrl } from "@/lib/moments";
import { lairBoss } from "@/lib/lairs";
import { becameDear } from "@/lib/mind/profile";
import { layersFor, tintPixels, weaponOf } from "@/lib/lpcLayers";
import type { Appearance } from "@/types/domain";

describe("moments", () => {
  it("cards every 5th level, only when it's crossed", () => {
    expect(levelMilestone(4, 5)).toBe(5);
    expect(levelMilestone(9, 12)).toBe(10);
    expect(levelMilestone(5, 6)).toBe(null);
    expect(levelMilestone(3, 4)).toBe(null);
    expect(levelMilestone(18, 26)).toBe(25); // the highest one crossed
    expect(levelMilestone(10, 10)).toBe(null);
    expect(levelMoment(20).headline).toBe("Level 20");
  });

  it("says what was beaten, where, and the legendary weapon if it dropped", () => {
    const giant = lairBoss("frost_giant")!;
    const plain = lairBossMoment(giant);
    expect(plain.headline).toBe("The Frost Giant felled");
    expect(plain.sub).toBe("in the Rime Hall · danger tier 6");
    expect(plain.extra).toBeUndefined();
    expect(plain.art).toEqual({ kind: "enemy", key: "frost_giant" });
    const lucky = lairBossMoment(giant, "glacier_blade");
    expect(lucky.extra).toBe("and claimed the Glacier Blade");
    expect(lucky.share).toContain("got the Glacier Blade");
    // A boss already named "the …" doesn't get a second "the".
    expect(lairBossMoment(lairBoss("the_hollow")!).headline).toBe("The Hollow felled");
    expect(rootkingMoment().art).toEqual({ kind: "enemy", key: "rootking" });
    expect(dearFriendMoment("Marigold", "village_marigold", "Village Baker").share).toContain("Marigold the village baker calls me a dear friend");
    expect(titleCase("drakefire_blade")).toBe("Drakefire Blade");
  });

  it("builds the X post link with the text and the moment's page", () => {
    const u = new URL(xShareUrl("I took down the Frost Giant & more", "https://g.example/m/abc"));
    expect(u.origin + u.pathname).toBe("https://x.com/intent/post");
    expect(u.searchParams.get("text")).toBe("I took down the Frost Giant & more");
    expect(u.searchParams.get("url")).toBe("https://g.example/m/abc");
  });

  it("marks the moment regard crosses into a dear friend, once", () => {
    expect(becameDear(9, 10)).toBe(true);
    expect(becameDear(5, 14)).toBe(true);
    expect(becameDear(10, 11)).toBe(false);
    expect(becameDear(3, 9)).toBe(false);
  });
});

describe("character layers (shared by the game and the share cards)", () => {
  const a: Appearance = { body: "female", skin: "#a86a3d", hair: "afro", hairColor: "#e8c14a", shirtColor: "#2a9d8f", pantsColor: "#7a4a2a" };

  it("stacks body, clothes, hair and the weapon in order", () => {
    const srcs = layersFor(a, undefined, "glacier_blade").map((l) => l.src);
    expect(srcs[0]).toBe("/lpc/weapon_dagger_behind.png");
    expect(srcs.slice(1, 4)).toEqual(["/lpc/body_female.png", "/lpc/head_female.png", "/lpc/eyes.png"]);
    expect(srcs.indexOf("/lpc/torso_female.png")).toBeLessThan(srcs.indexOf("/lpc/hair_afro.png"));
    expect(srcs.at(-1)).toBe("/lpc/weapon_dagger.png");
    expect(layersFor({ ...a, hair: "nope" }).some((l) => l.src === "/lpc/hair_plain.png")).toBe(true);
    expect(weaponOf(["herb", "glacier_blade"])).toBe("glacier_blade");
  });

  it("recolours like the game: skin scales the base tone, cloth follows luminance, outlines stay", () => {
    const px = Uint8Array.from([0xf1, 0xc9, 0xa5, 255, 0, 0, 0, 0]);
    tintPixels(px, "#a86a3d", "skin");
    expect([...px.slice(0, 3)]).toEqual([0xa8, 0x6a, 0x3d]); // the base skin becomes the tint exactly
    const cloth = Uint8Array.from([150, 150, 150, 255, 20, 20, 20, 255]);
    tintPixels(cloth, "#2a9d8f", "recolor");
    expect([...cloth.slice(0, 3)]).toEqual([0x2a, 0x9d, 0x8f]); // mid-grey maps onto the colour
    expect([...cloth.slice(4, 7)]).toEqual([20, 20, 20]); // a dark outline stays dark
  });
});
