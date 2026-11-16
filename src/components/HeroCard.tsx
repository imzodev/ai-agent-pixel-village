"use client";
// Who your hero is (src/lib/traits.ts, src/lib/qualities.ts): pick an origin
// and two traits (changeable for your first day), see the traits stories
// taught you, and the qualities your deeds have grown. Shown atop the story
// window; with nothing chosen yet, the picker opens by itself.
import { useCallback, useEffect, useState } from "react";
import { ORIGINS, TRAITS, TRAIT_PICKS, originDef, traitDef } from "@/lib/traits";
import { QUALITIES } from "@/lib/qualities";
import type { HeroState, OriginKey, TraitKey } from "@/types/traits";

async function call<T>(body?: unknown): Promise<T & { error?: string }> {
  try {
    const res = await fetch("/api/traits", { method: body ? "POST" : "GET", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return await res.json();
  } catch {
    return { error: "Couldn't reach the village. Try again." } as T & { error?: string };
  }
}

export default function HeroCard({ onMessage }: { onMessage: (text: string, kind: "good" | "bad" | "info") => void }) {
  const [hero, setHero] = useState<HeroState | null>(null);
  const [editing, setEditing] = useState(false);
  const [origin, setOrigin] = useState<OriginKey | null>(null);
  const [picks, setPicks] = useState<TraitKey[]>([]);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((h: HeroState & { error?: string }) => {
    if (h.error) return;
    setHero(h);
    setOrigin(h.origin);
    setPicks(h.picked);
    if (!h.origin && h.canChoose) setEditing(true);
  }, []);
  const load = () => call<HeroState>().then(apply);
  useEffect(() => {
    let alive = true;
    void call<HeroState>().then((h) => { if (alive) apply(h); });
    return () => { alive = false; };
  }, [apply]);

  const toggle = (k: TraitKey) => setPicks((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length >= TRAIT_PICKS ? [...p.slice(1), k] : [...p, k]));
  const save = async () => {
    setBusy(true);
    const r = await call<{ message?: string }>({ origin, traits: picks });
    setBusy(false);
    if (r.error) { onMessage(r.error, "bad"); return; }
    if (r.message) onMessage(r.message, "good");
    setEditing(false);
    await load();
  };

  if (!hero) return null;

  if (editing) {
    return (
      <div className="space-y-2 rounded-lg bg-amber-50 p-2 shadow">
        <div className="font-bold text-amber-900">🧑 Who are you?</div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Where you come from</div>
        <div className="grid grid-cols-2 gap-1">
          {ORIGINS.map((o) => (
            <button key={o.key} onClick={() => setOrigin(o.key)} title={o.description}
              className={`rounded p-1.5 text-left text-[12px] leading-tight ${origin === o.key ? "bg-amber-500 text-white" : "bg-white hover:bg-amber-100"}`}>
              <span className="font-bold">{o.icon} {o.name}</span>
              <span className={`block text-[11px] ${origin === o.key ? "text-white/90" : "text-stone-500"}`}>{o.description}</span>
            </button>
          ))}
        </div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Two traits ({picks.length}/{TRAIT_PICKS})</div>
        <div className="grid grid-cols-2 gap-1">
          {TRAITS.filter((t) => !hero.earned.includes(t.key)).map((t) => (
            <button key={t.key} onClick={() => toggle(t.key)} title={t.description}
              className={`rounded p-1.5 text-left text-[12px] leading-tight ${picks.includes(t.key) ? "bg-violet-600 text-white" : "bg-white hover:bg-violet-50"}`}>
              <span className="font-bold">{t.icon} {t.name}</span>
              <span className={`block text-[11px] ${picks.includes(t.key) ? "text-white/90" : "text-stone-500"}`}>{t.description}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button disabled={busy || !origin || picks.length !== TRAIT_PICKS} onClick={() => void save()} className="pixel-btn flex-1 bg-emerald-600 py-1.5 font-bold text-white disabled:opacity-50">That&apos;s me</button>
          {hero.origin && <button onClick={() => setEditing(false)} className="pixel-btn px-3 py-1.5">Cancel</button>}
        </div>
        <p className="text-[11px] text-stone-500">You can change this for your first day. Finishing stories teaches you more traits.</p>
      </div>
    );
  }

  const traits = [...hero.picked, ...hero.earned];
  return (
    <div className="rounded-lg bg-amber-50 p-2 shadow">
      <div className="flex items-center gap-1">
        <div className="font-bold text-amber-900">🧑 {hero.origin ? `${originDef(hero.origin).icon} ${originDef(hero.origin).name}` : "Your hero"}</div>
        <span className="flex-1" />
        {hero.canChoose && <button className="text-[12px] text-amber-800 underline" onClick={() => setEditing(true)}>{hero.origin ? "Change" : "Choose"}</button>}
      </div>
      {traits.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {traits.map((k) => (
            <span key={k} title={traitDef(k).description} className={`rounded px-1.5 py-0.5 text-[11px] ${hero.earned.includes(k) ? "bg-violet-200 text-violet-900" : "bg-white text-amber-900"}`}>
              {traitDef(k).icon} {traitDef(k).name}{hero.earned.includes(k) ? " ✦" : ""}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 space-y-1">
        {QUALITIES.map((d) => (
          <div key={d.key} title={`Grows with ${d.from}`} className="flex items-center gap-1 text-[11px]">
            <span className="w-20 shrink-0">{d.icon} {d.name}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded bg-amber-900/15"><div className="h-full bg-amber-500" style={{ width: `${hero.qualities[d.key]}%` }} /></div>
            <span className="w-6 text-right tabular-nums text-stone-500">{hero.qualities[d.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
