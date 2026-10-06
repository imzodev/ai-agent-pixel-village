// Trees players have chopped down ("vx,vy" lattice keys), shared by both
// terrain generators. src/lib/treesServer.ts keeps it in sync with the
// felled_trees table in every process. Anchored on globalThis: Next bundles
// its route handlers apart from src/server.ts, and both must see one set.

const g = globalThis as typeof globalThis & { __felledTrees?: ReadonlySet<string> };

export function setFelledTrees(keys: ReadonlySet<string>): void {
  g.__felledTrees = keys;
}

export function isFelled(vx: number, vy: number): boolean {
  const felled = g.__felledTrees;
  return !!felled && felled.size > 0 && felled.has(`${vx},${vy}`);
}
