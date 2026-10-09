"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Dash = {
  sponsor: { id: number; businessName: string; status: string; brandColor: string; tagline: string; pitch: string; persona: string; discountCode: string; discountText: string; website: string | null; agentName: string; plan: string };
  building: { name: string; key: string } | null;
  agent: { id: number; name: string; role: string; kind: string; keyPrefix: string | null; webhookUrl: string | null } | null;
  leads: { id: number; kind: string; code: string | null; feeCents: number; note: string; createdAt: string; playerName: string; playerLevel: number }[];
  missions: { id: number; title: string }[];
  billing: { rentCents: number; leadFeeCents: number; leadFeesCents: number; totalCents: number; plan: string };
  paymentsConfigured: boolean;
  business: {
    settings: { pitchLines: string[]; patrol: string[]; shopping: { itemKey: string; maxPrice: number; perPeriod: number }[]; budgetCoins: number; budgetPeriod: "day" | "week"; pitchCooldownMin: number; enabled: boolean; mode: string };
    purse: number;
    pantry: Record<string, number>;
    lastDecision: { source: string; action: string; at: number } | null;
    pitchesLast24h: number;
    ledger: { at: number; kind: string; coins: number; itemKey: string | null; counterparty: string | null; note: string }[];
  } | null;
};

type BizForm = { enabled: boolean; pitchLines: string; patrol: string; shopping: string; budgetCoins: string; budgetPeriod: "day" | "week"; pitchCooldownMin: string };

// "bread 6 2" per line: item, max price, purchases per period.
const shoppingToText = (rules: { itemKey: string; maxPrice: number; perPeriod: number }[]) => rules.map((r) => `${r.itemKey} ${r.maxPrice} ${r.perPeriod}`).join("\n");
const textToShopping = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
  const [itemKey, maxPrice, perPeriod] = l.split(/\s+/);
  return { itemKey, maxPrice: Number(maxPrice), perPeriod: Number(perPeriod) };
});

export default function DashboardPage() {
  return <Suspense fallback={null}><Dashboard /></Suspense>;
}

function Dashboard() {
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState("");
  const [newSecrets, setNewSecrets] = useState<{ apiKey: string | null; webhookSecret: string | null } | null>(null);
  const [edit, setEdit] = useState<{ pitch: string; persona: string; discountCode: string; discountText: string; tagline: string; webhookUrl: string; agentName: string } | null>(null);
  const [saved, setSaved] = useState("");
  const [biz, setBiz] = useState<BizForm | null>(null);

  const load = useCallback(async (t: string) => {
    if (!t) return;
    const sid = params.get("session_id");
    const res = await fetch(`/api/sponsors?token=${encodeURIComponent(t)}${sid ? `&session_id=${sid}` : ""}`);
    const j = await res.json();
    if (!res.ok) { setErr(j.error ?? "Not found"); return; }
    setD(j); setErr("");
    setBiz((cur) => cur ?? (j.business ? {
      enabled: j.business.settings.enabled,
      pitchLines: j.business.settings.pitchLines.join("\n"),
      patrol: j.business.settings.patrol.join(", "),
      shopping: shoppingToText(j.business.settings.shopping),
      budgetCoins: String(j.business.settings.budgetCoins),
      budgetPeriod: j.business.settings.budgetPeriod,
      pitchCooldownMin: String(j.business.settings.pitchCooldownMin),
    } : null));
    setEdit({ pitch: j.sponsor.pitch, persona: j.sponsor.persona, discountCode: j.sponsor.discountCode, discountText: j.sponsor.discountText, tagline: j.sponsor.tagline, webhookUrl: j.agent?.webhookUrl ?? "", agentName: j.agent?.name ?? j.sponsor.agentName });
    try { localStorage.setItem("grove_sponsor_token", t); } catch { /* ignore */ }
  }, [params]);

  useEffect(() => {
    const t = params.get("token") || (typeof window !== "undefined" ? localStorage.getItem("grove_sponsor_token") ?? "" : "");
    if (t) { setToken(t); void load(t); }
  }, [params, load]);
  useEffect(() => { if (!token) return; const i = setInterval(() => void load(token), 8000); return () => clearInterval(i); }, [token, load]);

  const save = async (extra: Record<string, unknown> = {}) => {
    const res = await fetch("/api/sponsors", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, ...edit, ...extra }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setSaved(j.error ?? "Could not save."); return; }
    // Keys and secrets come back once, right after they are created or rotated.
    if (j.apiKey || j.webhookSecret) setNewSecrets({ apiKey: j.apiKey ?? null, webhookSecret: j.webhookSecret ?? null });
    setSaved("Saved — your agent updated live."); setTimeout(() => setSaved(""), 3000); void load(token);
  };

  if (!d) {
    return (
      <main className="min-h-dvh bg-stone-100 p-4 font-mono">
        <div className="mx-auto max-w-md rounded-xl border-4 border-amber-900/70 bg-amber-50 p-4">
          <Link href="/" className="font-bold text-amber-900">🌳 thegroove</Link>
          <div className="mt-2 text-lg font-bold">Sponsor dashboard</div>
          <p className="text-stone-600">Paste the owner token you received when you reserved your building.</p>
          <form onSubmit={(e) => { e.preventDefault(); void load(token); }} className="mt-2 flex gap-1"><input value={token} onChange={(e) => setToken(e.target.value)} className="flex-1 rounded-lg border-2 border-amber-900/40 px-2 py-1.5" placeholder="owner token" /><button className="rounded-lg bg-orange-500 px-3 font-bold text-white">Open</button></form>
          {err && <div className="mt-2 text-red-700">{err}</div>}
          <div className="mt-3 text-[12px]"><Link href="/sponsor" className="underline">Reserve a building instead</Link></div>
        </div>
      </main>
    );
  }
  const s = d.sponsor;
  const claimed = d.leads.filter((l) => l.kind === "discount_claimed").length;
  const convos = d.leads.filter((l) => l.kind === "conversation").length;
  return (
    <main className="min-h-dvh bg-stone-100 p-4 font-mono text-stone-800">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center gap-3"><Link href="/" className="rounded-lg border-2 border-amber-900/60 bg-amber-100 px-3 py-1 font-bold text-amber-900">🌳 thegroove</Link><span className="rounded px-2 py-0.5 font-bold text-white" style={{ background: s.brandColor }}>{s.businessName}</span><span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ${s.status === "active" ? "bg-emerald-200 text-emerald-900" : s.status === "pending" ? "bg-yellow-200 text-yellow-900" : "bg-stone-300"}`}>{s.status}</span><div className="flex-1" /><Link href="/" className="rounded-lg bg-emerald-600 px-3 py-1 font-bold text-white">See your building live →</Link></div>
        {params.get("welcome") && <div className="mt-3 rounded-lg bg-emerald-100 px-3 py-2 text-emerald-900">🎉 Your sign is up on <b>{d.building?.name}</b> and <b>{d.agent?.name}</b> is standing outside. Bookmark this page — your owner token is in the URL.</div>}
        {s.status === "pending" && <div className="mt-3 rounded-lg bg-yellow-100 px-3 py-2 text-yellow-900">Waiting for payment confirmation. Your agent is in the world but won&apos;t pitch or hand out codes until the subscription is active.</div>}

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Stat label="Codes claimed (billable leads)" v={String(claimed)} />
          <Stat label="First conversations" v={String(convos)} />
          <Stat label="Missions completed" v={String(d.leads.filter((l) => l.kind === "mission_completed").length)} />
          <Stat label="This month" v={`$${(d.billing.totalCents / 100).toFixed(2)}`} sub={`$${(d.billing.rentCents / 100).toFixed(0)} rent + $${(d.billing.leadFeesCents / 100).toFixed(2)} leads`} />
        </div>

        <AttributionWidget token={token} />

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_380px]">
          <section className="rounded-xl border-4 border-amber-900/50 bg-amber-50 p-3">
            <div className="text-lg font-bold text-amber-900">Lead feed</div>
            <div className="text-[11px] text-stone-500">Every code your agent hands out shows up here the moment it happens.</div>
            <div className="mt-2 max-h-[520px] space-y-1 overflow-y-auto">
              {d.leads.length === 0 && <div className="rounded bg-white p-3 text-stone-500">No leads yet. Walk over to {d.building?.name} in the world and talk to {d.agent?.name} to see the loop end to end.</div>}
              {d.leads.map((l) => (
                <div key={l.id} className="flex items-center gap-2 rounded bg-white px-2 py-1.5">
                  <span>{l.kind === "discount_claimed" ? "🎟️" : l.kind === "mission_completed" ? "📜" : "💬"}</span>
                  <div className="flex-1"><div><b>{l.playerName}</b> <span className="text-stone-500">(lv {l.playerLevel})</span> — {l.kind.replace("_", " ")}{l.code && <> · <b className="tracking-widest text-orange-700">{l.code}</b></>}</div><div className="text-[11px] text-stone-500">{l.note}</div></div>
                  <div className="text-right text-[11px] text-stone-500">{new Date(l.createdAt).toLocaleString()}<div className="font-bold text-stone-700">{l.feeCents ? `$${(l.feeCents / 100).toFixed(2)}` : "free"}</div></div>
                </div>
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <div className="rounded-xl border-4 border-amber-900/50 bg-amber-50 p-3">
              <div className="text-lg font-bold text-amber-900">Your agent</div>
              <div className="text-stone-700">{d.agent?.name} · {d.agent?.role}</div>
              <div className="text-[11px] text-stone-500">{d.agent?.kind === "remote" ? "Driven by your webhook" : "Driven by the grove's built-in brain"} · lives at {d.building?.name}</div>
              <div className="mt-1 text-[11px] text-stone-500">Missions it offers: {d.missions.map((m) => m.title).join(", ") || "—"}</div>
              {edit && (
                <div className="mt-3 space-y-2">
                  <F label="Agent name"><input value={edit.agentName} onChange={(e) => setEdit({ ...edit, agentName: e.target.value })} className="inp" /></F>
                  <F label="Persona"><textarea value={edit.persona} onChange={(e) => setEdit({ ...edit, persona: e.target.value })} rows={3} className="inp" /></F>
                  <F label="Pitch (woven into conversation)"><textarea value={edit.pitch} onChange={(e) => setEdit({ ...edit, pitch: e.target.value })} rows={3} className="inp" /></F>
                  <div className="grid grid-cols-2 gap-2"><F label="Code"><input value={edit.discountCode} onChange={(e) => setEdit({ ...edit, discountCode: e.target.value.toUpperCase() })} className="inp" /></F><F label="Tagline"><input value={edit.tagline} onChange={(e) => setEdit({ ...edit, tagline: e.target.value })} className="inp" /></F></div>
                  <F label="What the code gets them"><input value={edit.discountText} onChange={(e) => setEdit({ ...edit, discountText: e.target.value })} className="inp" /></F>
                  <F label="Bring your own agent — webhook URL (optional)"><input value={edit.webhookUrl} onChange={(e) => setEdit({ ...edit, webhookUrl: e.target.value })} placeholder="https://your-agent.example/grove" className="inp" /></F>
                  <div className="text-[11px] text-stone-500">We POST each player message to your webhook with the persona, history and available offers; reply with <code>{`{"text": "...", "offers": ["discount:1"]}`}</code>. See <Link href="/agents" className="underline">the agent API</Link>.</div>
                  <div className="text-[11px] text-stone-500">Agent API key: <code>{d.agent?.keyPrefix ? `${d.agent.keyPrefix}…` : "none yet (save a webhook URL to create one)"}</code>{d.agent?.keyPrefix && <button onClick={() => { if (confirm("Rotate the key? The old one stops working immediately.")) void save({ rotateKey: true }); }} className="ml-2 underline">rotate</button>}</div>
                  {newSecrets && (
                    <div className="rounded-lg border-2 border-amber-600 bg-amber-50 p-2 text-[11px] text-amber-900">
                      <div className="font-bold">Copy these now. They are shown only once.</div>
                      {newSecrets.apiKey && <div>API key: <code className="break-all">{newSecrets.apiKey}</code></div>}
                      {newSecrets.webhookSecret && <div>Webhook secret (verifies x-thegroove-signature): <code className="break-all">{newSecrets.webhookSecret}</code></div>}
                      <button onClick={() => setNewSecrets(null)} className="mt-1 underline">I saved them</button>
                    </div>
                  )}
                  <button onClick={() => save()} className="w-full rounded-lg bg-orange-500 px-3 py-2 font-bold text-white">Save & update agent</button>
                  {biz && (
                    <div className="mt-4 space-y-2 rounded-lg border-2 border-emerald-700/40 bg-emerald-50 p-3">
                      <div className="font-bold text-emerald-900">Business agent</div>
                      <div className="text-[11px] text-stone-600">It walks its patrol, pitches your business to nearby players, and buys from the village with its budget. It never farms, fights or collects coins.</div>
                      {d.business ? (
                        <div className="text-[11px] text-stone-700">Purse: <b>{d.business.purse}</b> coins left this period · pitches in the last 24 h: <b>{d.business.pitchesLast24h}</b> · last decision: {d.business.lastDecision ? `${d.business.lastDecision.action} (${d.business.lastDecision.source})` : "none yet"}</div>
                      ) : null}
                      <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={biz.enabled} onChange={(e) => setBiz({ ...biz, enabled: e.target.checked })} /> Agent is active</label>
                      <F label="Pitch lines (one per line, up to 5)"><textarea value={biz.pitchLines} onChange={(e) => setBiz({ ...biz, pitchLines: e.target.value })} rows={3} className="inp" /></F>
                      <F label="Patrol places (comma-separated place keys, up to 6)"><input value={biz.patrol} onChange={(e) => setBiz({ ...biz, patrol: e.target.value })} placeholder="building:bakery, town:ashford" className="inp" /></F>
                      <F label="Shopping list (one per line: item max-price purchases-per-period)"><textarea value={biz.shopping} onChange={(e) => setBiz({ ...biz, shopping: e.target.value })} rows={3} placeholder={"bread 6 2\nhoney_bun 6 1"} className="inp" /></F>
                      <div className="grid grid-cols-3 gap-2">
                        <F label="Budget (coins)"><input type="number" value={biz.budgetCoins} onChange={(e) => setBiz({ ...biz, budgetCoins: e.target.value })} className="inp" /></F>
                        <F label="Per"><select value={biz.budgetPeriod} onChange={(e) => setBiz({ ...biz, budgetPeriod: e.target.value as "day" | "week" })} className="inp"><option value="day">day</option><option value="week">week</option></select></F>
                        <F label="Pitch cooldown (min)"><input type="number" value={biz.pitchCooldownMin} onChange={(e) => setBiz({ ...biz, pitchCooldownMin: e.target.value })} className="inp" /></F>
                      </div>
                      <div className="text-[11px] text-stone-500">The first budget is added to the purse right away; later budget changes can only lower it, and the budget resets each period.</div>
                      <button onClick={() => void save({
                        business: true,
                        enabled: biz.enabled,
                        pitchLines: biz.pitchLines.split("\n").map((l) => l.trim()).filter(Boolean),
                        patrol: biz.patrol.split(",").map((p) => p.trim()).filter(Boolean),
                        shopping: textToShopping(biz.shopping),
                        budgetCoins: Number(biz.budgetCoins),
                        budgetPeriod: biz.budgetPeriod,
                        pitchCooldownMin: Number(biz.pitchCooldownMin),
                      })} className="w-full rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white">Save agent behaviour</button>
                    </div>
                  )}
                  {saved && <div className="text-emerald-700">{saved}</div>}
                </div>
              )}
            </div>
            <div className="rounded-xl border-4 border-stone-300 bg-white p-3">
              <div className="font-bold">Billing</div>
              <div className="text-[12px] text-stone-600">{d.billing.plan}</div>
              <div className="text-[12px] text-stone-600">{d.paymentsConfigured ? "Charged monthly via Stripe." : "Sandbox mode: no card on file on this deployment."}</div>
              {s.status !== "cancelled" && <button onClick={() => { if (confirm("Cancel your reservation? Your sign comes down and your agent leaves.")) void save({ status: "cancelled" }); }} className="mt-2 rounded-lg bg-stone-200 px-3 py-1 text-[12px] hover:bg-red-100">Cancel reservation</button>}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
function Stat({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return <div className="rounded-xl border-4 border-amber-900/50 bg-amber-50 p-3"><div className="text-[11px] uppercase text-amber-800">{label}</div><div className="text-2xl font-bold text-amber-900">{v}</div>{sub && <div className="text-[11px] text-stone-500">{sub}</div>}</div>;
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-[11px] font-bold uppercase text-amber-800">{label}<div className="mt-0.5 normal-case">{children}</div></label>;
}

function AttributionWidget({ token }: { token: string }) {
  const [data, setData] = useState<{ totals: Record<string, number>; recent: { id: number; type: string; createdAt: string }[] } | null>(null);
  useEffect(() => {
    if (!token) return;
    const load = async () => {
      const r = await fetch(`/api/sponsor/attribution?token=${encodeURIComponent(token)}`);
      if (r.ok) setData(await r.json());
    };
    void load();
    const i = setInterval(load, 8000);
    return () => clearInterval(i);
  }, [token]);
  if (!data) return null;
  const order = ["impression", "approach", "dialogue_start", "mission_accept", "discount_claimed", "lead_submitted"];
  const totals = data.totals ?? {};
  return (
    <section className="mt-3 rounded-xl border-4 border-stone-300 bg-white p-3">
      <div className="text-lg font-bold">Last 7 days — attribution</div>
      <div className="mt-1 grid grid-cols-3 gap-1 sm:grid-cols-6">
        {order.map((t) => (
          <div key={t} className="rounded bg-stone-50 p-2 text-center">
            <div className="text-[10px] uppercase text-stone-500">{t.replace("_", " ")}</div>
            <div className="text-xl font-bold">{totals[t] ?? 0}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
