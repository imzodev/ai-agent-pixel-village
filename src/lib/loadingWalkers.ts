// The farm animals that may walk the loading screen's bar (one at random per
// visit, picked by the page on the server so the first render and the
// browser agree). Keys of ANIMAL_SPRITES (src/game/animalSprites.ts).

export const LOADING_WALKERS = ["cow", "pig", "sheep", "llama", "chicken", "duck", "rabbit", "cat", "dog"] as const;

/** One of the walkers, at random. */
export const randomLoadingWalker = (): string => LOADING_WALKERS[Math.floor(Math.random() * LOADING_WALKERS.length)];
