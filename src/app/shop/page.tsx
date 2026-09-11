"use client";
import { useEffect, useState } from "react";
import { COSMETIC_RARITIES, COSMETIC_SLOTS, type CosmeticRarity, type CosmeticSlot } from "@/types/cosmetic";

type Item = {
  item: {
    key: string;
    name: string;
    slot: CosmeticSlot;
    assetRef: string;
    rarity: CosmeticRarity;
    coinPrice: number;
    gemPrice: number;
    sponsorGrantedOnly: boolean;
    sponsorId: number | null;
  };
  owned: boolean;
  equipped: boolean;
  canAffordCoins: boolean;
  canAffordGems: boolean;
};

type Pack = { key: string; gems: number; priceCents: number };

export default function ShopPage() {
  const [view, setView] = useState<{ items: Item[]; balance: { coins: number; gems: number } } | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<CosmeticSlot | "all">("all");
  const [tab, setTab] = useState<"cosmetics" | "gems">("cosmetics");

  const reload = async () => {
    const [s, p] = await Promise.all([
      fetch("/api/shop").then((r) => r.json()),
      fetch("/api/gems").then((r) => r.json()),
    ]);
    setView(s);
    setPacks(p.packs);
  };

  useEffect(() => {
    void reload();
    const params = new URLSearchParams(window.location.search);
    if (params.get("purchase") === "ok") {
      // refresh after Stripe / sandbox redirect
      setTimeout(reload, 250);
    }
  }, []);

  const buyCoins = async (itemKey: string) => {
    setBusy(itemKey);
    try {
      const r = await fetch("/api/shop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "buy_coins", itemKey }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        alert(e.error ?? "purchase failed");
      } else await reload();
    } finally {
      setBusy(null);
    }
  };

  const equip = async (itemKey: string) => {
    setBusy(itemKey);
    try {
      const r = await fetch("/api/shop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "equip", itemKey }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        alert(e.error ?? "equip failed");
      } else await reload();
    } finally {
      setBusy(null);
    }
  };

  const buyGems = async (packKey: string) => {
    setBusy(packKey);
    try {
      const r = await fetch("/api/gems", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packKey }),
      });
      const { url } = (await r.json()) as { url?: string };
      if (url) window.location.href = url;
    } finally {
      setBusy(null);
    }
  };

  const filtered = view?.items.filter((i) => (filter === "all" ? true : i.item.slot === filter)) ?? [];

  return (
    <div style={{ minHeight: "100dvh", background: "#1a2238", color: "#fff", padding: "max(env(safe-area-inset-top),16px) max(env(safe-area-inset-right),16px) max(env(safe-area-inset-bottom),80px) max(env(safe-area-inset-left),16px)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <a href="/" style={{ color: "#ffd166", textDecoration: "none", fontFamily: "monospace" }}>← back</a>
        <h1 style={{ fontFamily: "monospace", fontSize: 20, margin: 0 }}>Shop</h1>
        <div style={{ display: "flex", gap: 10, fontFamily: "monospace", fontSize: 14 }}>
          <span title="coins">🪙 {view?.balance.coins ?? 0}</span>
          <span title="gems">💎 {view?.balance.gems ?? 0}</span>
        </div>
      </header>
      <nav style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Tab active={tab === "cosmetics"} onClick={() => setTab("cosmetics")}>Cosmetics</Tab>
        <Tab active={tab === "gems"} onClick={() => setTab("gems")}>Gems</Tab>
      </nav>

      {tab === "cosmetics" && (
        <>
          <nav style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>all</FilterChip>
            {COSMETIC_SLOTS.map((s) => (
              <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>{s}</FilterChip>
            ))}
          </nav>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {filtered.map((row) => {
              const r = row.item;
              return (
                <div key={r.key} style={{ background: "#0e1830", border: `2px solid ${rarityColor(r.rarity)}`, borderRadius: 10, padding: 12 }}>
                  <div style={{ aspectRatio: "1/1", background: "#16244a", borderRadius: 6, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
                    {slotIcon(r.slot)}
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: "#9aa", marginBottom: 8 }}>{r.slot} · {r.rarity}</div>
                  {row.equipped ? (
                    <Badge color="#7ee787">equipped</Badge>
                  ) : row.owned ? (
                    <button disabled={busy === r.key} onClick={() => equip(r.key)} style={btnPrimary}>equip</button>
                  ) : r.coinPrice > 0 ? (
                    <button disabled={busy === r.key || !row.canAffordCoins} onClick={() => buyCoins(r.key)} style={btnPrimary}>
                      🪙 {r.coinPrice}
                    </button>
                  ) : r.gemPrice > 0 ? (
                    <button disabled={busy === r.key || !row.canAffordGems} style={btnDisabled}>💎 {r.gemPrice}</button>
                  ) : (
                    <Badge color="#ffd166">sponsor gift</Badge>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && <div style={{ color: "#9aa" }}>No items in this slot yet.</div>}
          </div>
        </>
      )}

      {tab === "gems" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {packs.map((p) => (
            <div key={p.key} style={{ background: "#0e1830", border: "2px solid #6b8cff", borderRadius: 10, padding: 16 }}>
              <div style={{ fontFamily: "monospace", fontSize: 28, marginBottom: 4 }}>💎 {p.gems}</div>
              <div style={{ fontFamily: "monospace", color: "#9aa", marginBottom: 12 }}>${(p.priceCents / 100).toFixed(2)}</div>
              <button disabled={busy === p.key} onClick={() => buyGems(p.key)} style={btnPrimary}>
                {busy === p.key ? "…" : "Buy"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = { width: "100%", padding: "8px 12px", background: "#6b8cff", color: "#fff", border: 0, borderRadius: 6, fontFamily: "monospace", cursor: "pointer" };
const btnDisabled: React.CSSProperties = { ...btnPrimary, background: "#3a3f55", cursor: "not-allowed" };

function rarityColor(r: CosmeticRarity): string {
  return ({ common: "#9aa", uncommon: "#7ee787", rare: "#6b8cff", epic: "#c084fc", legendary: "#ffd166" } as const)[r];
}

function slotIcon(s: CosmeticSlot): string {
  return ({ hair: "💇", hat: "🎩", glasses: "👓", outfit: "👕", back: "🎒", pet: "🐾" } as const)[s];
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px",
      background: active ? "#6b8cff" : "transparent",
      color: "#fff",
      border: "1px solid #6b8cff",
      borderRadius: 6,
      fontFamily: "monospace",
      cursor: "pointer",
    }}>{children}</button>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 10px",
      background: active ? "#3a4775" : "transparent",
      color: "#fff",
      border: "1px solid #3a4775",
      borderRadius: 999,
      fontFamily: "monospace",
      fontSize: 12,
      cursor: "pointer",
    }}>{children}</button>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "inline-block", padding: "4px 10px", background: color, color: "#000", borderRadius: 6, fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>
      {children}
    </div>
  );
}
