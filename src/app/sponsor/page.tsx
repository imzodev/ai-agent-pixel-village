"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Info = { plans: Record<string, { rentCents: number; leadFeeCents: number; label: string }>; paymentsConfigured: boolean; buildings: { key: string; name: string; kind: string; color: string; taken: boolean; tenant: string | null }[] };

export default function SponsorPage() {
  return <Suspense fallback={null}><SponsorInner /></Suspense>;
}

function SponsorInner() {
  const params = useSearchParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [f, setF] = useState({ businessName: "", contactEmail: "", website: "", brandColor: "#e76f51", tagline: "", pitch: "", persona: "", agentName: "", greeting: "", discountCode: "", discountText: "", buildingKey: params.get("building") ?? "", plan: "village" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/sponsors").then((r) => r.json()).then(setInfo); }, []);
  useEffect(() => { if (info && !f.buildingKey) { const first = info.buildings.find((b) => !b.taken); if (first) setF((x) => ({ ...x, buildingKey: first.key })); } }, [info, f.buildingKey]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    const res = await fetch("/api/sponsors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    const j = await res.json();
    if (!res.ok) { setErr(j.error ?? "Failed"); setBusy(false); return; }
    if (j.checkoutUrl) location.href = j.checkoutUrl;
    else location.href = `/sponsor/dashboard?token=${j.ownerToken}&welcome=1`;
  };

  const chosen = info?.buildings.find((b) => b.key === f.buildingKey);
  return (
    <main className="min-h-dvh bg-stone-100 p-4 font-mono text-stone-800">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-3"><Link href="/" className="rounded-lg border-2 border-amber-900/60 bg-amber-100 px-3 py-1 font-bold text-amber-900">🌳 thegrove</Link><span className="text-stone-500">for businesses</span><div className="flex-1" /><Link href="/sponsor/dashboard" className="underline">I already have a building</Link></div>
        <section className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <h1 className="text-3xl font-bold leading-tight text-amber-900">Reserve a building. Get a character, not a billboard.</h1>
            <p className="mt-3 text-stone-700">Your building gets your sign. An AI agent with your persona moves in and becomes a real villager: it hands out missions and items, and — in the same conversation — mentions your offer the way a friendly shopkeeper would. Players who take the pitch get your discount code as an in-game item, and you get the lead.</p>
            <ul className="mt-4 space-y-2 text-stone-700">
              <li>🪧 <b>Brand sign</b> renders on your building in the live world</li>
              <li>🤖 <b>Auto-spawned agent</b> with your persona and pitch loaded</li>
              <li>📜 <b>Missions + items</b> make the agent worth talking to</li>
              <li>🎟️ <b>Discount codes</b> are real items; each claim is a lead you see instantly</li>
              <li>🔌 <b>Bring your own agent</b> — point a webhook at us and drive the character yourself</li>
            </ul>
            <div className="mt-4 rounded-xl border-4 border-amber-900/50 bg-amber-50 p-3">
              <div className="font-bold text-amber-900">How it sounds in the world</div>
              <div className="mt-2 rounded-lg bg-white p-2 text-[13px]">“Three perfect eggs! Here — my cinnamon knot recipe. <span className="bg-orange-100">Oh, and between us: the weekend knots are half price for villagers. Want me to write you down a code?</span>”</div>
              <div className="mt-1 text-[11px] text-stone-500">The recipe and the pitch are one conversation. That&apos;s the product.</div>
            </div>
            {info && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {Object.entries(info.plans).map(([k, p]) => (
                  <button key={k} type="button" onClick={() => setF({ ...f, plan: k })} className={`rounded-xl border-4 p-3 text-left ${f.plan === k ? "border-orange-500 bg-orange-50" : "border-stone-200 bg-white"}`}>
                    <div className="text-lg font-bold capitalize">{k}</div><div className="text-2xl font-bold text-orange-600">${(p.rentCents / 100).toFixed(0)}<span className="text-sm text-stone-500">/mo</span></div><div className="text-[12px] text-stone-600">+ ${(p.leadFeeCents / 100).toFixed(2)} per claimed code</div>
                  </button>
                ))}
              </div>
            )}
            {info && !info.paymentsConfigured && <div className="mt-2 rounded-lg bg-yellow-100 px-3 py-2 text-[12px] text-yellow-900">Payments are in sandbox mode on this deployment (no STRIPE_SECRET_KEY) — reservations activate instantly so you can try the whole loop.</div>}
          </div>
          <form onSubmit={submit} className="space-y-3 rounded-xl border-4 border-amber-900/70 bg-amber-50 p-4 shadow-xl">
            <div className="text-lg font-bold text-amber-900">Move in</div>
            <label className="block text-[11px] font-bold uppercase text-amber-800">Building
              <select value={f.buildingKey} onChange={set("buildingKey")} className="mt-1 w-full rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5 font-mono text-sm">
                {info?.buildings.map((b) => <option key={b.key} value={b.key} disabled={b.taken}>{b.name} {b.taken ? `— taken by ${b.tenant}` : "— available"}</option>)}
              </select>
            </label>
            {chosen && <div className="h-3 rounded" style={{ background: chosen.color }} />}
            <div className="grid gap-2 sm:grid-cols-2">
              <In label="Business name" v={f.businessName} on={set("businessName")} required />
              <In label="Contact email" v={f.contactEmail} on={set("contactEmail")} type="email" required />
              <In label="Website (for redemptions)" v={f.website} on={set("website")} placeholder="https://" />
              <label className="block text-[11px] font-bold uppercase text-amber-800">Brand color<input type="color" value={f.brandColor} onChange={set("brandColor")} className="mt-1 h-9 w-full rounded-lg border-2 border-amber-900/40 bg-white" /></label>
            </div>
            <In label="Tagline (on the sign hover)" v={f.tagline} on={set("tagline")} placeholder="Real bread, slow risen." />
            <div className="grid gap-2 sm:grid-cols-2">
              <In label="Agent name" v={f.agentName} on={set("agentName")} placeholder="Marigold" />
              <In label="Discount code" v={f.discountCode} on={set("discountCode")} placeholder="GROVE20" />
            </div>
            <In label="What the code gets them" v={f.discountText} on={set("discountText")} placeholder="20% off any weekend order" />
            <Ta label="Persona — who is this character?" v={f.persona} on={set("persona")} placeholder="Warm, flour-dusted, calls everyone 'love'. Proud of her sourdough…" />
            <Ta label="The pitch — one or two sentences the character would naturally say" v={f.pitch} on={set("pitch")} placeholder="Our weekend cinnamon knots are half price for villagers, and the sourdough subscription delivers every Saturday." />
            <In label="Greeting line" v={f.greeting} on={set("greeting")} placeholder="Oh, hello love! Mind the flour." />
            {err && <div className="rounded-lg bg-red-100 px-3 py-2 text-red-800">{err}</div>}
            <button disabled={busy} className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-base font-bold text-white hover:bg-orange-400 disabled:opacity-50">{busy ? "Hanging the sign…" : info?.paymentsConfigured ? "Continue to payment →" : "Reserve & spawn my agent →"}</button>
            <p className="text-[11px] text-stone-500">Rent is billed monthly by card. Per-lead fees accrue on your dashboard and bill with rent. Cancel any time from the dashboard.</p>
          </form>
        </section>
      </div>
    </main>
  );
}

function In({ label, v, on, ...rest }: { label: string; v: string; on: (e: React.ChangeEvent<HTMLInputElement>) => void } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label className="block text-[11px] font-bold uppercase text-amber-800">{label}<input value={v} onChange={on} {...rest} className="mt-1 w-full rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5 font-mono text-sm normal-case" /></label>;
}
function Ta({ label, v, on, placeholder }: { label: string; v: string; on: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; placeholder?: string }) {
  return <label className="block text-[11px] font-bold uppercase text-amber-800">{label}<textarea value={v} onChange={on} placeholder={placeholder} rows={2} className="mt-1 w-full rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5 font-mono text-sm normal-case" /></label>;
}
