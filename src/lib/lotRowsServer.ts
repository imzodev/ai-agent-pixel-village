// Homestead lot rows opening (rules: src/lib/lotRows.ts). Which rows are
// open lives in `lot_rows`; each process keeps the set in memory and
// re-reads it at most once a minute (on globalThis, so the Next routes and
// src/server.ts in one process agree). When a kind's open lots fill up, the
// next row opens: its building and lot rows are created, a world event is
// logged, and every reader of the manifest (getBuildingsManifest) sees the
// new lots; the WS server tells clients to stamp them.

import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { lotRows, lots } from "@/db/schema";
import { logEvent } from "@/lib/game";
import { getAllBuildingsManifest, upsertBuildingRow } from "./buildingsServer";
import { upsertLotRow } from "./lots";
import { nextRowToOpen } from "./lotRows";
import { rowIndex, rowKind } from "./lotDistricts";

const REFRESH_MS = 60_000;
const LOT_KINDS = ["land", "ranch", "vineyard", "workshop", "orchard"] as const;
const LABEL: Record<string, string> = { land: "plots", ranch: "ranches", vineyard: "vineyards", workshop: "workshops", orchard: "orchards" };
const WHERE: Record<string, string> = { land: "south of the village farms", ranch: "south of the village farms", vineyard: "south of the village farms", workshop: "south of Hollowmere", orchard: "south of the village farms" };

const g = globalThis as typeof globalThis & { __lotRows?: { open: Set<string>; at: number; version: number } };
const state = (g.__lotRows ??= { open: new Set(), at: 0, version: 0 });

/** The rows open now (beyond each kind's row 0). */
export async function openRows(now = Date.now()): Promise<ReadonlySet<string>> {
  if (now - state.at >= REFRESH_MS) {
    state.at = now;
    const rows = new Set((await db.select({ row: lotRows.row }).from(lotRows)).map((r) => r.row));
    if (rows.size !== state.open.size || [...rows].some((r) => !state.open.has(r))) {
      state.open = rows;
      state.version++;
    }
  }
  return state.open;
}

/** Read the open rows now (not waiting out the minute). */
export async function refreshOpenRows(): Promise<ReadonlySet<string>> {
  state.at = 0;
  return openRows();
}

/** Changes whenever the set of open rows does (caches key on it). */
export const openRowsVersion = (): number => state.version;

/** A short stamp of the open rows, for map-tile caches. */
export const openRowsSig = (): string => [...state.open].sort().join(",");

/** Open the next row of each kind whose open lots are full enough. Returns the rows opened. */
export async function maybeOpenRows(kinds: readonly string[] = LOT_KINDS): Promise<string[]> {
  const all = (await getAllBuildingsManifest()).buildings;
  const open = await openRows();
  const opened: string[] = [];
  for (const kind of kinds) {
    const ownedRows = await db.select({ key: lots.key }).from(lots).where(and(eq(lots.kind, kind as "land"), isNotNull(lots.ownerId)));
    const row = nextRowToOpen(kind, all, open, new Set(ownedRows.map((r) => r.key)));
    if (row && (await openRow(row))) opened.push(row);
  }
  return opened;
}

/** Admin: open the next closed row of `kind` now, however full it is. */
export async function forceOpenNextRow(kind: string): Promise<string | null> {
  const all = (await getAllBuildingsManifest()).buildings;
  const open = await openRows();
  const everything = new Set(all.filter((e) => e.kind === kind).map((e) => e.key)); // as if every lot were owned
  const row = nextRowToOpen(kind, all, open, everything);
  return row && (await openRow(row)) ? row : null;
}

/** Open one row for everyone (once: the first caller wins). */
async function openRow(row: string): Promise<boolean> {
  const [won] = await db.insert(lotRows).values({ row, kind: rowKind(row) }).onConflictDoNothing().returning({ row: lotRows.row });
  if (!won) return false;
  state.open = new Set([...state.open, row]);
  state.version++;
  const entries = (await getAllBuildingsManifest()).buildings.filter((e) => e.row === row);
  for (const e of entries) { await upsertBuildingRow(e); await upsertLotRow(e); }
  const kind = rowKind(row);
  await logEvent("lots", `🏡 ${entries.length} new ${LABEL[kind] ?? "lots"} opened ${WHERE[kind] ?? ""} (row ${rowIndex(row)}).`);
  return true;
}
