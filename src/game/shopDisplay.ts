// The goods on shop displays (src/lib/shopDisplay.ts), as pixel sprites at
// world scale: an axe and a stone sword hanging from a peg, a bundle of
// arrows standing on the shelf.

export const DISPLAY_SPRITES: Readonly<Record<string, { rows: string[]; palette: Record<string, string> }>> = {
  rack_axe: {
    rows: ["...ww", "LsssW", "LsssW", "LsssW", ".sssW", "....W", "....W", "....W", "....W", "....W", "....W", "....W", "....d"],
    palette: { L: "#e8ecf0", s: "#8a8f98", w: "#c8c8d0", W: "#9a6a3a", d: "#5a3a1a" },
  },
  rack_sword: {
    rows: [".p.", ".g.", ".g.", "xxx", "bB.", "bB.", "bB.", "bB.", "bB.", "bB.", "bB.", "bB.", ".b."],
    palette: { p: "#c9a24a", g: "#6a4422", x: "#8a8f98", b: "#9a9aa2", B: "#d8d8de" },
  },
  rack_arrows: {
    rows: ["w.r.w", "r.w.r", "s.s.s", "s.s.s", "ttttt", "s.s.s", "s.s.s", "g.g.g"],
    palette: { w: "#f4f0e4", r: "#c83a32", s: "#8a5a32", t: "#d8b878", g: "#6a6e78" },
  },
};
