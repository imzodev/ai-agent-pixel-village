// A fixed-size, direct-mapped cache for pure per-corner terrain fields
// (elevation, moisture, biome). Generating one tile reads the same corners
// many times over (neighbour masks, forest and water checks), so caching
// them turns a chunk from tens of milliseconds into a few. Bounded memory
// (2^bits slots) whatever the world's size; a collision just recomputes.

export function memoXY<T extends number>(fn: (x: number, y: number) => T, bits = 18): (x: number, y: number) => T {
  const size = 1 << bits, mask = size - 1;
  const kx = new Float64Array(size).fill(NaN), ky = new Float64Array(size), val = new Float64Array(size);
  return (x: number, y: number): T => {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return fn(x, y);
    const i = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) & mask;
    if (kx[i] === x && ky[i] === y) return val[i] as T;
    const v = fn(x, y);
    kx[i] = x; ky[i] = y; val[i] = v;
    return v;
  };
}
