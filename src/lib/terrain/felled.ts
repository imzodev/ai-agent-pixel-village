// Trees players have chopped down ("vx,vy" lattice keys), shared by both
// terrain generators. src/lib/treesServer.ts keeps it in sync with the
// felled_trees table in every process.

let felled: ReadonlySet<string> = new Set();

export function setFelledTrees(keys: ReadonlySet<string>): void {
  felled = keys;
}

export function isFelled(vx: number, vy: number): boolean {
  return felled.size > 0 && felled.has(`${vx},${vy}`);
}
