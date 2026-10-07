// When homestead lot rows open (pure). Each lot in the manifest has a `row`
// ("<kind>_<n>"); row 0 is the original lots and always open. When at least
// OPEN_AT of the open lots of a kind are owned, the next row of that kind
// (the lowest number not yet open) opens for everyone. Rows never close.
// The server side is src/lib/lotRowsServer.ts.

import { rowIndex } from "./lotDistricts";

/** Share of a kind's open lots that must be owned before its next row opens. */
export const OPEN_AT = 0.8;

/** Is this manifest entry in the world yet? (not a lot, row 0, or an opened row) */
export function entryIsOpen(e: { row?: string }, open: ReadonlySet<string>): boolean {
  return !e.row || rowIndex(e.row) === 0 || open.has(e.row);
}

/** The row of `kind` to open now, or null (not full enough, or none left). */
export function nextRowToOpen(
  kind: string,
  entries: readonly { key: string; kind: string; row?: string }[],
  open: ReadonlySet<string>,
  owned: ReadonlySet<string>,
): string | null {
  const mine = entries.filter((e) => e.kind === kind && e.row);
  const openLots = mine.filter((e) => entryIsOpen(e, open));
  if (!openLots.length) return null;
  if (openLots.filter((e) => owned.has(e.key)).length / openLots.length < OPEN_AT) return null;
  const closed = [...new Set(mine.filter((e) => !entryIsOpen(e, open)).map((e) => e.row!))].sort((a, b) => rowIndex(a) - rowIndex(b));
  return closed[0] ?? null;
}
