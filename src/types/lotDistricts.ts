// The homestead lot districts (src/lib/lotDistricts.ts). Types only.

export type DistrictLotKind = "land" | "ranch" | "vineyard" | "workshop";

/** One planned lot: where it stands and the row it opens with. */
export type PlannedLot = {
  kind: DistrictLotKind;
  /** "<kind>_<n>": the row opens as one; row 0 of each kind is the original lots. */
  row: string;
  tx: number;
  ty: number;
};
