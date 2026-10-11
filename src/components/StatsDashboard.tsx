"use client";
// How the game is doing (GET /api/admin/stats): signups, daily players,
// visitors, retention, the tutorial funnel and sharing. Asks for the admin
// token once (kept for this tab only). Shown only at the secret address
// ADMIN_PAGE_PATH (src/app/[slug]/page.tsx).

import { useCallback, useEffect, useState } from "react";
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
      </div>
    </main>
  );
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
