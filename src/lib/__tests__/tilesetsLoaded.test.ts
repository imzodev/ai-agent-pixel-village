// Every tileset a building template uses must be preloaded by the client
// (TILESET_FILES in src/game/worldTilemap.ts), or the building's walls exist
// but its art never draws (as happened to the vineyard and workshop lots).
import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("building tilesets", () => {
  it("every template's tilesets are in TILESET_FILES, and the images exist", () => {
    const src = fs.readFileSync("src/game/worldTilemap.ts", "utf8");
    const loaded = new Map([...src.matchAll(/\{ name: "([^"]+)", file: "([^"]+)" \}/g)].map((m) => [m[1], m[2]]));
    const manifest = JSON.parse(fs.readFileSync("public/buildings/buildings.json", "utf8")) as { buildings: { file: string }[] };
    for (const file of new Set(manifest.buildings.map((b) => b.file))) {
      const tpl = JSON.parse(fs.readFileSync(`public${file}`, "utf8")) as { tilesets: { name?: string }[] };
      for (const ts of tpl.tilesets) {
        if (!ts.name) continue;
        expect(loaded.has(ts.name), `${ts.name} (used by ${file}) isn't preloaded`).toBe(true);
        expect(fs.existsSync(`public/assets/${loaded.get(ts.name)}`), `${ts.name}'s image`).toBe(true);
      }
    }
  });
});
