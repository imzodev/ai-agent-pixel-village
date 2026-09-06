// Server-side loader for the buildings manifest and their Tiled templates.
// Cached per process — after editing buildings.json or any template, restart
// the dev server. (Deliberately no mtime polling: the manifest never changes
// at runtime in production, and this keeps the hot request path free of I/O.)
import { promises as fs } from "node:fs";
import path from "node:path";
import { doorWorldPx, type BuildingManifest, type BuildingManifestEntry } from "./buildingManifest";

let cachedManifest: BuildingManifest | null = null;
const cachedTemplates = new Map<string, unknown>();
const cachedDoors = new Map<string, { x: number; y: number }>();

const manifestPath = path.join(process.cwd(), "public", "buildings", "buildings.json");

export async function getBuildingsManifest(): Promise<BuildingManifest> {
  if (cachedManifest) return cachedManifest;
  const buf = await fs.readFile(manifestPath, "utf8");
  cachedManifest = JSON.parse(buf) as BuildingManifest;
  return cachedManifest;
}

export async function getTemplate(entry: BuildingManifestEntry): Promise<unknown> {
  const hit = cachedTemplates.get(entry.key);
  if (hit) return hit;
  const buf = await fs.readFile(path.join(process.cwd(), "public", entry.file.replace(/^\//, "")), "utf8");
  const json = JSON.parse(buf);
  cachedTemplates.set(entry.key, json);
  return json;
}

/** World-pixel door position for a manifest building. */
export async function getBuildingDoor(key: string): Promise<{ x: number; y: number } | null> {
  const hit = cachedDoors.get(key);
  if (hit) return hit;
  try {
    const manifest = await getBuildingsManifest();
    const entry = manifest.buildings.find((b) => b.key === key);
    if (!entry) return null;
    const door = doorWorldPx(entry, await getTemplate(entry));
    cachedDoors.set(key, door);
    return door;
  } catch {
    return null;
  }
}

/** All manifest doors keyed by building key. */
export async function getBuildingDoors(): Promise<Map<string, { x: number; y: number }>> {
  const manifest = await getBuildingsManifest();
  const out = new Map<string, { x: number; y: number }>();
  for (const entry of manifest.buildings) {
    const door = await getBuildingDoor(entry.key);
    if (door) out.set(entry.key, door);
  }
  return out;
}
