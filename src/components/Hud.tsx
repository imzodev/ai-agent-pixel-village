"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { bus, ITEM_ICONS, type Selection, type Snapshot } from "@/game/bus";

type Offer = { id: string; type: string; label: string; line: string };
type InvItem = { id: number; itemKey: string; qty: number; equipped: boolean; meta: Record<string, unknown>; def: { name: string; kind: string; description: string; icon: string; equippable: boolean; placeable: boolean } | null };
type Mission = { id: number; missionId: number; title: string; description: string; status: string; progress: number; target: number; npcName: string; npcId: number; sponsored: boolean; reward: { coins?: number; xp?: number; items?: { itemKey: string; qty: number }[] } };
type Me = { me: { id: number; name: string; coins: number; hp: number; maxHp: number; level: number; xp: number; homeTheme: { wall: string; floor: string } } | null; inventory: InvItem[]; missions: Mission[]; decor: { id: number; itemKey: string; gx: number; gy: number }[]; codesClaimed: number };
type Inspect = { title: string; subtitle?: string; lines: string[]; events?: { text: string; when: string }[]; target?: { type: string; id: number; x?: number; y?: number; key?: string; reservable?: boolean } };

const WEATHER_ICON: Record<string, string> = { clear: "☀️", rain: "🌧️", fog: "🌫️", snow: "❄️" };

async function api<T = unknown>(url: string, body?: unknown, method = body ? "POST" : "GET"): Promise<T & { error?: string }> {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}

export default function Hud() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [panel, setPanel] = useState<"bag" | "missions" | "log" | "home" | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: string }[]>([]);
  const [talk, setTalk] = useState<{ npcId: number; name: string; role: string; sponsor: { businessName: string; brandColor: string } | null; lines: { role: string; text: string }[]; offers: Offer[]; busy: boolean } | null>(null);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [building, setBuilding] = useState<{ key: string; name: string } | null>(null);
  const [auth, setAuth] = useState<"login" | null>(null);
  const [chat, setChat] = useState("");
  const [ask, setAsk] = useState("");
  const [gained, setGained] = useState<{ id: number; text: string }[]>([]);
  const talkInput = useRef<HTMLInputElement>(null);
  const toastId = useRef(0);

  const toast = useCallback((text: string, kind = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-4), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const refreshMe = useCallback(async () => setMe(await api<Me>("/api/me")), []);

  useEffect(() => {
    const u = [
      bus.on("snapshot", setSnap),
      bus.on("select", setSel),
      bus.on("toast", (t) => toast(t.text, t.kind)),
      bus.on("refreshMe", () => void refreshMe()),
    ];
    void refreshMe();
    return () => u.forEach((f) => f());
  }, [toast, refreshMe]);
  useEffect(() => { if (snap?.me && !me?.me) void refreshMe(); }, [snap?.me, me?.me, refreshMe]);
  // keep the selection's distance live as the player walks
  useEffect(() => {
    if (!snap?.me || !sel) return;
    const pos = entityPos(snap, sel);
    if (!pos) return;
    const d = Math.hypot(pos.x - snap.me.x, pos.y - snap.me.y);
    if (Math.abs(d - sel.distance) > 4) setSel({ ...sel, distance: d });
  }, [snap, sel]);

  const showGain = (items: { itemKey: string; qty: number; label?: string }[]) => {
    for (const g of items) {
      const id = ++toastId.current;
      setGained((x) => [...x, { id, text: `${ITEM_ICONS[g.itemKey] ?? "📦"} +${g.qty} ${g.label ?? g.itemKey.replace("_", " ")}` }]);
      setTimeout(() => setGained((x) => x.filter((y) => y.id !== id)), 2600);
    }
  };

  // ---------- actions ----------
  const act = async (body: Record<string, unknown>) => {
    const r = await api<{ ok?: boolean; message?: string; gained?: { itemKey: string; qty: number }[]; missions?: string[] }>("/api/act", body);
    if (r.error) toast(r.error, "bad");
    else { if (r.message) toast(r.message, "good"); if (r.gained?.length) showGain(r.gained); if (r.missions?.length) toast(`Mission progress: ${r.missions.join(", ")}`, "good"); void refreshMe(); bus.emit("poke", undefined); }
    return r;
  };
  const doInspect = async (q: string) => {
    const r = await api<Inspect>(q);
    if (r.error) toast(r.error, "bad"); else setInspect(r);
  };
  const startTalk = async (npcId: number, name: string, role: string) => {
    setTalk({ npcId, name, role, sponsor: null, lines: [], offers: [], busy: true });
    setSel(null);
    const hist = await api<{ history: { role: string; text: string }[] }>(`/api/npc/${npcId}/talk`);
    const r = await api<{ text: string; offers: Offer[]; npc: { sponsor: { businessName: string; brandColor: string } | null } }>(`/api/npc/${npcId}/talk`, { message: "" });
    if (r.error) { toast(r.error, "bad"); setTalk(null); return; }
    setTalk({ npcId, name, role, sponsor: r.npc.sponsor, lines: [...(hist.history ?? []).slice(-6), { role: "npc", text: r.text }], offers: r.offers, busy: false });
    setTimeout(() => talkInput.current?.focus(), 50);
  };
  const sendTalk = async (message: string) => {
    if (!talk || talk.busy) return;
    setTalk({ ...talk, lines: [...talk.lines, { role: "player", text: message }], busy: true });
    const r = await api<{ text: string; offers: Offer[] }>(`/api/npc/${talk.npcId}/talk`, { message });
    if (r.error) { toast(r.error, "bad"); setTalk((t) => t && { ...t, busy: false }); return; }
    setTalk((t) => t && { ...t, lines: [...t.lines, { role: "npc", text: r.text }], offers: r.offers, busy: false });
  };
  const acceptOffer = async (offerId: string) => {
    if (!talk) return;
    const r = await api<{ text: string; gained: { itemKey: string; qty: number; label?: string }[]; offers: Offer[] }>(`/api/npc/${talk.npcId}/accept`, { offerId });
    if (r.error) { toast(r.error, "bad"); return; }
    if (r.gained?.length) showGain(r.gained);
    setTalk((t) => t && { ...t, lines: [...t.lines, { role: "npc", text: r.text }], offers: t.offers.filter((o) => o.id !== offerId && r.offers.some((x) => x.id === o.id)) });
    void refreshMe();
    toast(offerId.startsWith("discount") ? "Discount code added to your bag 🎟️" : offerId.startsWith("mission") ? "Mission accepted" : offerId.startsWith("turnin") ? "Mission complete!" : "Received", "good");
  };
  const invAction = async (body: Record<string, unknown>, method = "POST") => {
    const r = await api<{ message?: string }>("/api/items", body, method);
    if (r.error) toast(r.error, "bad"); else { if (r.message) toast(r.message, "good"); void refreshMe(); bus.emit("poke", undefined); }
  };
  const enterBuilding = async (key: string, name: string) => {
    await act({ action: "enter", key });
    if (key === "homes") setPanel("home"); else setBuilding({ key, name });
    setSel(null);
  };

  const hour = snap ? clockFrom(snap) : 7;
  const hh = Math.floor(hour), mm = Math.floor((hour % 1) * 60);
  const loggedIn = !!snap?.me;
  const npcsInBuilding = building ? snap?.npcs.filter((n) => { const b = snap.buildings.find((b) => b.key === building.key); if (!b) return false; return Math.hypot(n.x - b.doorX, n.y - b.doorY) < 200; }) ?? [] : [];
  const bInfo = building ? snap?.buildings.find((b) => b.key === building.key) : null;

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-mono text-[13px] text-stone-800">
      {/* Top bar */}
      <div className="pointer-events-auto absolute left-0 right-0 top-0 flex flex-wrap items-center gap-2 bg-gradient-to-b from-black/50 to-transparent p-2 text-white">
        <div className="rounded-lg border-2 border-amber-900/60 bg-amber-100 px-3 py-1 text-base font-bold tracking-tight text-amber-900 shadow">🌳 thegrove</div>
        <div className="rounded-lg bg-black/40 px-2 py-1">{WEATHER_ICON[snap?.weather ?? "clear"]} {snap?.weather ?? "…"} · 🕰 {String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}</div>
        <div className="rounded-lg bg-black/40 px-2 py-1">👥 {snap?.players.length ?? 0} online · 🤖 {snap?.npcs.length ?? 0} agents</div>
        <div className="flex-1" />
        {loggedIn && me?.me && (
          <div className="flex items-center gap-2 rounded-lg bg-black/40 px-2 py-1">
            <span className="font-bold text-amber-200">{me.me.name}</span> <span>Lv {me.me.level}</span>
            <span className="h-2 w-20 overflow-hidden rounded bg-black/50"><span className="block h-full bg-red-500" style={{ width: `${(100 * (snap?.me?.hp ?? me.me.hp)) / (snap?.me?.maxHp ?? me.me.maxHp)}%` }} /></span>
            <span>❤️ {snap?.me?.hp ?? me.me.hp}</span><span>🪙 {snap?.me?.coins ?? me.me.coins}</span>
          </div>
        )}
        {loggedIn ? (
          <>
            <TopBtn on={() => setPanel(panel === "bag" ? null : "bag")} active={panel === "bag"}>🎒 Bag</TopBtn>
            <TopBtn on={() => setPanel(panel === "missions" ? null : "missions")} active={panel === "missions"}>📜 Missions{me?.missions.some((m) => m.status === "active" && m.progress >= m.target) ? " ✓" : ""}</TopBtn>
            <TopBtn on={() => setPanel(panel === "home" ? null : "home")} active={panel === "home"}>🏡 Home</TopBtn>
          </>
        ) : null}
        <TopBtn on={() => setPanel(panel === "log" ? null : "log")} active={panel === "log"}>📖 World</TopBtn>
        <Link href="/sponsor" className="rounded-lg bg-orange-500 px-2 py-1 font-bold text-white hover:bg-orange-400">🏪 For businesses</Link>
        <Link href="/agents" className="rounded-lg bg-black/40 px-2 py-1 hover:bg-black/60">🤖 Agent API</Link>
        {loggedIn ? (
          <button className="rounded-lg bg-black/40 px-2 py-1 hover:bg-black/60" onClick={async () => { await api("/api/auth/logout", {}); location.reload(); }}>Sign out</button>
        ) : (
          <>
            <button className="rounded-lg bg-black/40 px-2 py-1 hover:bg-black/60" onClick={() => setAuth("login")}>Sign in</button>
            <Link href="/signup" className="rounded-lg bg-emerald-500 px-2 py-1 font-bold text-white hover:bg-emerald-400">Create character</Link>
          </>
        )}
      </div>

      {/* Welcome card for spectators */}
      {snap && !loggedIn && !auth && (
        <div className="pointer-events-auto absolute bottom-24 left-1/2 w-[min(92vw,420px)] -translate-x-1/2 rounded-xl border-4 border-amber-900/70 bg-amber-50 p-4 shadow-xl">
          <div className="text-lg font-bold text-amber-900">A village that keeps going without you.</div>
          <p className="mt-1 text-stone-700">You&apos;re watching live. Animals wander, weather turns, AI agents run the shops — some of them sponsored by real businesses that hand out real discount codes. Drag to look around, scroll to zoom, click anything to learn about it.</p>
          <div className="mt-3 flex gap-2">
            <Link href="/signup" className="rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white hover:bg-emerald-500">Create your character →</Link>
            <button className="rounded-lg bg-stone-200 px-3 py-2 hover:bg-stone-300" onClick={() => setAuth("login")}>I have one</button>
          </div>
        </div>
      )}

      {/* Login */}
      {auth && <LoginModal onClose={() => setAuth(null)} />}

      {/* Selection action bar */}
      {sel && !talk && (
        <div className="pointer-events-auto absolute bottom-20 left-1/2 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border-4 border-amber-900/70 bg-amber-50 p-2 shadow-xl">
          <div className="px-2">
            <div className="font-bold text-amber-900">{selTitle(sel)}</div>
            <div className="text-[11px] text-stone-500">{sel.distance < 9000 ? `${Math.round(sel.distance / 32)} tiles away` : "spectating"}</div>
          </div>
          {loggedIn && sel.type === "npc" && (sel.distance <= 160 ? <Btn on={() => startTalk(sel.id, sel.name, sel.role)}>💬 Talk</Btn> : <WalkBtn snap={snap} sel={sel} />)}
          {loggedIn && sel.type === "animal" && (sel.distance <= 90 ? <Btn on={() => act({ action: "pet", id: sel.id })}>🤚 Pet</Btn> : <WalkBtn snap={snap} sel={sel} />)}
          {loggedIn && sel.type === "item" && (sel.distance <= 90 ? <Btn on={() => invAction({ action: "pickup", groundItemId: sel.id }).then(() => setSel(null))}>🫳 Pick up</Btn> : <WalkBtn snap={snap} sel={sel} />)}
          {loggedIn && sel.type === "node" && (sel.distance <= 90 ? <Btn on={() => act({ action: "gather", id: sel.id })} disabled={!sel.ready}>🧺 Gather</Btn> : <WalkBtn snap={snap} sel={sel} />)}
          {loggedIn && sel.type === "enemy" && (sel.distance <= 80 ? <Btn on={() => act({ action: "attack", id: sel.id })}>⚔️ Attack</Btn> : <WalkBtn snap={snap} sel={sel} />)}
          {loggedIn && sel.type === "building" && (sel.distance <= 140 ? <Btn on={() => enterBuilding(sel.key, sel.name)}>🚪 Enter</Btn> : <WalkBtn snap={snap} sel={sel} />)}
          {sel.type === "building" && sel.reservable && !sel.hasSponsor && <Link href={`/sponsor?building=${sel.key}`} className="rounded-lg bg-orange-500 px-3 py-1.5 font-bold text-white hover:bg-orange-400">🏪 Reserve for your business</Link>}
          <Btn on={() => doInspect(`/api/inspect?type=${sel.type}&id=${sel.id}`)} subtle>🔍 About</Btn>
          <button className="px-2 text-stone-400 hover:text-stone-700" onClick={() => setSel(null)}>✕</button>
        </div>
      )}

      {/* Chat input */}
      {loggedIn && !talk && (
        <form className="pointer-events-auto absolute bottom-3 left-3 flex w-[min(90vw,360px)] gap-1" onSubmit={async (e) => { e.preventDefault(); if (!chat.trim()) return; await act({ action: "chat", text: chat }); setChat(""); }}>
          <input value={chat} onChange={(e) => setChat(e.target.value)} onFocus={() => bus.emit("chatFocus", true)} onBlur={() => bus.emit("chatFocus", false)} placeholder="Say something to the plaza… (WASD to walk, E to interact)" className="flex-1 rounded-lg border-2 border-amber-900/50 bg-amber-50/95 px-2 py-1.5 outline-none focus:border-amber-700" maxLength={140} />
          <button className="rounded-lg bg-amber-700 px-3 text-white">Say</button>
        </form>
      )}
      {!loggedIn && <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/40 px-2 py-1 text-[11px] text-white">Spectating · drag to pan · scroll to zoom · click things</div>}

      {/* Toasts + gains */}
      <div className="absolute right-3 top-14 flex w-72 flex-col gap-1">
        {toasts.map((t) => <div key={t.id} className={`rounded-lg border-2 px-3 py-1.5 shadow ${t.kind === "bad" ? "border-red-800/50 bg-red-100 text-red-900" : t.kind === "good" ? "border-emerald-800/50 bg-emerald-100 text-emerald-900" : "border-stone-500/50 bg-stone-100"}`}>{t.text}</div>)}
        {gained.map((g) => <div key={g.id} className="animate-bounce rounded-lg bg-amber-300 px-3 py-1 font-bold text-amber-900 shadow">{g.text}</div>)}
      </div>

      {/* Dialogue */}
      {talk && (
        <div className="pointer-events-auto absolute bottom-3 left-1/2 w-[min(94vw,560px)] -translate-x-1/2 rounded-xl border-4 border-amber-900/70 bg-amber-50 shadow-2xl">
          <div className="flex items-center gap-2 border-b-2 border-amber-900/20 px-3 py-2">
            <div className="font-bold text-amber-900">{talk.name}</div><div className="text-stone-500">{talk.role}</div>
            {talk.sponsor && <span className="rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: talk.sponsor.brandColor }}>★ sponsored by {talk.sponsor.businessName}</span>}
            <div className="flex-1" />
            <button className="text-stone-400 hover:text-stone-700" onClick={() => { setTalk(null); bus.emit("chatFocus", false); }}>✕</button>
          </div>
          <div className="max-h-52 space-y-1.5 overflow-y-auto px-3 py-2">
            {talk.lines.map((l, i) => (
              <div key={i} className={`flex ${l.role === "player" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 ${l.role === "player" ? "bg-emerald-200 text-emerald-950" : l.text.startsWith("(") ? "bg-transparent italic text-stone-500" : "bg-white shadow"}`}>{l.text}</div>
              </div>
            ))}
            {talk.busy && <div className="text-stone-400">…</div>}
          </div>
          {talk.offers.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pb-2">
              {talk.offers.map((o) => (
                <button key={o.id} onClick={() => acceptOffer(o.id)} className={`rounded-lg px-3 py-1.5 font-bold text-white shadow hover:brightness-110 ${o.type === "discount" ? "bg-orange-500" : o.type === "turnin" ? "bg-emerald-600" : o.type === "mission" ? "bg-sky-600" : "bg-violet-600"}`}>
                  {o.type === "discount" ? "🎟️ " : o.type === "turnin" ? "✅ " : o.type === "mission" ? "📜 " : "🎁 "}{o.label}
                </button>
              ))}
            </div>
          )}
          <form className="flex gap-1 border-t-2 border-amber-900/20 p-2" onSubmit={(e) => { e.preventDefault(); const v = talkInput.current?.value.trim(); if (!v) return; talkInput.current!.value = ""; void sendTalk(v); }}>
            <input ref={talkInput} onFocus={() => bus.emit("chatFocus", true)} onBlur={() => bus.emit("chatFocus", false)} placeholder={`Say something to ${talk.name}…`} className="flex-1 rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5 outline-none focus:border-amber-700" maxLength={300} />
            <button className="rounded-lg bg-amber-700 px-3 text-white" disabled={talk.busy}>Send</button>
          </form>
        </div>
      )}

      {/* Side panels */}
      {panel && (
        <div className="pointer-events-auto absolute bottom-16 right-3 top-14 w-[min(92vw,360px)] overflow-y-auto rounded-xl border-4 border-amber-900/70 bg-amber-50 p-3 shadow-2xl">
          <div className="mb-2 flex items-center"><div className="text-base font-bold text-amber-900">{panel === "bag" ? "🎒 Your bag" : panel === "missions" ? "📜 Missions" : panel === "home" ? "🏡 Your cottage" : "📖 The world"}</div><div className="flex-1" /><button onClick={() => setPanel(null)} className="text-stone-400 hover:text-stone-700">✕</button></div>
          {panel === "bag" && <BagPanel me={me} onAction={invAction} />}
          {panel === "missions" && <MissionsPanel me={me} snap={snap} />}
          {panel === "home" && me && <HomePanel me={me} onAction={invAction} onTheme={async (t) => { await api("/api/me", { homeTheme: t }, "PATCH"); void refreshMe(); }} />}
          {panel === "log" && (
            <div className="space-y-2">
              <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (!ask.trim()) return; void doInspect(`/api/inspect?q=${encodeURIComponent(ask)}&x=${snap?.me?.x ?? 0}&y=${snap?.me?.y ?? 0}`); }}>
                <input value={ask} onChange={(e) => setAsk(e.target.value)} onFocus={() => bus.emit("chatFocus", true)} onBlur={() => bus.emit("chatFocus", false)} placeholder="Ask: what's that sheep doing?" className="flex-1 rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5 outline-none" />
                <button className="rounded-lg bg-amber-700 px-3 text-white">Ask</button>
              </form>
              <div className="text-[11px] text-stone-500">Try “tell me about the bakery”, “who is Wren?”, “what&apos;s the weather?”</div>
              <div className="font-bold text-amber-900">Recent happenings</div>
              {snap?.events.map((e) => <div key={e.id} className="rounded bg-white/70 px-2 py-1"><span className="text-[10px] text-stone-400">{timeAgo(e.at)}</span> {e.text}</div>)}
              <div className="pt-2 font-bold text-amber-900">Who&apos;s here</div>
              {snap?.npcs.map((n) => (
                <button key={n.id} className="flex w-full items-center gap-2 rounded bg-white/70 px-2 py-1 text-left hover:bg-white" onClick={() => bus.emit("focus", { x: n.x, y: n.y })}>
                  <span className="font-bold">{n.name}</span><span className="text-stone-500">{n.role}</span>{n.sponsor && <span className="ml-auto rounded px-1 text-[10px] font-bold text-white" style={{ background: n.sponsor.brandColor }}>★ {n.sponsor.businessName}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inspect result */}
      {inspect && (
        <div className="pointer-events-auto absolute left-3 top-14 w-[min(92vw,340px)] rounded-xl border-4 border-sky-900/60 bg-sky-50 p-3 shadow-2xl">
          <div className="flex items-start"><div><div className="text-base font-bold text-sky-900">{inspect.title}</div>{inspect.subtitle && <div className="text-[11px] uppercase tracking-wide text-sky-700">{inspect.subtitle}</div>}</div><div className="flex-1" /><button onClick={() => setInspect(null)} className="text-stone-400 hover:text-stone-700">✕</button></div>
          <ul className="mt-2 space-y-1">{inspect.lines.map((l, i) => <li key={i} className="rounded bg-white/70 px-2 py-1">{l}</li>)}</ul>
          {inspect.events && inspect.events.length > 0 && <div className="mt-2"><div className="text-[11px] font-bold uppercase text-sky-700">Recent activity</div>{inspect.events.map((e, i) => <div key={i} className="text-[12px] text-stone-600">· {e.text} <span className="text-stone-400">({e.when})</span></div>)}</div>}
          <div className="mt-2 flex gap-2">
            {inspect.target?.x != null && <Btn on={() => bus.emit("focus", { x: inspect.target!.x!, y: inspect.target!.y! })} subtle>📍 Show me</Btn>}
            {inspect.target?.type === "building" && inspect.target.reservable && <Link href={`/sponsor?building=${inspect.target.key}`} className="rounded-lg bg-orange-500 px-3 py-1.5 font-bold text-white">🏪 Reserve</Link>}
          </div>
        </div>
      )}

      {/* Building interior */}
      {building && (
        <div className="pointer-events-auto absolute left-1/2 top-1/2 w-[min(94vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border-4 border-amber-900/70 bg-amber-50 p-4 shadow-2xl">
          <div className="flex items-start"><div><div className="text-lg font-bold text-amber-900">{building.name}</div>{bInfo?.sponsor && <div className="text-[12px]"><span className="rounded px-2 py-0.5 font-bold text-white" style={{ background: bInfo.sponsor.brandColor }}>{bInfo.sponsor.businessName}</span> <span className="text-stone-500">— {bInfo.sponsor.tagline}</span></div>}</div><div className="flex-1" /><button onClick={() => setBuilding(null)} className="text-stone-400 hover:text-stone-700">✕</button></div>
          <div className="mt-3 rounded-lg p-3" style={{ background: "repeating-linear-gradient(90deg,#d9a877 0 28px,#c89463 28px 32px)" }}>
            <div className="rounded bg-amber-50/90 p-2">
              {npcsInBuilding.length === 0 && <div className="text-stone-500">Nobody&apos;s inside right now — the resident is probably out on the step.</div>}
              {npcsInBuilding.map((n) => (
                <div key={n.id} className="flex items-center gap-2 py-1"><span className="font-bold">{n.name}</span><span className="text-stone-500">{n.role}</span>{n.sponsor && <span className="text-[10px] font-bold" style={{ color: n.sponsor.brandColor }}>★ ambassador</span>}<div className="flex-1" /><Btn on={() => { setBuilding(null); void startTalk(n.id, n.name, n.role); }}>💬 Talk</Btn></div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex gap-2"><Btn on={() => doInspect(`/api/inspect?type=building&id=${bInfo?.id}`)} subtle>🔍 About this place</Btn>{bInfo?.reservable && !bInfo.sponsor && <Link href={`/sponsor?building=${building.key}`} className="rounded-lg bg-orange-500 px-3 py-1.5 font-bold text-white">🏪 Reserve for your business</Link>}</div>
        </div>
      )}
    </div>
  );
}

function clockFrom(s: Snapshot) {
  const dayMs = s.dayLengthMinutes * 60_000;
  return ((((Date.now() - s.epochStart) % dayMs) / dayMs) * 24 + 7) % 24;
}
function timeAgo(at: number) {
  const m = Math.floor((Date.now() - at) / 60000);
  return m < 1 ? "now" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
}
function selTitle(sel: Selection) {
  switch (sel.type) {
    case "npc": return `${sel.name} · ${sel.role}${sel.sponsored ? " ★" : ""}`;
    case "animal": return `${sel.name} the ${sel.species}`;
    case "building": return sel.name;
    case "player": return `${sel.name} (villager)`;
    case "item": return `${ITEM_ICONS[sel.itemKey] ?? "📦"} ${sel.itemKey.replace("_", " ")}`;
    case "node": return `${sel.kind.replace("_", " ")}${sel.ready ? "" : " (regrowing)"}`;
    case "enemy": return `Wild ${sel.kind} · ${sel.hp}/${sel.maxHp} HP`;
  }
}
function TopBtn({ children, on, active }: { children: React.ReactNode; on: () => void; active?: boolean }) {
  return <button onClick={on} className={`rounded-lg px-2 py-1 ${active ? "bg-amber-300 text-amber-900" : "bg-black/40 hover:bg-black/60"}`}>{children}</button>;
}
function Btn({ children, on, subtle, disabled }: { children: React.ReactNode; on: () => void; subtle?: boolean; disabled?: boolean }) {
  return <button disabled={disabled} onClick={on} className={`rounded-lg px-3 py-1.5 font-bold shadow disabled:opacity-40 ${subtle ? "bg-stone-200 text-stone-800 hover:bg-stone-300" : "bg-emerald-600 text-white hover:bg-emerald-500"}`}>{children}</button>;
}
function entityPos(snap: Snapshot, sel: Selection): { x: number; y: number } | null {
  if (sel.type === "npc") { const n = snap.npcs.find((x) => x.id === sel.id); return n ? { x: n.x, y: n.y } : null; }
  if (sel.type === "animal") { const a = snap.animals.find((x) => x.id === sel.id); return a ? { x: a.x, y: a.y } : null; }
  if (sel.type === "item") { const a = snap.groundItems.find((x) => x.id === sel.id); return a ? { x: a.x, y: a.y } : null; }
  if (sel.type === "node") { const a = snap.nodes.find((x) => x.id === sel.id); return a ? { x: a.x, y: a.y } : null; }
  if (sel.type === "enemy") { const a = snap.enemies.find((x) => x.id === sel.id); return a ? { x: a.x, y: a.y } : null; }
  if (sel.type === "building") { const b = snap.buildings.find((x) => x.id === sel.id); return b ? { x: b.doorX, y: b.doorY } : null; }
  if (sel.type === "player") { const p = snap.players.find((x) => x.id === sel.id); return p ? { x: p.x, y: p.y } : null; }
  return null;
}
function WalkBtn({ snap, sel }: { snap: Snapshot | null; sel: Selection }) {
  const pos = snap ? entityPos(snap, sel) : null;
  const target = pos ? { x: pos.x, y: pos.y + (sel.type === "building" ? 0 : 18) } : null;
  return <Btn on={() => target && bus.emit("moveTo", target)} subtle>🚶 Walk over</Btn>;
}
function LoginModal({ onClose }: { onClose: () => void }) {
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState("");
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/40">
      <form className="w-[min(92vw,340px)] rounded-xl border-4 border-amber-900/70 bg-amber-50 p-4 shadow-2xl" onSubmit={async (e) => { e.preventDefault(); const r = await api<{ ok?: boolean }>("/api/auth/login", { username: u, password: p }); if (r.error) setErr(r.error); else location.reload(); }}>
        <div className="text-lg font-bold text-amber-900">Welcome back</div>
        <input value={u} onChange={(e) => setU(e.target.value)} onFocus={() => bus.emit("chatFocus", true)} onBlur={() => bus.emit("chatFocus", false)} placeholder="username" className="mt-3 w-full rounded-lg border-2 border-amber-900/40 px-2 py-1.5" />
        <input value={p} onChange={(e) => setP(e.target.value)} onFocus={() => bus.emit("chatFocus", true)} onBlur={() => bus.emit("chatFocus", false)} type="password" placeholder="password" className="mt-2 w-full rounded-lg border-2 border-amber-900/40 px-2 py-1.5" />
        {err && <div className="mt-2 text-red-700">{err}</div>}
        <div className="mt-3 flex gap-2"><button className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white">Sign in</button><button type="button" onClick={onClose} className="rounded-lg bg-stone-200 px-3 py-1.5">Cancel</button><Link href="/signup" className="ml-auto self-center text-amber-800 underline">New here?</Link></div>
      </form>
    </div>
  );
}
function BagPanel({ me, onAction }: { me: Me | null; onAction: (b: Record<string, unknown>, m?: string) => Promise<void> }) {
  if (!me) return <div>Loading…</div>;
  if (me.inventory.length === 0) return <div className="text-stone-500">Empty. Pet a chicken, pick a berry, talk to a baker.</div>;
  return (
    <div className="space-y-1.5">
      {me.inventory.map((i) => (
        <div key={i.id} className={`rounded-lg border-2 bg-white p-2 ${i.equipped ? "border-emerald-500" : "border-transparent"}`} style={i.itemKey === "discount" ? { borderColor: String(i.meta.color ?? "#e76f51") } : undefined}>
          <div className="flex items-center gap-2"><span className="text-xl">{i.def?.icon ?? "📦"}</span><div><div className="font-bold">{i.itemKey === "discount" ? `${i.meta.business} code` : i.def?.name ?? i.itemKey}{i.qty > 1 && <span className="text-stone-500"> ×{i.qty}</span>}{i.equipped && <span className="ml-1 text-[10px] text-emerald-700">equipped</span>}</div><div className="text-[11px] text-stone-500">{i.itemKey === "discount" ? <span><b className="text-base tracking-widest text-orange-700">{String(i.meta.code)}</b> — {String(i.meta.text)}{typeof i.meta.website === "string" && i.meta.website ? <> · <a className="underline" href={i.meta.website} target="_blank" rel="noreferrer">redeem</a></> : null}</span> : i.def?.description}</div></div></div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {i.def?.kind === "consumable" && <Sm on={() => onAction({ action: "use", inventoryId: i.id })}>Eat</Sm>}
            {i.def?.equippable && <Sm on={() => onAction({ action: "equip", inventoryId: i.id })}>{i.equipped ? "Unequip" : "Equip"}</Sm>}
            {i.def?.placeable && <span className="text-[11px] text-stone-500 self-center">place it from 🏡 Home</span>}
            {i.itemKey !== "discount" && <Sm on={() => onAction({ action: "drop", inventoryId: i.id, qty: 1 })}>Drop</Sm>}
          </div>
        </div>
      ))}
    </div>
  );
}
function Sm({ children, on }: { children: React.ReactNode; on: () => void }) {
  return <button onClick={on} className="rounded bg-stone-200 px-2 py-0.5 text-[11px] font-bold hover:bg-stone-300">{children}</button>;
}
function MissionsPanel({ me, snap }: { me: Me | null; snap: Snapshot | null }) {
  if (!me) return <div>Loading…</div>;
  const active = me.missions.filter((m) => m.status === "active"), done = me.missions.filter((m) => m.status === "completed");
  return (
    <div className="space-y-2">
      {active.length === 0 && <div className="text-stone-500">No active missions. Talk to villagers — most have something they need.</div>}
      {active.map((m) => (
        <div key={m.id} className="rounded-lg border-2 border-sky-200 bg-white p-2">
          <div className="flex items-center"><div className="font-bold">{m.title}</div>{m.sponsored && <span className="ml-1 text-[10px] text-orange-600">★</span>}<div className="flex-1" /><span className={`text-[11px] font-bold ${m.progress >= m.target ? "text-emerald-700" : "text-stone-500"}`}>{m.progress}/{m.target}</span></div>
          <div className="text-[12px] text-stone-600">{m.description}</div>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-stone-200"><div className="h-full bg-sky-500" style={{ width: `${(100 * m.progress) / m.target}%` }} /></div>
          <div className="mt-1 flex items-center text-[11px] text-stone-500"><span>From {m.npcName} · reward: {m.reward.coins ? `🪙${m.reward.coins} ` : ""}{m.reward.items?.map((i) => ITEM_ICONS[i.itemKey] ?? "📦").join(" ")}</span><div className="flex-1" />{m.progress >= m.target && <Sm on={() => { const n = snap?.npcs.find((n) => n.id === m.npcId); if (n) bus.emit("moveTo", { x: n.x, y: n.y + 24 }); }}>Return to {m.npcName} ✓</Sm>}</div>
        </div>
      ))}
      {done.length > 0 && <div className="pt-1 text-[11px] font-bold uppercase text-stone-400">Completed</div>}
      {done.map((m) => <div key={m.id} className="rounded bg-white/60 px-2 py-1 text-stone-500 line-through">{m.title}</div>)}
    </div>
  );
}
function HomePanel({ me, onAction, onTheme }: { me: Me; onAction: (b: Record<string, unknown>, m?: string) => Promise<void>; onTheme: (t: { wall: string; floor: string }) => void }) {
  const [placing, setPlacing] = useState<number | null>(null);
  const placeables = me.inventory.filter((i) => i.def?.placeable);
  const theme = me.me?.homeTheme ?? { wall: "#f5d7b0", floor: "#c68e5a" };
  const THEMES = [{ n: "Cottage", wall: "#f5d7b0", floor: "#c68e5a" }, { n: "Forest", wall: "#cfe3c4", floor: "#6f8f5a" }, { n: "Seaside", wall: "#d7ecf5", floor: "#8fb8c9" }, { n: "Dusk", wall: "#e3c9e8", floor: "#6f5a8f" }];
  return (
    <div>
      <div className="text-[11px] text-stone-500">Click a furniture item, then a tile. Drag placed items to move them. Double-click to pick up.</div>
      <div className="mt-2 flex gap-1">{THEMES.map((t) => <button key={t.n} onClick={() => onTheme({ wall: t.wall, floor: t.floor })} className="rounded border-2 px-2 py-0.5 text-[11px]" style={{ background: t.floor, color: "#fff", borderColor: theme.floor === t.floor ? "#000" : "transparent" }}>{t.n}</button>)}</div>
      <div className="mt-2 rounded-lg p-2" style={{ background: theme.wall }}>
        <div className="grid grid-cols-10 gap-0.5 rounded" style={{ background: theme.floor }}>
          {Array.from({ length: 80 }, (_, i) => {
            const gx = i % 10, gy = Math.floor(i / 10);
            const d = me.decor.find((d) => d.gx === gx && d.gy === gy);
            return (
              <div key={i} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = Number(e.dataTransfer.getData("decor")); if (id) void onAction({ decorId: id, gx, gy }, "PATCH"); }}
                onClick={() => { if (placing && !d) { void onAction({ action: "place", inventoryId: placing, gx, gy }); setPlacing(null); } }}
                className={`flex aspect-square items-center justify-center rounded-sm text-lg ${placing && !d ? "cursor-pointer bg-white/30 hover:bg-white/60" : "bg-black/5"}`}>
                {d && <span draggable onDragStart={(e) => e.dataTransfer.setData("decor", String(d.id))} onDoubleClick={() => onAction({ decorId: d.id, action: "unplace" }, "PATCH")} className="cursor-grab" title="drag to move · double-click to pick up">{ITEM_ICONS[d.itemKey] ?? "📦"}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 text-[11px] font-bold uppercase text-stone-400">Furniture in your bag</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {placeables.length === 0 && <div className="text-[12px] text-stone-500">None yet — Pip and Greta trade furniture for stones and slime gel.</div>}
        {placeables.map((i) => <button key={i.id} onClick={() => setPlacing(placing === i.id ? null : i.id)} className={`rounded-lg border-2 bg-white px-2 py-1 ${placing === i.id ? "border-emerald-500" : "border-transparent"}`}>{i.def?.icon} {i.def?.name} ×{i.qty}</button>)}
      </div>
    </div>
  );
}
