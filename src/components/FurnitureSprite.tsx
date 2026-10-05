"use client";
// One piece of furniture drawn from the furniture sheet (src/game/furnitureArt.ts),
// crisp at any size; falls back to the item's emoji when it has no sprite.
import { ITEM_ICONS } from "@/game/bus";
import { FURNITURE_CELL, FURNITURE_COLS, FURNITURE_SHEET, furnitureCell } from "@/game/furnitureArt";

export default function FurnitureSprite({ itemKey, size = 32, title }: { itemKey: string; size?: number; title?: string }) {
  const cell = furnitureCell(itemKey);
  if (!cell) return <span title={title}>{ITEM_ICONS[itemKey] ?? "📦"}</span>;
  const k = size / FURNITURE_CELL;
  return (
    <span
      title={title ?? itemKey.replace(/_/g, " ")}
      className="inline-block align-middle"
      style={{
        width: size, height: size, imageRendering: "pixelated",
        backgroundImage: `url(${FURNITURE_SHEET})`,
        backgroundPosition: `-${cell.x * k}px -${cell.y * k}px`,
        backgroundSize: `${FURNITURE_COLS * FURNITURE_CELL * k}px auto`,
      }}
    />
  );
}
