"use client";
// Billboards waiting for review, and the ones up (GET/POST /api/admin/billboards).
// Posters are fetched with the admin token (a poster in review isn't public).
// Links are shown as text, not followed.

import { useCallback, useEffect, useState } from "react";
import { posterUrl } from "@/lib/billboards";
import type { AdminBillboardAction, AdminBillboardRow } from "@/types/billboard";

async function fetchRows(token: string): Promise<AdminBillboardRow[]> {
  const r = await fetch("/api/admin/billboards", { headers: { "x-admin-token": token } });
  return r.ok ? ((await r.json()) as { billboards: AdminBillboardRow[] }).billboards : [];
}

export default function AdminBillboards({ token }: { token: string }) {
  const [list, setList] = useState<AdminBillboardRow[] | null>(null);
  const [reason, setReason] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState("");

  const reload = useCallback(() => fetchRows(token).then(setList), [token]);
  useEffect(() => {
    let alive = true;
    void fetchRows(token).then((rows) => { if (alive) setList(rows); });
    return () => { alive = false; };
  }, [token]);

  const act = async (id: number, action: AdminBillboardAction) => {
    if (action !== "approve" && !confirm(action === "reject" ? "Reject it? A new billboard is refunded." : "Take it down? No refund.")) return;
    const r = await fetch("/api/admin/billboards", { method: "POST", headers: { "x-admin-token": token, "content-type": "application/json" }, body: JSON.stringify({ id, action, reason: reason[id] ?? "" }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `#${id}: ${action} done.` : `#${id}: ${j.error ?? r.status}`);
    void reload();
  };

  if (!list) return null;
  const waiting = list.filter((b) => b.status === "review" || b.pendingPoster || b.pendingTitle || b.pendingLinkUrl);
  const live = list.filter((b) => !waiting.includes(b));
  return (
    <div className="mt-3 space-y-3">
      {msg && <p className="text-sm text-amber-200">{msg}</p>}
      {waiting.length === 0 && <p className="text-sm text-stone-400">Nothing waiting for review.</p>}
      {waiting.map((b) => (
        <div key={b.id} className="rounded-lg bg-white/5 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <b>#{b.id} {b.spotName}</b><span className="text-stone-400">{b.tier} · ${b.priceCents / 100}/mo · {b.contactEmail}</span>
            <span className="rounded bg-amber-400/20 px-1.5 text-[11px] text-amber-200">{b.status === "review" ? "new" : "change"}</span>
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {b.poster && <Poster token={token} file={b.poster} label="Live" title={b.title} link={b.linkUrl} />}
            <Poster token={token} file={b.pendingPoster ?? b.poster} label="To review" title={b.pendingTitle ?? b.title} link={b.pendingLinkUrl ?? b.linkUrl} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => void act(b.id, "approve")} className="rounded bg-emerald-500 px-3 py-1 text-sm font-bold">Approve</button>
            <input value={reason[b.id] ?? ""} onChange={(e) => setReason({ ...reason, [b.id]: e.target.value })} placeholder="Reason (sent with a rejection)" className="min-w-0 flex-1 rounded bg-white/10 px-2 py-1 text-sm" />
            <button onClick={() => void act(b.id, "reject")} className="rounded bg-red-500/80 px-3 py-1 text-sm font-bold">Reject</button>
          </div>
        </div>
      ))}
      {live.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase text-stone-400"><tr><th>Up now</th><th>Tier</th><th>Views</th><th>Clicks</th><th /></tr></thead>
          <tbody>
            {live.map((b) => (
              <tr key={b.id} className="border-t border-white/10">
                <td className="py-1">#{b.id} {b.spotName}: {b.title}</td><td>{b.tier}</td><td>{b.impressions}</td><td>{b.clicks}</td>
                <td className="text-right"><button onClick={() => void act(b.id, "takedown")} className="text-[12px] text-red-300 underline">take down</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Poster({ token, file, label, title, link }: { token: string; file: string | null; label: string; title: string | null; link: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    let url: string | null = null;
    let alive = true;
    void fetch(posterUrl(file), { headers: { "x-admin-token": token } }).then((r) => (r.ok ? r.blob() : null)).then((b) => {
      if (!alive || !b) return;
      url = URL.createObjectURL(b);
      setSrc(url);
    });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [file, token]);
  return (
    <div>
      <div className="text-[11px] uppercase text-stone-400">{label}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="mt-1 aspect-[2/1] w-full max-w-xs rounded border-2 border-white/20 object-cover" style={{ imageRendering: "pixelated" }} /> : <div className="mt-1 aspect-[2/1] w-full max-w-xs rounded bg-white/10" />}
      {title && <div className="mt-1 text-sm font-bold">{title}</div>}
      {link && <div className="break-all font-mono text-[11px] text-stone-300">{link}</div>}
    </div>
  );
}
