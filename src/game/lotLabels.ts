// What the lot card says for each kind of lot (home, land, ranch, vineyard):
// its icon and the words for owning, claiming and giving it up.

import type { LotKind } from "@/types/garden";
import type { LotLabels } from "@/types/lotLabels";

export const LOT_LABELS: Readonly<Record<LotKind, LotLabels>> = {
  home: { icon: "🏡", yours: "Your home", of: "Home of", buy: "Buy", claim: "Move in (free)", giveUp: "Move out", confirm: "Sure? The garden is cleared" },
  land: { icon: "🌱", yours: "Your land", of: "Land of", buy: "Buy land", claim: "Claim land (free)", giveUp: "Give up", confirm: "Sure? Crops are cleared" },
  ranch: { icon: "🐔", yours: "Your ranch", of: "Ranch of", buy: "Buy ranch", claim: "Claim ranch (free)", giveUp: "Give up", confirm: "Sure? Animals leave" },
  vineyard: { icon: "🍇", yours: "Your vineyard", of: "Vineyard of", buy: "Buy vineyard", claim: "Claim vineyard (free)", giveUp: "Give up", confirm: "Sure? Vines are cleared" },
};
