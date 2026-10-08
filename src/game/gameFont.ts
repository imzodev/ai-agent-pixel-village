// The font for text drawn on canvases (Phaser labels, map labels, building
// signs). Canvas can't use CSS variables, so read the family next/font put on
// <html> (--font-ui, see src/app/layout.tsx); fall back before it exists.
export function gameFont(): string {
  const family = typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue("--font-ui").trim();
  return family || "system-ui, sans-serif";
}
