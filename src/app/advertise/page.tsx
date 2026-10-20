"use client";
// Rent a billboard in the world (src/lib/billboards.ts): pick a spot, upload
// a poster, pay monthly. Every poster is reviewed before it goes up.
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { BillboardCatalog, BillboardTier } from "@/types/billboard";

const TIER_ORDER: readonly BillboardTier[] = ["plaza", "town", "roadside"];
const dollars = (c: number) => `$${(c / 100).toFixed(0)}`;

export default function AdvertisePage() {
  return <Suspense fallback={null}><AdvertiseInner /></Suspense>;
}

function AdvertiseInner() {
  const params = useSearchParams();
  const [info, setInfo] = useState<BillboardCatalog | null>(null);
  const [spot, setSpot] = useState(params.get("spot") ?? "");
  const [f, setF] = useState({ email: "", title: "", link: "", sponsorToken: "" });
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/billboards").then((r) => r.json()).then(setInfo); }, []);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const free = info?.spots.filter((s) => !s.taken) ?? [];
  const chosen = info?.spots.find((s) => s.key === spot && !s.taken) ?? free[0];
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    if (!file) { setErr("Choose an image for the poster."); return; }
    setBusy(true); setErr("");
    const body = new FormData();
    body.set("spot", chosen.key);
    for (const [k, v] of Object.entries(f)) body.set(k, v);
    body.set("image", file);
    const res = await fetch("/api/billboards", { method: "POST", body });
    const j = await res.json().catch(() => ({ error: "Something went wrong." }));
    if (!res.ok) { setErr(j.error ?? "Something went wrong."); setBusy(false); return; }
    location.href = j.checkoutUrl ?? `/advertise/dashboard?token=${j.ownerToken}`;
  };

  return (
    <main className="min-h-dvh bg-stone-100 p-4 font-mono text-stone-800">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center gap-3"><Link href="/" className="rounded-lg border-2 border-amber-900/60 bg-amber-100 px-3 py-1 font-bold text-amber-900">🌳 thegroove</Link><span className="text-stone-500">billboards</span><div className="flex-1" /><Link href="/sponsor" className="underline">Want a whole building?</Link></div>
        <section className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <h1 className="text-3xl font-bold leading-tight text-amber-900">Put your poster in the world.</h1>
            <p className="mt-3 text-stone-700">Billboards stand where players gather: by the village plaza where everyone starts, by each town&apos;s square, along the King&apos;s Road. Players walk past your poster, and one tap takes them to your site. Made for indie games, shops, streamers and anyone with something fun to show.</p>
            <ul className="mt-4 space-y-2 text-stone-700">
              <li>🖼️ <b>Your own art</b>, 2:1 (we fit it to 192×96)</li>
              <li>👀 <b>Real numbers</b>: views and clicks, day by day</li>
              <li>✅ <b>Reviewed</b> before it goes up. If it isn&apos;t approved, you get your money back</li>
              <li>🗓️ <b>Monthly</b>, cancel any time from your dashboard</li>
            </ul>
            {info && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {TIER_ORDER.map((t) => {
                  const left = info.spots.filter((s) => s.tier === t && !s.taken).length;
                  const active = chosen?.tier === t;
                  return (
                    <button key={t} type="button" disabled={!left} onClick={() => setSpot(info.spots.find((s) => s.tier === t && !s.taken)?.key ?? "")} className={`rounded-xl border-4 p-2 text-left disabled:opacity-50 ${active ? "border-orange-500 bg-orange-50" : "border-stone-200 bg-white"}`}>
                      <div className="text-sm font-bold">{info.tiers[t].label}</div>
                      <div className="text-xl font-bold text-orange-600">{dollars(info.tiers[t].priceCents)}<span className="text-xs text-stone-500">/mo</span></div>
                      <div className="text-[11px] text-stone-600">{left ? `${left} free` : "all taken"}</div>
                    </button>
                  );
                })}
              </div>
            )}
            {chosen && info && <p className="mt-2 text-[12px] text-stone-600">{info.tiers[chosen.tier].blurb}</p>}
            {info && !info.open && <div className="mt-2 rounded-lg bg-yellow-100 px-3 py-2 text-[12px] text-yellow-900">Billboards open soon.</div>}
            {info?.open && !info.paymentsConfigured && <div className="mt-2 rounded-lg bg-yellow-100 px-3 py-2 text-[12px] text-yellow-900">Sandbox mode (development, no STRIPE_SECRET_KEY): no payment; your billboard goes straight to review.</div>}
          </div>
          <form onSubmit={submit} className="space-y-3 rounded-xl border-4 border-amber-900/70 bg-amber-50 p-4 shadow-xl">
            <div className="text-lg font-bold text-amber-900">Rent a billboard</div>
            <label className="block text-[11px] font-bold uppercase text-amber-800">Spot
              <select value={chosen?.key ?? ""} onChange={(e) => setSpot(e.target.value)} className="mt-1 w-full rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5 font-mono text-sm">
                {TIER_ORDER.map((t) => (
                  <optgroup key={t} label={`${info?.tiers[t].label ?? t} · ${info ? dollars(info.tiers[t].priceCents) : ""}/mo`}>
                    {info?.spots.filter((s) => s.tier === t).map((s) => <option key={s.key} value={s.key} disabled={s.taken}>{s.name}{s.taken ? " (taken)" : ""}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="block text-[11px] font-bold uppercase text-amber-800">Poster (PNG, JPEG or WebP, up to 2 MB)
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
            </label>
            <div className="flex items-center gap-3">
              <div className="flex aspect-[2/1] w-48 items-center justify-center overflow-hidden rounded border-4 border-amber-800 bg-amber-200 text-[11px] text-amber-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {preview ? <img src={preview} alt="Poster preview" className="h-full w-full object-cover" style={{ imageRendering: "pixelated" }} /> : "your poster here"}
              </div>
              <div className="text-[11px] text-stone-600">Cropped to 2:1. Big, simple art and a few words read best from the road.</div>
            </div>
            <In label="Title (what players see when they look at it)" v={f.title} on={set("title")} maxLength={40} placeholder="Starfall: a cozy space farm" required />
            <In label="Link" v={f.link} on={set("link")} placeholder="https://yourgame.example" required />
            <In label="Your email" v={f.email} on={set("email")} type="email" required />
            <In label="Sponsor token (optional, if you already rent a building)" v={f.sponsorToken} on={set("sponsorToken")} />
            {err && <div className="rounded-lg bg-red-100 px-3 py-2 text-red-800">{err}</div>}
            <button disabled={busy || !chosen || info?.open === false} className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-base font-bold text-white hover:bg-orange-400 disabled:opacity-50">
              {info?.open === false ? "Opening soon" : !chosen && info ? "All spots are taken" : busy ? "Uploading…" : info?.paymentsConfigured ? `Continue to payment (${chosen ? dollars(chosen.priceCents) : ""}/mo) →` : "Send for review →"}
            </button>
            <p className="text-[11px] text-stone-500">Billed monthly by card. We review every poster (no adult content, hate, scams or gambling) before it goes up; if we don&apos;t approve it, the payment is refunded in full.</p>
          </form>
        </section>
      </div>
    </main>
  );
}

function In({ label, v, on, ...rest }: { label: string; v: string; on: (e: React.ChangeEvent<HTMLInputElement>) => void } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label className="block text-[11px] font-bold uppercase text-amber-800">{label}<input value={v} onChange={on} {...rest} className="mt-1 w-full rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5 font-mono text-sm normal-case" /></label>;
}
