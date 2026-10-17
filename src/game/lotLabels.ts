// What the lot card says for each kind of lot (a home, a homestead):
// its icon and the words for owning, claiming and giving it up.

import type { LotKind } from "@/types/garden";
import type { LotLabels } from "@/types/lotLabels";

export const LOT_LABELS: Readonly<Record<LotKind, LotLabels>> = {
  home: { icon: "🏡", yours: "Your home", of: "Home of", buy: "Buy", claim: "Move in (free)", giveUp: "Move out", confirm: "Sure? The garden is cleared" },
  homestead: { icon: "🏡", yours: "Your homestead", of: "Homestead of", buy: "Buy homestead", claim: "Claim homestead (free)", giveUp: "Give up", confirm: "Sure? Crops, animals and buildings are cleared" },
};
