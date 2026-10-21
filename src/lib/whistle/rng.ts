// Whistle's random numbers: the same on every engine (integer maths only),
// so a run replays exactly in any browser and on the server.

/** A string's 32-bit FNV-1a hash (a day key → a seed). */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: the next state after `a`. */
export const nextState = (a: number): number => (a + 0x6d2b79f5) | 0;

/** mulberry32: the number in [0, 1) a state gives. */
export function stateValue(a: number): number {
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A generator for one-off use (building a course). */
export function makeRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = nextState(a);
    return stateValue(a);
  };
}
