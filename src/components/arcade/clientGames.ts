// Each arcade game's screen parts for the shell (ArcadeShell): its field and
// the intro card's words. The rules side is src/lib/arcade/games.ts.

import WhistleField from "../whistle/WhistleField";
import HaulField from "../haul/HaulField";
import DerbyField from "../derby/DerbyField";
import { SHEEP_COUNT } from "@/lib/whistle/rules";
import type { ArcadeClientGame, ArcadeGameKey } from "@/types/arcade";

export const CLIENT_GAMES: Record<ArcadeGameKey, ArcadeClientGame> = {
  whistle: {
    Field: WhistleField,
    pitch: "You're the shepherd's whistle. Tap, and the sound pushes the flock away from that spot.",
    howTo: [
      ["🏠", `Herd all ${SHEEP_COUNT} sheep into the pen through its gate.`],
      ["🐺", "Wolves take stragglers: keep the flock together. A whistle scares wolves too."],
      ["💨", "Three whistles of breath, refilling. Spamming does nothing."],
      ["📅", "A new course every day; the week's best win prizes in the village."],
    ],
  },
  haul: {
    Field: HaulField,
    pitch: "Load Della's cart with the day's produce, then get it all to market in one piece.",
    howTo: [
      ["👆", "Slide over the cart to aim, let go to drop. ↻ turns the next item."],
      ["🥚", "Eggs and the wedding cake break if they land hard: drop them gently."],
      ["◀▶", "On the road, lean the cart over bumps and hills (or ← → keys)."],
      ["📅", "A new load and road every day; the week's best win prizes in the village."],
    ],
  },
  derby: {
    Field: DerbyField,
    pitch: "75 seconds at the day's pond. Land as much fish as you can, and the trophy if it shows.",
    howTo: [
      ["🎯", "Tap the water to cast, a little short of a fish: a splash on its head scares it off."],
      ["❗", "Wait for the bobber to go under, then tap to strike. Too soon and it's gone."],
      ["🎣", "Hold to reel. Let go while the fish runs, or the line snaps; too slack and it throws the hook."],
      ["🏆", "One trophy fish surfaces each day. A new pond every day; the week's best win prizes."],
    ],
  },
};
