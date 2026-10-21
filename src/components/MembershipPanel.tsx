"use client";
// Membership in the shop (GET/POST /api/membership): the perks, the two
// plans, and for members their renewal date and "Manage billing".

import { useCallback, useEffect, useState } from "react";
import { manageBilling } from "@/lib/billingClient";
import type { MembershipPlan, MembershipView } from "@/types/membership";

const gold = "#ffd166";
const btn = { background: gold, color: "#1a2238", border: 0, borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" } as const;
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

async function fetchView(): Promise<MembershipView | null> {
  const r = await fetch("/api/membership");
  return r.ok ? ((await r.json()) as MembershipView) : null;
}

export default function MembershipPanel({ onChange }: { onChange: () => void }) {
  const [v, setV] = useState<MembershipView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reload = useCallback(() => fetchView().then(setV), []);
  useEffect(() => {
    let alive = true;
    void fetchView().then((x) => { if (alive) setV(x); });
    return () => { alive = false; };
  }, []);

  const join = async (plan: MembershipPlan) => {
    setBusy(true); setErr("");
    const r = await fetch("/api/membership", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
    const j = (await r.json().catch(() => ({}))) as { url?: string | null; error?: string };
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Something went wrong."); return; }
    if (j.url) { window.location.assign(j.url); return; }
    await reload(); onChange();
  };
  const manage = () => { setBusy(true); void manageBilling("member", "", (m) => { setErr(m); setBusy(false); }); };
  const endSandbox = async () => {
    await fetch("/api/membership", { method: "DELETE" });
    await reload(); onChange();
  };

  if (!v) return null;
  return (
    <div style={{ background: "#0e1830", border: `2px solid ${gold}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: gold }}>⭐ thegroove membership</div>
      {v.granted && <div style={{ marginTop: 8, color: "#7ee787" }}>This month&apos;s gifts are yours: 💎 {v.granted.gems} and the {v.granted.itemName} (in Cosmetics).</div>}
      <ul style={{ margin: "10px 0", paddingLeft: 18, lineHeight: 1.7 }}>
        {v.perks.map((p) => <li key={p}>{p}</li>)}
      </ul>
      {v.member ? (
        <div>
          <div>You&apos;re a member ({v.plan}). {v.currentPeriodEnd && <>{v.cancelAtPeriodEnd ? "Ends" : "Renews"} on {new Date(v.currentPeriodEnd).toLocaleDateString()}.</>} Thank you!</div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            {v.canManage ? <button disabled={busy} onClick={manage} style={btn}>Manage billing</button>
              : <button onClick={() => void endSandbox()} style={{ ...btn, background: "#33415f", color: "#fff" }}>End (sandbox)</button>}
          </div>
        </div>
      ) : v.needsSave ? (
        <div style={{ color: "#ffb4a2" }}>Save your character first (menu → 💾 Save character), so your membership can never be lost.</div>
      ) : !v.open ? (
        <div style={{ color: gold }}>Membership opens soon.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {(["monthly", "yearly"] as const).map((k) => (
            <div key={k} style={{ background: "#16244a", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 700 }}>{v.plans[k].label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: gold }}>{usd(v.plans[k].priceCents)}<span style={{ fontSize: 12, color: "#9aa" }}>/{v.plans[k].per}</span></div>
              <div style={{ fontSize: 12, color: "#9aa", marginBottom: 8 }}>{v.plans[k].blurb}</div>
              <button disabled={busy} onClick={() => void join(k)} style={btn}>{busy ? "…" : "Join"}</button>
            </div>
          ))}
        </div>
      )}
      {err && <div style={{ marginTop: 8, color: "#ff8a8a" }}>{err}</div>}
    </div>
  );
}
