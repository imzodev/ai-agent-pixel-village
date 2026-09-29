// Animal spritesheet registry: frame indexing and sheet consistency.

import { describe, expect, it } from "vitest";
import { ANIMAL_SPRITES, animKey, frameIndex } from "@/game/animalSprites";

describe("frameIndex", () => {
  it("keeps the fox's original frame mapping (up 0-2, right 3-5, down 6-8, left 9-11)", () => {
    const fox = ANIMAL_SPRITES.fox;
    const f = (dir: "up" | "right" | "down" | "left") => [0, 1, 2].map((i) => frameIndex(fox, "walk", dir, i));
    expect(f("up")).toEqual([0, 1, 2]);
    expect(f("right")).toEqual([3, 4, 5]);
    expect(f("down")).toEqual([6, 7, 8]);
    expect(f("left")).toEqual([9, 10, 11]);
  });

  it("puts the cow's eat block below its walk block", () => {
    const cow = ANIMAL_SPRITES.cow;
    expect(frameIndex(cow, "walk", "up", 0)).toBe(0);
    expect(frameIndex(cow, "walk", "right", 3)).toBe(15);
    expect(frameIndex(cow, "eat", "up", 0)).toBe(16);
    expect(frameIndex(cow, "eat", "right", 3)).toBe(31);
  });
});

describe("registry", () => {
  it("every species has a walk action and only maps states to known actions", () => {
    for (const def of Object.values(ANIMAL_SPRITES)) {
      expect(def.actions.walk).toBeDefined();
      for (const action of Object.values(def.stateActions)) expect(def.actions[action]).toBeDefined();
      for (const a of Object.values(def.actions)) expect(a.frames).toBeLessThanOrEqual(def.columns);
    }
  });

  it("puts the chicken's pecking block below its walk block", () => {
    const chicken = ANIMAL_SPRITES.chicken;
    expect(frameIndex(chicken, "walk", "down", 0)).toBe(8);
    expect(frameIndex(chicken, "eat", "up", 0)).toBe(16);
    expect(chicken.stateActions.graze).toBe("eat");
  });

  it("sheep graze with the eat block below the walk block", () => {
    const sheep = ANIMAL_SPRITES.sheep;
    expect(frameIndex(sheep, "eat", "left", 2)).toBe(22);
    expect(sheep.stateActions.graze).toBe("eat");
  });

  it("pigs graze with the eat block below the walk block", () => {
    const pig = ANIMAL_SPRITES.pig;
    expect(frameIndex(pig, "eat", "right", 0)).toBe(28);
    expect(pig.stateActions.graze).toBe("eat");
  });

  it("llamas graze with the eat block below the walk block", () => {
    const llama = ANIMAL_SPRITES.llama;
    expect(frameIndex(llama, "eat", "down", 1)).toBe(25);
    expect(llama.stateActions.graze).toBe("eat");
  });

  it("ducks dabble with the eat block below the walk block", () => {
    const duck = ANIMAL_SPRITES.duck;
    expect(frameIndex(duck, "eat", "left", 0)).toBe(20);
    expect(duck.stateActions.graze).toBe("eat");
  });

  it("rabbits nibble with the eat block below the hop block", () => {
    const rabbit = ANIMAL_SPRITES.rabbit;
    expect(frameIndex(rabbit, "walk", "down", 2)).toBe(10);
    expect(frameIndex(rabbit, "eat", "right", 3)).toBe(31);
    expect(rabbit.stateActions.graze).toBe("eat");
  });

  it("cats groom instead of grazing", () => {
    const cat = ANIMAL_SPRITES.cat;
    expect(cat.stateActions.graze).toBe("groom");
    expect(frameIndex(cat, "groom", "up", 0)).toBe(16);
    expect(animKey("cat", "groom", "left")).toBe("cr_cat_groom_left");
  });

  it("dogs sit instead of grazing", () => {
    const dog = ANIMAL_SPRITES.dog;
    expect(dog.stateActions.graze).toBe("sit");
    expect(frameIndex(dog, "sit", "down", 1)).toBe(25);
  });

  it("bats keep flapping while hovering (enemy rest state is walk)", () => {
    const bat = ANIMAL_SPRITES.bat;
    expect(bat.stateActions.walk).toBe("hover");
    expect(bat.actions.hover.block).toBe(bat.actions.walk.block);
    expect(bat.actions.hover.loop).toBe(true);
    expect(frameIndex(bat, "hover", "down", 3)).toBe(11);
  });

  it("cow grazes with the eat animation", () => {
    expect(ANIMAL_SPRITES.cow.stateActions.graze).toBe("eat");
    expect(animKey("cow", "eat", "left")).toBe("cr_cow_eat_left");
  });
});
