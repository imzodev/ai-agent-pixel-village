"use client";
// How the game is doing (GET /api/admin/stats): signups, daily players,
// visitors, retention, the tutorial funnel and sharing. Asks for the admin
// token once (kept for this tab only). Shown only at the secret address
// ADMIN_PAGE_PATH (src/app/[slug]/page.tsx).

import { useCallback, useEffect, useState } from "react";
import AdminBillboards from "./AdminBillboards";
import type { DayCount, StatsView } from "@/types/analytics";

const TOKEN_KEY = "grove_admin_token";

async function fetchStats(t: string): Promise<{ ok: boolean; status: number; stats: StatsView | null }> {
  const r = await fetch("/api/admin/stats", { headers: { "x-admin-token": t } });
  return { ok: r.ok, status: r.status, stats: r.ok ? ((await r.json()) as StatsView) : null };
}

function savedToken(): string {
  try { return typeof window === "undefined" ? "" : sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; }
}

export default function StatsDashboard() {
  const [token, setToken] = useState(savedToken);
  const [stats, setStats] = useState<StatsView | null>(null);
  const [err, setErr] = useState("");

  const show = useCallback((r: { ok: boolean; status: number; stats: StatsView | null }, t: string) => {
    if (!r.ok) { setErr(r.status === 404 ? "Wrong token (or ADMIN_TOKEN isn't set on the server)." : `Error ${r.status}`); setStats(null); return; }
    try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ }
    setErr("");
    setStats(r.stats);
  }, []);
  const load = useCallback(async (t: string) => show(await fetchStats(t), t), [show]);

  // A token from earlier in this tab: show the numbers straight away.
  const [initial] = useState(savedToken);
  useEffect(() => {
    if (!initial) return;
    let alive = true;
    void fetchStats(initial).then((r) => { if (alive) show(r, initial); });
    return () => { alive = false; };
  }, [initial, show]);

  if (!stats) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#141c3c] p-4 text-white">
        <form onSubmit={(e) => { e.preventDefault(); void load(token); }} className="w-full max-w-sm rounded-xl bg-white/5 p-4">
          <h1 className="text-xl font-extrabold">📊 thegroove stats</h1>
          <input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder="Admin token" className="mt-3 w-full rounded-lg bg-white/10 px-3 py-2 outline-none" autoFocus />
          {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
          <button className="mt-3 w-full rounded-lg bg-emerald-500 px-3 py-2 font-bold">Show</button>
        </form>
      </main>
    );
  }
  const s = stats;
  const pct = (a: number | null, b: number) => (a === null ? "…" : b ? `${Math.round((100 * a) / b)}%` : "–");
  return (
    <main className="min-h-dvh bg-[#141c3c] px-4 py-6 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold">📊 thegroove stats</h1>
          <span className="flex-1" />
          <button onClick={() => void load(token)} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold hover:bg-white/20">Refresh</button>
        </div>
        <p className="text-sm text-stone-400">Last 30 days · {new Date(s.generatedAt).toLocaleString()}</p>

        {s.revenue && <Revenue r={s.revenue} />}
        <h2 className="mt-8 text-lg font-extrabold text-amber-300">Billboards to review</h2>
        <AdminBillboards token={token} />
        {s.whistle && <Whistle w={s.whistle} token={token} onChange={() => void load(token)} />}

        <h2 className="mt-8 text-lg font-extrabold text-amber-300">Players</h2>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Players, all time" v={s.totals.players} />
          <Stat label="New players (30 days)" v={s.totals.signups30d} />
          <Stat label="Played today" v={s.totals.activeToday} />
          <Stat label="Played this week" v={s.totals.active7d} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Bars title="New players a day" data={s.signups} color="bg-emerald-400" />
          <Bars title="Players a day" data={s.daily} color="bg-sky-400" />
          <Bars title="Visitors watching a day" data={s.visitors} color="bg-amber-300" />
        </div>

        <h2 className="mt-8 text-lg font-extrabold text-amber-300">Do they come back?</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-stone-400"><tr><th>Joined</th><th>New</th><th>Back next day</th><th>Back after a week</th></tr></thead>
          <tbody>{[...s.retention].reverse().map((r) => <tr key={r.day} className="border-t border-white/10"><td className="py-1">{r.day}</td><td>{r.cohort}</td><td>{pct(r.d1, r.cohort)}</td><td>{pct(r.d7, r.cohort)}</td></tr>)}</tbody>
        </table>

        <h2 className="mt-8 text-lg font-extrabold text-amber-300">The tutorial (new players, 30 days)</h2>
        <div className="mt-2 space-y-1">
          {s.tutorial.map((t) => (
            <div key={t.step} className="flex items-center gap-2 text-sm">
              <div className="w-64 shrink-0 truncate">{t.step}</div>
              <div className="h-3 flex-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-violet-400" style={{ width: `${s.tutorial[0].n ? (100 * t.n) / s.tutorial[0].n : 0}%` }} /></div>
              <div className="w-20 text-right">{t.n} <span className="text-stone-400">{pct(t.n, s.tutorial[0].n)}</span></div>
            </div>
          ))}
        </div>

        <h2 className="mt-8 text-lg font-extrabold text-amber-300">Sharing</h2>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Moments earned" v={s.sharing.momentsCreated} />
          <Stat label="Share clicks" v={Object.values(s.sharing.shareClicks).reduce((a, b) => a + b, 0)} sub={Object.entries(s.sharing.shareClicks).map(([k, v]) => `${k} ${v}`).join(" · ")} />
          <Stat label="Moment page views" v={s.sharing.momentViews} />
          <Stat label="Profile views" v={s.sharing.profileViews} />
          <Stat label="Joined from a share" v={s.sharing.signupsFromShares} />
        </div>

        <h2 className="mt-8 text-lg font-extrabold text-amber-300">Where people come from <span className="text-sm font-normal text-stone-400">(last 30 days · tag links with ?ref=x or utm_source / utm_campaign)</span></h2>
        <div className="mt-2 overflow-x-auto rounded-lg bg-white/5">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-stone-400"><tr><th className="px-3 py-2">Source</th><th className="px-3 py-2 text-right">First visits</th><th className="px-3 py-2 text-right">Signups</th><th className="px-3 py-2 text-right">Signup rate</th><th className="px-3 py-2 text-right">Back next day</th><th className="px-3 py-2 text-right">Back a week later</th></tr></thead>
            <tbody>
              {(s.bySource ?? []).length === 0 && <tr><td colSpan={6} className="px-3 py-3 text-stone-400">No visits recorded yet.</td></tr>}
              {(s.bySource ?? []).map((r) => (
                <tr key={r.src} className="border-t border-white/5">
                  <td className="px-3 py-1.5 font-bold">{r.src}{r.campaigns.length > 0 && <span className="ml-2 text-xs font-normal text-stone-400">{r.campaigns.join(", ")}</span>}</td>
                  <td className="px-3 py-1.5 text-right">{r.landings}</td>
                  <td className="px-3 py-1.5 text-right">{r.signups}</td>
                  <td className="px-3 py-1.5 text-right">{r.landings ? pct(r.signups, r.landings) : "—"}</td>
                  <td className="px-3 py-1.5 text-right">{r.d1Of ? `${r.d1}/${r.d1Of} ${pct(r.d1, r.d1Of)}` : "—"}</td>
                  <td className="px-3 py-1.5 text-right">{r.d7Of ? `${r.d7}/${r.d7Of} ${pct(r.d7, r.d7Of)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/** MRR first (the goal), then what makes it up, then one-off gem sales. */
/** Whistle: is the campaign game played, does it bring players, anything odd at the top? */
function Whistle({ w, token, onChange }: { w: StatsView["whistle"]; token: string; onChange: () => void }) {
  const hide = async (id: string) => {
    if (!confirm("Take this run off the boards?")) return;
    await fetch("/api/admin/whistle", { method: "POST", headers: { "x-admin-token": token, "content-type": "application/json" }, body: JSON.stringify({ runId: id, hide: true }) });
    onChange();
  };
  return (
    <>
      <h2 className="mt-8 text-lg font-extrabold text-amber-300">🐑 Whistle</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Plays (7 days)" v={w.plays7d} />
        <Stat label="Runs sent in (7 days)" v={w.runs7d} />
        <Stat label="Players (7 days)" v={w.players7d} />
        <Stat label="Joined through it (30 days)" v={w.joined30d} />
        <Stat label="Shares (30 days)" v={w.shares30d} />
      </div>
      <div className="mt-2 grid gap-4 lg:grid-cols-3">
        <Bars title="Plays a day" data={w.playsDaily} color="bg-lime-400" />
        <div className="rounded-lg bg-white/5 p-3 text-sm lg:col-span-2">
          <div className="font-bold">Today&apos;s top runs</div>
          {w.topToday.length === 0 && <div className="text-stone-400">None yet.</div>}
          {w.topToday.map((r) => (
            <div key={r.id} className="mt-1 flex items-center gap-2 text-[12px]">
              <a href={`/whistle/r/${r.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate underline">{r.name}</a>
              <span className="tabular-nums">{r.score.toLocaleString()} · {r.penned} in · {r.lost} lost · {r.whistles} whistles</span>
              <button onClick={() => void hide(r.id)} className="text-red-300 underline">hide</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Revenue({ r }: { r: StatsView["revenue"] }) {
  const ctr = r.ads30d.impressions ? `${((100 * r.ads30d.clicks) / r.ads30d.impressions).toFixed(1)}% click rate` : "no views yet";
  return (
    <>
      <h2 className="mt-6 text-lg font-extrabold text-amber-300">Revenue</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Money label="MRR" v={usd(r.mrrCents)} sub={r.cancellingCents ? `${usd(r.cancellingCents)} ending` : `ARR ${usd(r.mrrCents * 12)}`} />
        <Money label="Members" v={usd(r.members?.mrrCents ?? 0)} sub={`${r.members?.active ?? 0} (${r.members?.yearly ?? 0} yearly) · +${r.members?.joined30d ?? 0} / −${r.members?.ended30d ?? 0} in 30 days`} />
        <Money label="Sponsors" v={usd(r.sponsors.mrrCents)} sub={`${r.sponsors.active} active`} />
        <Money label="Billboards" v={usd(r.billboards.mrrCents)} sub={`${r.billboards.paid} paid · ${r.billboards.inReview} in review`} />
        <Money label="Gems (30 days)" v={usd(r.gems30d.cents)} sub={`${r.gems30d.purchases} buys · ${r.gems30d.payers} payers`} />
      </div>
      <div className="mt-2 grid gap-4 lg:grid-cols-3">
        <Bars title="Gem sales a day (cents)" data={r.gemDaily} color="bg-fuchsia-400" />
        <div className="rounded-lg bg-white/5 p-3 text-sm">
          <div className="font-bold">Billboard spots held</div>
          {r.billboards.byTier.map((t) => <div key={t.tier} className="mt-1 flex justify-between"><span>{t.tier} · {usd(t.priceCents)}/mo</span><span>{t.held} / {t.total}</span></div>)}
          <div className="mt-2 text-[11px] text-stone-400">Full: {usd(r.billboards.byTier.reduce((s, t) => s + t.total * t.priceCents, 0))}/mo</div>
        </div>
        <div className="rounded-lg bg-white/5 p-3 text-sm">
          <div className="font-bold">Ads, last 30 days</div>
          <div className="mt-1">{r.ads30d.impressions.toLocaleString()} views · {r.ads30d.clicks.toLocaleString()} clicks</div>
          <div className="text-[11px] text-stone-400">{ctr}</div>
          <div className="mt-2 font-bold">Towards paying (30 days)</div>
          {(r.funnel30d ?? []).map((f, i, all) => (
            <div key={f.step} className="flex justify-between text-[12px]"><span>{f.step}</span><span>{f.players}{i > 0 && all[0].players ? ` · ${((100 * f.players) / all[0].players).toFixed(1)}%` : ""}</span></div>
          ))}
          <div className="mt-2 font-bold">Lead fees (30 days)</div>
          <div>{usd(r.leadFees30dCents)} <span className="text-[11px] text-stone-400">tracked, not billed</span></div>
        </div>
      </div>
    </>
  );
}

function Money({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return <div className="rounded-lg bg-white/5 p-3"><div className="text-[11px] uppercase tracking-wider text-stone-400">{label}</div><div className="text-2xl font-extrabold">{v}</div>{sub && <div className="text-[11px] text-stone-400">{sub}</div>}</div>;
}

function Stat({ label, v, sub }: { label: string; v: number; sub?: string }) {
  return <div className="rounded-lg bg-white/5 p-3"><div className="text-[11px] uppercase tracking-wider text-stone-400">{label}</div><div className="text-2xl font-extrabold">{v}</div>{sub && <div className="text-[11px] text-stone-400">{sub}</div>}</div>;
}

function Bars({ title, data, color }: { title: string; data: DayCount[]; color: string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div className="rounded-lg bg-white/5 p-3">
      <div className="text-sm font-bold">{title}</div>
      <div className="mt-2 flex h-28 items-end gap-[2px]">
        {data.map((d) => <div key={d.day} title={`${d.day}: ${d.n}`} className={`flex-1 rounded-t ${color}`} style={{ height: `${(100 * d.n) / max}%`, minHeight: d.n ? 2 : 0 }} />)}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-stone-400"><span>{data[0]?.day.slice(5)}</span><span>today {data.at(-1)?.n ?? 0}</span></div>
    </div>
  );
}
