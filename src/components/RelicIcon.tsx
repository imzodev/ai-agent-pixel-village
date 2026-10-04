// A relic set's pixel sprite as a crisp little SVG (the same art as in the
// world, src/lib/relicArt.ts).
import { RELIC_ART } from "@/lib/relicArt";
import type { RelicSetKey } from "@/types/treasure";

export default function RelicIcon({ set, size = 32, className }: { set: RelicSetKey; size?: number; className?: string }) {
  const art = RELIC_ART[set];
  const w = Math.max(...art.rows.map((r) => r.length)), h = art.rows.length;
  return (
    <svg width={size} height={(size * h) / w} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" className={className} aria-hidden>
      {art.rows.flatMap((row, y) => [...row].map((c, x) => (art.palette[c] ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={art.palette[c]} /> : null)))}
    </svg>
  );
}
