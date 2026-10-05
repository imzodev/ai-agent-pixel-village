# Third-party asset attribution

The following assets are bundled in `public/assets/` and require credit
under their respective open-source licenses.

## Fox sprite (`fox.png`)

- **Source**: Pat van Mackelberg's *Wolf Pack* (CC0) → Jordan Irwin's re-color → bleutailfly's fox adaptation (CC0). Distilled here as `fox.png`.
- **Dimensions**: 48×64 (4 directions × 3 walking frames at 16×16 each).
- **License**: OpenGameArt.org Attribution (OGA BY) 3.0 or later / Creative Commons Attribution (CC BY) 3.0 or later. **Attribution required** when redistributing.

Permission has been granted by the original authors under the CC0/CC0
chain; however, OGA BY 3.0 / CC BY 3.0 are the practical upstream licenses for
the assembled sheet, so we keep credit visible here. If you fork the project,
include this file (or a link to it) in your distribution.

## Farm animal sprites (`animals/cow.png`, `animals/sheep.png`, `animals/pig.png`, `animals/llama.png`, `animals/chicken.png`)

- **Author**: Daniel Eddeland — *LPC style farm animals*, commissioned by
  tebruno99 (https://opengameart.org/forumtopic/filledlpc-style-farm-animals-needed).
  Submission: https://opengameart.org/content/lpc-style-farm-animals
- **Contents**: the cow, sheep, pig and llama (128×128 frames) and chicken (32×32 frames) walk
  and eat sheets, 4 directions × 4 frames each, combined into one sheet per
  animal: rows 0–3 walk, rows 4–7 eat (see `scripts/build-animal-sheet.mjs`).
- **License**: GPL 2.0 or later / CC-BY. **Attribution required** when
  redistributing: credit Daniel Eddeland and link to the OpenGameArt submission.

## Duck, rabbit, cat, dog, bat, slime and thornling sprites (`animals/duck.png`, `animals/rabbit.png`, `animals/cat.png`, `animals/dog.png`, `animals/bat.png`, `animals/slime.png`, `animals/thornling.png`)

Original art made for this project, drawn procedurally in the format of
the LPC chicken above (32×32 frames, 4 directions):
- a mallard by `scripts/draw-duck.mjs` (waddle + dabble);
- a cottontail rabbit by `scripts/draw-rabbit.mjs` (hop + nibble);
- an orange tabby cat by `scripts/draw-cat.mjs` (walk + groom);
- a brown dog by `scripts/draw-dog.mjs` (walk + sit, panting and wagging);
- a bat (enemy) by `scripts/draw-bat.mjs` (wing-flap cycle, flying + hovering);
- a slime (enemy) by `scripts/draw-slime.mjs` (hop + idle jiggle);
- a thornling (enemy) by `scripts/draw-thornling.mjs` (root waddle + idle sway).

Not derived from any third-party asset; regenerate with
`node scripts/draw-<animal>.mjs`. Shared
drawing helpers live in `scripts/pixel-art.mjs`.

## Wheat field tiles

Rendered at runtime as a sub-region of `food/crops.png` (LPC Crops,
bluecarrot16 / Daniel Eddeland / Joshua Taylor / Richard Kettering)
via Phaser's `setCrop`. Mature wheat (32×64) and a young sprout for
the picked/regrowth state. See `food/CREDITS-crops.txt` for the
upstream license chain.

- **License**: CC-BY-SA 3.0+ / GPL 3.0+. **Attribution required** when
  redistributing.

## Fruit trees (`trees/fruit-trees.png`)

- **Source**: "[LPC] Fruit Trees" by bluecarrot16, Joshua Taylor, and
  cynicmusic. Commissioned by castelonia.
  Submission: https://opengameart.org/content/lpc-fruit-trees
- **License**: CC-BY-SA 3.0 / GPL 3.0. Based on "Fruit and Veggie Inventory"
  by Joshua Taylor (CC-BY-SA 3.0 / GPL 3.0,
  https://opengameart.org/content/fruit-and-veggie-inventory) and "Pixelsphere
  32x32 Tileset + Grass + Trees" by cynicmusic (CC0,
  http://opengameart.org/content/pixelsphere-32x32-tileset-grass-trees).
- **Credits**: `trees/CREDITS-fruit-trees.txt` (from the submission's
  `lpc-fruit-trees.zip`), shipped with the game as its license requires,
  together with the link above. Changes to the sheet itself stay under
  CC-BY-SA 3.0 / GPL 3.0.
- **Use**: the vineyard's apple trees (`src/lib/crops.ts` `apple_tree`, column 0
  of the sheet: four growth stages, then three fruiting stages).
- **Attribution required** when redistributing.

## Grapevines and vineyard (`trees/vines.png`, `VineyardLot.png`)

Original art made for this project by `scripts/draw-orchard.mjs` and
`scripts/draw-vineyard-lot.mjs`. Not derived from any third-party asset.

## Furniture and workshops (`furniture.png`, `WorkshopLot.png`)

Original art made for this project by `scripts/draw-furniture.mjs` (every
furniture piece, front view, 32×32) and `scripts/draw-workshop-lot.mjs` (the
carpenter's yard); the stations are drawn in `src/game/workshopProps.ts`. Not
derived from any third-party asset.
