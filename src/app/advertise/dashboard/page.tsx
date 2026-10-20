"use client";
// An advertiser's billboard (by owner token): status, views and clicks,
// a new poster or link (reviewed again), cancel.
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { posterUrl } from "@/lib/billboards";
import type { BillboardDashboard, BillboardStatus } from "@/types/billboard";

const STATUS: Record<BillboardStatus, { label: string; tone: string; note: string }> = {
  pending: { label: "Awaiting payment", tone: "bg-stone-200 text-stone-800", note: "Finish the checkout to send your poster for review." },
  review: { label: "In review", tone: "bg-yellow-100 text-yellow-900", note: "Paid. We review every poster before it goes up, usually within a day." },
  active: { label: "Live in the world", tone: "bg-green-100 text-green-900", note: "Your poster is up. Players see it as they pass." },
  rejected: { label: "Not approved", tone: "bg-red-100 text-red-900", note: "Your payment has been refunded." },
  cancelled: { label: "Ended", tone: "bg-stone-200 text-stone-800", note: "This billboard has come down." },
};

export default function BillboardDashboardPage() {
  return <Suspense fallback={null}><Dashboard /></Suspense>;
}

function Dashboard() {
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [d, setD] = useState<BillboardDashboard | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState({ title: "", link: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  // Fetch and apply are split so the mount effect only sets state in a callback.
  const fetchDash = useCallback((t: string) => {
    const sid = params.get("session_id");
    return fetch(`/api/billboards?token=${encodeURIComponent(t)}${sid ? `&session_id=${encodeURIComponent(sid)}` : ""}`)
      .then(async (res) => ({ ok: res.ok, j: await res.json().catch(() => ({})) }));
  }, [params]);
  const apply = useCallback(({ ok, j }: Awaited<ReturnType<typeof fetchDash>>) => {
    if (!ok) { setErr(j.error ?? "Not found"); setD(null); return; }
    setErr(""); setD(j);
  }, []);
  const load = useCallback((t: string) => fetchDash(t).then(apply), [fetchDash, apply]);

  useEffect(() => {
    const t = params.get("token");
    if (t) void fetchDash(t).then(apply);
  }, [params, fetchDash, apply]);

  const send = async (body: FormData, done: string) => {
    setBusy(true); setMsg("");
    body.set("token", token);
    const res = await fetch("/api/billboards", { method: "PATCH", body });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error ?? "Something went wrong."); return; }
    setMsg(done); setFile(null); setEdit({ title: "", link: "" });
    void load(token);
  };

  const submitChange = (e: React.FormEvent) => {
    e.preventDefault();
    const body = new FormData();
    if (edit.title) body.set("title", edit.title);
    if (edit.link) body.set("link", edit.link);
    if (file) body.set("image", file);
    void send(body, "Sent for review. Your current poster stays up meanwhile.");
  };
  const cancel = () => {
    if (!confirm("Stop renewing this billboard? It stays up until the end of the month you've paid for.")) return;
    const body = new FormData();
    body.set("cancel", "1");
    void send(body, "Cancelled. It stays up until the end of the paid month.");
  };

  const q = `?token=${encodeURIComponent(token)}`;
  const ctr = d && d.impressions ? ((d.clicks / d.impressions) * 100).toFixed(1) : "0.0";
  const maxDay = Math.max(1, ...(d?.days.map((x) => x.impressions) ?? [1]));
  const ended = d && (d.status === "rejected" || d.status === "cancelled");

  return (
    <main className="min-h-dvh bg-stone-100 p-4 font-mono text-stone-800">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center gap-3"><Link href="/" className="rounded-lg border-2 border-amber-900/60 bg-amber-100 px-3 py-1 font-bold text-amber-900">🌳 thegroove</Link><span className="text-stone-500">your billboard</span><div className="flex-1" /><Link href="/advertise" className="underline">Rent another</Link></div>
        {!d && (
          <form onSubmit={(e) => { e.preventDefault(); void load(token); }} className="mt-6 flex gap-2">
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Your billboard token" className="flex-1 rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5" />
            <button className="rounded-lg bg-orange-500 px-4 py-1.5 font-bold text-white">Open</button>
          </form>
        )}
        {err && <div className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-red-800">{err}</div>}
        {d && (
          <>
            <section className="mt-6 rounded-xl border-4 border-amber-900/70 bg-amber-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-amber-900">{d.spot?.name ?? "Billboard"}</h1>
                <span className={`rounded px-2 py-0.5 text-[12px] font-bold ${STATUS[d.status].tone}`}>{STATUS[d.status].label}</span>
                <div className="flex-1" />
                <span className="text-sm">${(d.priceCents / 100).toFixed(0)}/mo</span>
              </div>
              <p className="mt-1 text-[13px] text-stone-700">{STATUS[d.status].note}{d.rejectReason ? ` ${d.rejectReason}` : ""}</p>
              {d.cancelAtPeriodEnd && d.currentPeriodEnd && <p className="mt-1 text-[13px] text-stone-700">Not renewing: comes down on {new Date(d.currentPeriodEnd).toLocaleDateString()}.</p>}
              <p className="mt-2 text-[11px] text-stone-500">Keep this page&apos;s address (or your token) to come back: <code className="break-all">{token}</code></p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Poster label="Live" file={d.poster} q={q} title={d.title} link={d.linkUrl} />
                {(d.pendingPoster || d.pendingTitle || d.pendingLinkUrl) && <Poster label="Waiting for review" file={d.pendingPoster} q={q} title={d.pendingTitle} link={d.pendingLinkUrl} />}
              </div>
            </section>

            <section className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="Views" value={d.impressions.toLocaleString()} />
              <Stat label="Clicks" value={d.clicks.toLocaleString()} />
              <Stat label="Click rate" value={`${ctr}%`} />
            </section>
            <section className="mt-2 rounded-xl border-2 border-stone-200 bg-white p-3">
              <div className="text-[11px] font-bold uppercase text-stone-500">Last 30 days</div>
              {!d.impressions ? <p className="mt-1 text-[13px] text-stone-500">No views yet.</p> : (
                <div className="mt-2 flex h-24 items-end gap-0.5">
                  {d.days.map((x) => <div key={x.day} title={`${x.day}: ${x.impressions} views, ${x.clicks} clicks`} className="flex-1 rounded-t bg-orange-400" style={{ height: `${(x.impressions / maxDay) * 100}%`, minHeight: x.impressions ? 2 : 0 }} />)}
                </div>
              )}
            </section>

            {!ended && (
              <form onSubmit={submitChange} className="mt-4 space-y-2 rounded-xl border-2 border-stone-200 bg-white p-3">
                <div className="font-bold text-amber-900">Change the poster or link</div>
                <p className="text-[12px] text-stone-600">Changes are reviewed too; what&apos;s live now stays up until they&apos;re approved.</p>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
                <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={40} placeholder="New title (optional)" className="w-full rounded-lg border-2 border-amber-900/40 px-2 py-1.5 text-sm" />
                <input value={edit.link} onChange={(e) => setEdit({ ...edit, link: e.target.value })} placeholder="New link (optional)" className="w-full rounded-lg border-2 border-amber-900/40 px-2 py-1.5 text-sm" />
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy || (!file && !edit.title && !edit.link)} className="rounded-lg bg-orange-500 px-4 py-1.5 font-bold text-white disabled:opacity-50">Send for review</button>
                  <div className="flex-1" />
                  {!d.cancelAtPeriodEnd && <button type="button" onClick={cancel} disabled={busy} className="rounded-lg border-2 border-red-300 px-3 py-1.5 text-red-700">Cancel billboard</button>}
                </div>
                {msg && <div className="rounded-lg bg-stone-100 px-3 py-2 text-[13px]">{msg}</div>}
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Poster({ label, file, q, title, link }: { label: string; file: string | null; q: string; title: string | null; link: string | null }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase text-stone-500">{label}</div>
      <div className="mt-1 flex aspect-[2/1] w-full max-w-xs items-center justify-center overflow-hidden rounded border-4 border-amber-800 bg-amber-200 text-[11px] text-amber-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {file ? <img src={`${posterUrl(file)}${q}`} alt={title ?? "Poster"} className="h-full w-full object-cover" style={{ imageRendering: "pixelated" }} /> : "no poster yet"}
      </div>
      {title && <div className="mt-1 text-sm font-bold">{title}</div>}
      {link && <div className="break-all text-[12px] text-stone-600">{link}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border-2 border-stone-200 bg-white p-3"><div className="text-[11px] font-bold uppercase text-stone-500">{label}</div><div className="text-2xl font-bold text-orange-600">{value}</div></div>;
}
