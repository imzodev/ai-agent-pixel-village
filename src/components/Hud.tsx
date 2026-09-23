"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { bus, ITEM_ICONS, type Selection, type Snapshot } from "@/game/bus";
import { inputRouter } from "@/game/input/router";
import { formatBinding, prettyKey } from "@/game/input/bindings";
import type { ConversationSource, Offer, Recipe, TalkLine, TradeItem } from "@/lib/types";
import { TRADES } from "@/lib/trade";
import { RECIPES, canCraft, maxCraftable, recipesForNpc } from "@/lib/recipes";

type InvItem = { id: number; itemKey: string; qty: number; equipped: boolean; meta: Record<string, unknown>; def: { name: string; kind: string; description: string; icon: string; equippable: boolean; placeable: boolean } | null };
type Mission = { id: number; missionId: number; title: string; description: string; status: string; progress: number; target: number; npcName: string; npcId: number; sponsored: boolean; reward: { coins?: number; xp?: number; items?: { itemKey: string; qty: number }[] } };
type Me = { me: { id: number; name: string; coins: number; gems: number; hp: number; maxHp: number; level: number; xp: number; homeTheme: { wall: string; floor: string } } | null; inventory: InvItem[]; missions: Mission[]; decor: { id: number; itemKey: string; gx: number; gy: number }[]; codesClaimed: number };
type Inspect = { title: string; subtitle?: string; lines: string[]; events?: { text: string; when: string }[]; target?: { type: string; id: number; x?: number; y?: number; key?: string; reservable?: boolean } };

const WEATHER_ICON: Record<string, string> = { clear: "☀️", rain: "🌧️", fog: "🌫️", snow: "❄️" };

async function api<T = unknown>(url: string, body?: unknown, method = body ? "POST" : "GET"): Promise<T & { error?: string }> {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}

export default function Hud() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [selfPos, setSelfPos] = useState<{ x: number; y: number } | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [panel, setPanel] = useState<"bag" | "missions" | "log" | "home" | "quests" | "friends" | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: string }[]>([]);
  const [talk, setTalk] = useState<{ npcId: number; name: string; role: string; sponsor: { businessName: string; brandColor: string } | null; lines: TalkLine[]; offers: Offer[]; busy: boolean } | null>(null);
  const [trade, setTrade] = useState<{ npcId: number; npcName: string; npcKey: string; rows: { trade: TradeItem; have: number }[] } | null>(null);
  const [craft, setCraft] = useState<{ npcId: number; npcName: string; recipes: Recipe[] } | null>(null);
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
      bus.on("playerMoved", setSelfPos),
      bus.on("select", setSel),
      bus.on("toast", (t) => toast(t.text, t.kind)),
      bus.on("refreshMe", () => void refreshMe()),
      bus.on("toggle", (which) => {
        if (which === "shop") {
          window.location.href = "/shop";
          return;
        }
        // The mobile action buttons emit "map" / "quests" / "friends" too —
        // map those to existing panels when possible.
        const target: "bag" | "missions" | "log" | "home" | "quests" | "friends" | null =
          which === "bag" ? "bag" :
          which === "map" ? "log" :
          which === "quests" ? "quests" :
          which === "friends" ? "friends" :
          null;
        if (target) setPanel((p) => (p === target ? null : target));
      }),
    ];
    void refreshMe();
    return () => u.forEach((f) => f());
  }, [toast, refreshMe]);
  useEffect(() => { if (snap?.me && !me?.me) void refreshMe(); }, [snap?.me, me?.me, refreshMe]);

  // Mirror local selection changes to the bus so WorldScene's
  // `lastSelection` (which gates the context-sensitive E behavior) stays
  // in sync with the HUD. Without this, clearing `sel` here — via
  // setSel(null) after a pickup, the ✕ button, or because the entity
  // vanished — leaves WorldScene thinking the player still has the
  // stale selection, and the next E press runs primaryAction on a
  // gone entity (no menu, no action).
  useEffect(() => {
    bus.emit("select", sel);
  }, [sel]);

  // (The router-registration effect lives further down, after `commitSelection`
  // and `close` are defined.)

  // Close the talk panel when the NPC drifts out of range (e.g. they walked
  // away, or you did) — without waiting for the next failed send.
  useEffect(() => {
    if (!talk || !snap) return;
    const n = snap.npcs.find((x) => x.id === talk.npcId);
    if (!n) return;
    const dist = Math.hypot(n.x - (snap.me?.x ?? 0), n.y - (snap.me?.y ?? 0));
    if (dist > 160) setTalk(null);
  }, [snap, talk]);
  // Tell the canvas when a modal is open so Phaser can ignore clicks behind it.
  useEffect(() => {
    bus.emit("modalOpen", !!talk);
  }, [talk]);
  // Keep the selection's distance live as the player walks. Use the
  // client's live sprite position (selfPos) — `snap.me` is the server row
  // and can be ~10s stale, which delayed the Pick up / Gather buttons.
  useEffect(() => {
    if (!sel) return;
    const self = selfPos ?? snap?.me;
    if (!self) return;
    const pos = snap ? entityPos(snap, sel) : null;
    // The selected entity vanished (e.g. someone picked the item up or it
    // despawned) — drop the stale card instead of showing it forever.
    if (!pos) {
      setSel(null);
      return;
    }
    const d = Math.hypot(pos.x - self.x, pos.y - self.y);
    if (Math.abs(d - sel.distance) > 4) setSel({ ...sel, distance: d });
  }, [snap, sel, selfPos]);

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
    const r = await api<{ text: string; offers: Offer[]; source?: ConversationSource; npc: { sponsor: { businessName: string; brandColor: string } | null } }>(`/api/npc/${npcId}/talk`, { message: "" });
    if (r.error) { toast(r.error, "bad"); setTalk(null); return; }
    setTalk({ npcId, name, role, sponsor: r.npc.sponsor, lines: [...(hist.history ?? []).slice(-6).map((h) => ({ role: h.role as "player" | "npc", text: h.text })), { role: "npc", text: r.text, source: r.source }], offers: r.offers, busy: false });
    setTimeout(() => talkInput.current?.focus(), 50);
  };
  const sendTalk = async (message: string) => {
    if (!talk || talk.busy) return;
    setTalk({ ...talk, lines: [...talk.lines, { role: "player", text: message }], busy: true });
    const r = await api<{ text: string; offers: Offer[]; source?: ConversationSource }>(`/api/npc/${talk.npcId}/talk`, { message });
    if (r.error) {
      toast(r.error, "bad");
      // Walked out of range? Close the panel — the conversation is no longer
      // reachable and an open panel hides the toast behind itself.
      if (/closer first/i.test(r.error)) setTalk(null);
      else setTalk((t) => t && { ...t, busy: false });
      return;
    }
    setTalk((t) => t && { ...t, lines: [...t.lines, { role: "npc", text: r.text, source: r.source }], offers: r.offers, busy: false });
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

  const openTrade = (npcId: number, npcName: string, npcKey: string) => {
    const trades = TRADES[npcKey] ?? [];
    if (trades.length === 0) return;
    const inv = me?.inventory ?? [];
    const rows = trades
      .map((t) => ({ trade: t, have: inv.filter((i) => i.itemKey === t.itemKey).reduce((s, i) => s + i.qty, 0) }))
      .filter((r) => r.have > 0);
    if (rows.length === 0) {
      toast(`You have nothing ${npcName} buys.`, "info");
      return;
    }
    setTrade({ npcId, npcName, npcKey, rows });
  };

  const performTrade = async (itemKey: string, qty: number) => {
    if (!trade) return;
    const r = await api<{ ok?: boolean; error?: string; gained?: number; coins?: number }>("/api/trade", { itemKey, qty, npcKey: trade.npcKey });
    if (r.error || !r.ok) { toast(r.error ?? "Trade failed.", "bad"); return; }
    toast(`Sold ${qty} ${itemKey.replace(/_/g, " ")} for ${r.gained} 🪙.`, "good");
    void refreshMe();
    // Refresh modal contents from the updated `me` (state set by refreshMe).
    setTrade((cur) => {
      if (!cur) return null;
      const fresh = (typeof me === "object" && me !== null ? me : { inventory: [] }).inventory ?? [];
      const trades = TRADES[cur.npcKey] ?? [];
      const updated = trades
        .map((t) => ({ trade: t, have: fresh.filter((i) => i.itemKey === t.itemKey).reduce((s, i) => s + i.qty, 0) }))
        .filter((r) => r.have > 0);
      return updated.length === 0 ? null : { ...cur, rows: updated };
    });
  };

  const openCraft = (npcId: number, npcName: string, npcKey: string) => {
    const recipes = recipesForNpc(npcKey);
    if (recipes.length === 0) return;
    setCraft({ npcId, npcName, recipes });
  };

  const performCraft = async (recipeKey: string, qty: number) => {
    if (!craft) return;
    const r = await api<{ ok?: boolean; error?: string; crafted?: number; outputQty?: number }>("/api/craft", { recipeKey, qty, crafterNpcId: craft.npcId });
    if (r.error || !r.ok) { toast(r.error ?? "Craft failed.", "bad"); return; }
    toast(`Crafted ${r.crafted} × ${recipeKey.replace(/_/g, " ")}!`, "good");
    void refreshMe();
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

  // Computed once per render; reused below by commitSelection and the JSX.
  const loggedIn = !!snap?.me;
  const interactHint = (() => {
    const k = formatBinding("player.interact");
    return k ? `(${prettyKey(k)})` : "";
  })();
  const keyHint = (cmd: "player.craft" | "player.sell"): string => {
    const k = formatBinding(cmd);
    return k ? `(${prettyKey(k)})` : "";
  };

  /**
   * Run the default action for a selection, mirroring the primary action
   * button. Out-of-range = walk over (next press acts). Used by both the
   * button's onClick and the `player.interact` key/command handler, so
   * there's exactly one place that defines "what does this entity do".
   */
  const commitSelection = (s: Selection): void => {
    if (!loggedIn) return;
    if (!snap) return;
    const pos = entityPos(snap, s);
    if (!pos) return;
    const self = selfPos ?? snap.me;
    const d = self ? Math.hypot(pos.x - self.x, pos.y - self.y) : 9999;
    const walk = () => bus.emit("moveTo", { x: pos.x, y: pos.y + (s.type === "building" ? 0 : 18) });
    switch (s.type) {
      case "item":
        if (d <= 90) void invAction({ action: "pickup", groundItemId: s.id }).then(() => setSel(null));
        else walk();
        break;
      case "node":
        if (s.stage < 1) { toast("Picked clean. It'll grow back.", "info"); return; }
        if (d <= 90) void act({ action: "gather", id: s.id });
        else walk();
        break;
      case "animal":
        if (d <= 90) void act({ action: "pet", id: s.id });
        else walk();
        break;
      case "enemy":
        if (d <= 80) void act({ action: "attack", id: s.id });
        else walk();
        break;
      case "building":
        if (d <= 140) void enterBuilding(s.key, s.name);
        else walk();
        break;
      case "npc":
        if (d <= 160) void startTalk(s.id, s.name, s.role);
        else walk();
        break;
      case "player":
        // No primary action on another player.
        break;
    }
  };

  // ui.close handler closes the topmost open UI: talk → trade → craft →
  // inspect → panel → building → selection. The router dispatches ui.* even
  // when a text field is focused, so Escape always works.
  const close = useCallback((): void => {
    if (talk) { setTalk(null); return; }
    if (trade) { setTrade(null); return; }
    if (craft) { setCraft(null); return; }
    if (inspect) { setInspect(null); return; }
    if (panel) { setPanel(null); return; }
    if (building) { setBuilding(null); return; }
    if (sel) { setSel(null); return; }
  }, [talk, trade, craft, inspect, panel, building, sel]);

  // Register UI commands with the input router. The effect depends on the
  // state each handler reads, so closures always see current values and
  // re-registering on a real change keeps them in sync.
  useEffect(() => {
    const disposers = [
      inputRouter.register({ id: "ui.close", scope: "ui", run: close }),
      inputRouter.register({
        id: "ui.bag",
        scope: "ui",
        run: () => setPanel((p) => (p === "bag" ? null : "bag")),
      }),
      inputRouter.register({
        id: "ui.map",
        scope: "ui",
        run: () => setPanel((p) => (p === "log" ? null : "log")),
      }),
      inputRouter.register({
        id: "ui.shop",
        scope: "ui",
        run: () => { window.location.href = "/shop"; },
      }),
      // Craft/Sell are NPC-contextual: only fire when the current
      // selection is an NPC in range with the right preconditions
      // (recipes / sellable inventory). The button visibility already
      // encodes the same checks, so the handler is effectively a
      // keyboard mirror of the click.
      inputRouter.register({
        id: "player.craft",
        scope: "ui",
        run: () => {
          if (!sel || sel.type !== "npc" || sel.distance > 160) return;
          const npc = snap?.npcs.find((n) => n.id === sel.id);
          if (!npc) return;
          const npcKey = (npc as { key?: string }).key;
          if (!npcKey) return;
          const recipes = recipesForNpc(npcKey);
          if (recipes.length === 0) return;
          openCraft(sel.id, sel.name, npcKey);
        },
      }),
      inputRouter.register({
        id: "player.sell",
        scope: "ui",
        run: () => {
          if (!sel || sel.type !== "npc" || sel.distance > 160) return;
          const npc = snap?.npcs.find((n) => n.id === sel.id);
          if (!npc) return;
          const npcKey = (npc as { key?: string }).key;
          if (!npcKey) return;
          const trades: TradeItem[] = TRADES[npcKey] ?? [];
          const inv = me?.inventory ?? [];
          const sellable = trades.some((t) => inv.some((i) => i.itemKey === t.itemKey && i.qty > 0));
          if (!sellable) return;
          openTrade(sel.id, sel.name, npcKey);
        },
      }),
    ];
    const offPrimary = bus.on("primaryAction", (s) => commitSelection(s));
    return () => {
      for (const d of disposers) d();
      offPrimary();
    };
  }, [talk, trade, craft, inspect, panel, building, sel, snap, me, openCraft, openTrade, commitSelection, close]);

  const hour = snap ? clockFrom(snap) : 7;
  const hh = Math.floor(hour), mm = Math.floor((hour % 1) * 60);
  const npcsInBuilding = building ? snap?.npcs.filter((n) => { const b = snap.buildings.find((b) => b.key === building.key); if (!b) return false; return Math.hypot(n.x - b.doorX, n.y - b.doorY) < 200; }) ?? [] : [];
  const bInfo = building ? snap?.buildings.find((b) => b.key === building.key) : null;

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-mono text-[13px] text-stone-800">
      {/* Top bar */}
      <div className="pointer-events-auto absolute left-0 right-0 top-0 flex flex-wrap items-center gap-2 bg-gradient-to-b from-black/50 to-transparent p-2 text-white">
        <div className="rounded-lg border-2 border-amber-900/60 bg-amber-100 px-3 py-1 text-base font-bold tracking-tight text-amber-900 shadow">🌳 thegrove</div>
        <div className="rounded-lg bg-black/40 px-2 py-1">{WEATHER_ICON[snap?.weather ?? "clear"]} {snap?.weather ?? "…"} · 🕰 {String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}</div>
        <div className="rounded-lg bg-black/40 px-2 py-1">👥 {snap?.onlineCount ?? snap?.players.length ?? 0} online · 🤖 {snap?.npcs.length ?? 0} agents</div>
        <div className="flex-1" />
        {loggedIn && me?.me && (
          <div className="flex items-center gap-2 rounded-lg bg-black/40 px-2 py-1">
            <span className="font-bold text-amber-200">{me.me.name}</span> <span>Lv {me.me.level}</span>
            <span className="h-2 w-20 overflow-hidden rounded bg-black/50"><span className="block h-full bg-red-500" style={{ width: `${(100 * (snap?.me?.hp ?? me.me.hp)) / (snap?.me?.maxHp ?? me.me.maxHp)}%` }} /></span>
            <span>❤️ {snap?.me?.hp ?? me.me.hp}</span><span>🪙 {snap?.me?.coins ?? me.me.coins}</span><span>💎 {(snap?.me as unknown as { gems?: number })?.gems ?? 0}</span><span title="xp">✨ {(snap?.me as unknown as { xp?: number })?.xp ?? me.me.xp}</span>
          </div>
        )}
        {loggedIn ? (
          <>
            <TopBtn on={() => setPanel(panel === "bag" ? null : "bag")} active={panel === "bag"}>🎒 Bag</TopBtn>
            <TopBtn on={() => setPanel(panel === "missions" ? null : "missions")} active={panel === "missions"}>📜 Missions{me?.missions.some((m) => m.status === "active" && m.progress >= m.target) ? " ✓" : ""}</TopBtn>
            <TopBtn on={() => setPanel(panel === "quests" ? null : "quests")} active={panel === "quests"}>⚡ Quests</TopBtn>
            <TopBtn on={() => setPanel(panel === "friends" ? null : "friends")} active={panel === "friends"}>👥 Friends</TopBtn>
            <TopBtn on={() => setPanel(panel === "home" ? null : "home")} active={panel === "home"}>🏡 Home</TopBtn>
            <Link href="/shop" className="rounded-lg bg-violet-500 px-2 py-1 font-bold text-white hover:bg-violet-400">🛍️ Shop</Link>
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
          {loggedIn && sel.type === "npc" && (() => {
            const npcKey: string | undefined = snap?.npcs?.find((n) => n.id === sel.id)?.key;
            const trades: TradeItem[] = (npcKey ? TRADES[npcKey] : undefined) ?? [];
            const recipes: Recipe[] = (npcKey ? recipesForNpc(npcKey) : undefined) ?? [];
            const inv = me?.inventory ?? [];
            const sellable = trades.some((t: TradeItem) => inv.some((i) => i.itemKey === t.itemKey && i.qty > 0));
            const Buttons = (
              <>
                {/* eslint-disable-next-line react-hooks/refs -- commitSelection is a plain function; the rule mis-flags identifiers declared near the call site. */}
                <Btn on={() => { commitSelection(sel); }}>💬 Talk {interactHint}</Btn>
                {recipes.length > 0 && (
                  <Btn on={() => npcKey && openCraft(sel.id, sel.name, npcKey)}>
                    📜 Craft {keyHint("player.craft")}
                  </Btn>
                )}
                {sellable && (
                  <Btn on={() => npcKey && openTrade(sel.id, sel.name, npcKey)}>💰 Sell {keyHint("player.sell")}</Btn>
                )}
              </>
            );
            return sel.distance <= 160 ? Buttons : <WalkBtn snap={snap} sel={sel} />;
          })()}
          {loggedIn && sel.type === "animal" && (sel.distance <= 90 ? <Btn on={() => commitSelection(sel)}>🤚 Pet {interactHint}</Btn> : <WalkBtn snap={snap} sel={sel} />)}
          {loggedIn && sel.type === "item" && (sel.distance <= 90 ? <Btn on={() => commitSelection(sel)}>🫳 Pick up {interactHint}</Btn> : <WalkBtn snap={snap} sel={sel} />)}
          {loggedIn && sel.type === "node" && (() => {
            // Pickable at every stage except 0 (depleted). Out-of-range
            // shows Walk over. Stage 0 shows a dimmed "empty" label.
            const empty = sel.stage === 0;
            if (sel.distance > 90) return <WalkBtn snap={snap} sel={sel} />;
            return (
              <Btn on={() => commitSelection(sel)} disabled={empty}>
                {empty ? "🌱 Empty" : "🧺 Gather"} {interactHint}
              </Btn>
            );
          })()}
          {loggedIn && sel.type === "enemy" && (sel.distance <= 80 ? <Btn on={() => commitSelection(sel)}>⚔️ Attack {interactHint}</Btn> : <WalkBtn snap={snap} sel={sel} />)}
          {loggedIn && sel.type === "building" && (sel.distance <= 140 ? <Btn on={() => commitSelection(sel)}>🚪 Enter {interactHint}</Btn> : <WalkBtn snap={snap} sel={sel} />)}
          {sel.type === "building" && sel.reservable && !sel.hasSponsor && <Link href={`/sponsor?building=${sel.key}`} className="rounded-lg bg-orange-500 px-3 py-1.5 font-bold text-white hover:bg-orange-400">🏪 Reserve for your business</Link>}
          <Btn on={() => doInspect(`/api/inspect?type=${sel.type}&id=${sel.id}`)} subtle>🔍 About</Btn>
          <button className="px-2 text-stone-400 hover:text-stone-700" onClick={() => setSel(null)}>✕</button>
        </div>
      )}

      {/* Chat input */}
      {loggedIn && !talk && (
        <form className="pointer-events-auto absolute bottom-3 left-3 flex w-[min(90vw,360px)] gap-1" onSubmit={async (e) => { e.preventDefault(); if (!chat.trim()) return; await act({ action: "chat", text: chat }); setChat(""); }}>
          <input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Say something to the plaza… (WASD to walk, E to interact)" className="flex-1 rounded-lg border-2 border-amber-900/50 bg-amber-50/95 px-2 py-1.5 outline-none focus:border-amber-700" maxLength={140} />
          <button className="rounded-lg bg-amber-700 px-3 text-white">Say</button>
        </form>
      )}
      {!loggedIn && <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/40 px-2 py-1 text-[11px] text-white">Spectating · drag to pan · scroll to zoom · click things</div>}

      {/* Toasts + gains */}
      <div className="absolute right-3 top-14 flex w-72 flex-col gap-1">
        {toasts.map((t) => <div key={t.id} className={`rounded-lg border-2 px-3 py-1.5 shadow ${t.kind === "bad" ? "border-red-800/50 bg-red-100 text-red-900" : t.kind === "good" ? "border-emerald-800/50 bg-emerald-100 text-emerald-900" : "border-stone-500/50 bg-stone-100"}`}>{t.text}</div>)}
        {gained.map((g) => <div key={g.id} className="animate-bounce rounded-lg bg-amber-300 px-3 py-1 font-bold text-amber-900 shadow">{g.text}</div>)}
      </div>

      {/* Trade modal — dedicated sell flow, no conversation required. */}
      {trade && (
        <TradeModal trade={trade} performTrade={performTrade} onClose={() => setTrade(null)} />
      )}

      {/* Craft modal — per-NPC recipes. */}
      {craft && (
        <CraftModal craft={craft} me={me} performCraft={performCraft} onClose={() => setCraft(null)} />
      )}

      {/* Dialogue — wrapped in a full-screen pointer-events-auto backdrop so
          clicks on the canvas (Phaser) underneath don't fire when the
          player taps an offer button that's drawn over a building/zone. */}
      {talk && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => { setTalk(null); }}
          className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
        >
        <div onClick={(e) => e.stopPropagation()} className="w-[min(94vw,560px)] rounded-xl border-4 border-amber-900/70 bg-amber-50 shadow-2xl">
          <div className="flex items-center gap-2 border-b-2 border-amber-900/20 px-3 py-2">
            <div className="font-bold text-amber-900">{talk.name}</div><div className="text-stone-500">{talk.role}</div>
            {talk.sponsor && <span className="rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: talk.sponsor.brandColor }}>★ sponsored by {talk.sponsor.businessName}</span>}
            <div className="flex-1" />
            <button className="text-stone-400 hover:text-stone-700" onClick={() => { setTalk(null); }}>✕</button>
          </div>
          <div className="max-h-52 space-y-1.5 overflow-y-auto px-3 py-2">
            {talk.lines.map((l, i) => (
              <div key={i} className={`flex ${l.role === "player" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 ${l.role === "player" ? "bg-emerald-200 text-emerald-950" : l.text.startsWith("(") ? "bg-transparent italic text-stone-500" : "bg-white shadow"}`}>
                  <div className="flex items-start gap-1.5">
                    <span className="flex-1">{l.text}</span>
                    {l.role === "npc" && l.source && <SourceBadge source={l.source} />}
                  </div>
                </div>
              </div>
            ))}
            {talk.busy && <div className="text-stone-400">…</div>}
          </div>
          {talk.offers.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pb-2">
              {talk.offers.map((o) => (
                <button key={o.id} onClick={() => acceptOffer(o.id)} className={`rounded-lg px-3 py-1.5 font-bold text-white shadow hover:brightness-110 ${o.type === "discount" ? "bg-orange-500" : o.type === "sell" ? "bg-yellow-600" : o.type === "turnin" ? "bg-emerald-600" : o.type === "mission" ? "bg-sky-600" : "bg-violet-600"}`}>
                  {o.type === "discount" ? "🎟️ " : o.type === "turnin" ? "✅ " : o.type === "mission" ? "📜 " : "🎁 "}{o.label}
                </button>
              ))}
            </div>
          )}
          <form className="flex gap-1 border-t-2 border-amber-900/20 p-2" onSubmit={(e) => { e.preventDefault(); const v = talkInput.current?.value.trim(); if (!v) return; talkInput.current!.value = ""; void sendTalk(v); }}>
            <input ref={talkInput} placeholder={`Say something to ${talk.name}…`} className="flex-1 rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5 outline-none focus:border-amber-700" maxLength={300} />
            <button className="rounded-lg bg-amber-700 px-3 text-white" disabled={talk.busy}>Send</button>
          </form>
        </div>
        </div>
      )}

      {/* Side panels */}
      {panel && (
        <div className="pointer-events-auto absolute bottom-16 right-3 top-14 w-[min(92vw,360px)] overflow-y-auto rounded-xl border-4 border-amber-900/70 bg-amber-50 p-3 shadow-2xl">
          <div className="mb-2 flex items-center"><div className="text-base font-bold text-amber-900">{panel === "bag" ? "🎒 Your bag" : panel === "missions" ? "📜 Missions" : panel === "home" ? "🏡 Your cottage" : "📖 The world"}</div><div className="flex-1" /><button onClick={() => setPanel(null)} className="text-stone-400 hover:text-stone-700">✕</button></div>
          {panel === "bag" && <BagPanel me={me} onAction={invAction} />}
          {panel === "missions" && <MissionsPanel me={me} snap={snap} />}
          {panel === "quests" && <DailyQuestsPanel />}
          {panel === "friends" && <FriendsPanel />}
          {panel === "home" && me && <HomePanel me={me} onAction={invAction} onTheme={async (t) => { await api("/api/me", { homeTheme: t }, "PATCH"); void refreshMe(); }} />}
          {panel === "log" && (
            <div className="space-y-2">
              <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (!ask.trim()) return; void doInspect(`/api/inspect?q=${encodeURIComponent(ask)}&x=${snap?.me?.x ?? 0}&y=${snap?.me?.y ?? 0}`); }}>
                <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask: what's that sheep doing?" className="flex-1 rounded-lg border-2 border-amber-900/40 bg-white px-2 py-1.5 outline-none" />
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
    case "node": {
      const base = sel.kind.replace("_", " ");
      return sel.stage === 0 ? `${base} (empty)` : base;
    }
    case "enemy": return `Wild ${sel.kind} · ${sel.hp}/${sel.maxHp} HP`;
  }
}
function TopBtn({ children, on, active }: { children: React.ReactNode; on: () => void; active?: boolean }) {
  return <button onClick={on} className={`rounded-lg px-2 py-1 ${active ? "bg-amber-300 text-amber-900" : "bg-black/40 hover:bg-black/60"}`}>{children}</button>;
}

const SOURCE_LABEL: Record<ConversationSource, string> = {
  llm: "AI",
  scripted: "script",
  remote: "webhook",
};
const SOURCE_TINT: Record<ConversationSource, string> = {
  llm: "bg-violet-200 text-violet-900",
  scripted: "bg-stone-200 text-stone-700",
  remote: "bg-sky-200 text-sky-900",
};
function SourceBadge({ source }: { source: ConversationSource }) {
  return <span title={source} className={`mt-0.5 inline-flex shrink-0 rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${SOURCE_TINT[source]}`}>{SOURCE_LABEL[source]}</span>;
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
  const userRef = useRef<HTMLInputElement>(null);
  useEffect(() => { userRef.current?.focus(); }, []);
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/40">
      <form className="w-[min(92vw,340px)] rounded-xl border-4 border-amber-900/70 bg-amber-50 p-4 shadow-2xl" onSubmit={async (e) => { e.preventDefault(); const r = await api<{ ok?: boolean }>("/api/auth/login", { username: u, password: p }); if (r.error) setErr(r.error); else location.reload(); }}>
        <div className="text-lg font-bold text-amber-900">Welcome back</div>
        <input ref={userRef} value={u} onChange={(e) => setU(e.target.value)} placeholder="username" autoComplete="username" className="mt-3 w-full rounded-lg border-2 border-amber-900/40 px-2 py-1.5" />
        <input value={p} onChange={(e) => setP(e.target.value)} type="password" placeholder="password" autoComplete="current-password" className="mt-2 w-full rounded-lg border-2 border-amber-900/40 px-2 py-1.5" />
        {err && <div className="mt-2 text-red-700">{err}</div>}
        <div className="mt-3 flex gap-2"><button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white">Sign in</button><button type="button" onClick={onClose} className="rounded-lg bg-stone-200 px-3 py-1.5">Cancel</button><Link href="/signup" className="ml-auto self-center text-amber-800 underline">New here?</Link></div>
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

function CraftModal({ craft, me, performCraft, onClose }: {
  craft: { npcId: number; npcName: string; recipes: Recipe[] };
  me: Me | null;
  performCraft: (recipeKey: string, qty: number) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const doCraft = async (recipe: Recipe, qty: number) => {
    if (busy) return;
    setBusy(true);
    await performCraft(recipe.key, qty);
    setBusy(false);
  };

  return (
    <div role="dialog" aria-modal="true" onClick={onClose} className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div onClick={(e) => e.stopPropagation()} className="w-[min(94vw,560px)] rounded-2xl border-4 border-amber-900/70 bg-amber-50 p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="text-lg font-bold text-amber-900">📜 Craft with {craft.npcName}</div>
            {craft.recipes[0]?.line && <div className="mt-1 text-[12px] italic text-stone-600">"{craft.recipes[0].line}"</div>}
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700" aria-label="Close">✕</button>
        </div>
        <div className="mt-3 space-y-2">
          {craft.recipes.map((r) => (
            <CraftRow key={r.key} recipe={r} me={me} busy={busy} onCraft={(qty) => doCraft(r, qty)} />
          ))}
        </div>
        <div className="mt-3 flex justify-end"><Btn on={onClose} subtle>Done</Btn></div>
      </div>
    </div>
  );
}

function CraftRow({ recipe, me, busy, onCraft }: { recipe: Recipe; me: Me | null; busy: boolean; onCraft: (qty: number) => void }) {
  const [qty, setQty] = useState(1);
  const bag = me?.inventory ?? [];
  const haveMap = new Map<string, number>();
  for (const i of bag) haveMap.set(i.itemKey, (haveMap.get(i.itemKey) ?? 0) + i.qty);
  const max = Math.max(0, maxCraftable(recipe, bag));
  useEffect(() => { setQty((q) => Math.min(Math.max(1, q), Math.max(1, max))); }, [max]);
  const canMake = max >= 1;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white p-2 shadow">
      <span className="text-xl">{recipe.icon}</span>
      <div className="flex-1">
        <div className="font-bold">{recipe.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {recipe.inputs.map((i) => {
            const have = haveMap.get(i.itemKey) ?? 0;
            const need = i.qty * qty;
            const ok = have >= need;
            return (
              <span key={i.itemKey} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${ok ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-500 line-through"}`}>
                {ITEM_ICONS[i.itemKey] ?? "📦"} {i.itemKey.replace(/_/g, " ")} {have}/{need}
              </span>
            );
          })}
          <span className="text-stone-500">→</span>
          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">
            {ITEM_ICONS[recipe.output.itemKey] ?? "📦"} {recipe.output.itemKey.replace(/_/g, " ")} ×{recipe.output.qty * qty}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button disabled={busy || qty <= 1} onClick={() => setQty(Math.max(1, qty - 1))} className="rounded bg-stone-200 px-2 py-0.5 text-sm font-bold disabled:opacity-40">−</button>
        <input
          type="number"
          min={1}
          max={max || 1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Math.min(max || 1, Number(e.target.value) || 1)))}
          className="w-12 rounded border border-stone-300 px-1 py-0.5 text-center text-sm"
          disabled={busy}
        />
        <button disabled={busy || qty >= max} onClick={() => setQty((q) => Math.min(max || 1, q + 1))} className="rounded bg-stone-200 px-2 py-0.5 text-sm font-bold disabled:opacity-40">+</button>
      </div>
      <div className="flex flex-col gap-1">
        <button disabled={busy || !canMake} onClick={() => onCraft(qty)} className="rounded bg-amber-700 px-2 py-1 text-[11px] font-bold text-white shadow hover:brightness-110 disabled:opacity-40">Craft {qty}</button>
        <button disabled={busy || !canMake} onClick={() => onCraft(max)} className="rounded bg-yellow-600 px-2 py-1 text-[10px] font-bold text-white shadow hover:brightness-110 disabled:opacity-40">Craft all ({max})</button>
      </div>
    </div>
  );
}

function TradeModal({ trade, performTrade, onClose }: {
  trade: { npcId: number; npcName: string; npcKey: string; rows: { trade: TradeItem; have: number }[] };
  performTrade: (itemKey: string, qty: number) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const firstQtyRef = useRef<HTMLInputElement | null>(null);

  const doSell = async (row: { trade: TradeItem; have: number }, qty: number) => {
    if (busy) return;
    setBusy(true);
    await performTrade(row.trade.itemKey, qty);
    setBusy(false);
  };

  // Push a modal keymap so the trade modal gets its own keyboard
  // bindings (Enter → sell the first row, e → focus the qty input,
  // numbers → also focus, escape → close). Movement keys (WASD) are
  // blocked globally while the modal is open via the router. The `e`
  // here is modal-scoped and does NOT trigger the global "player.interact"
  // — the modal layer wins. We bind escape so the modal layer can
  // close the trade window.
  useEffect(() => {
    const firstRow = trade.rows[0];
    const keymap = {
      label: "trade",
      bindings: [
        ...(firstRow ? [{ keys: ["enter"], command: "trade.sell" as const, mode: "press" as const }] : []),
        { keys: ["e"], command: "trade.focus_qty" as const, mode: "press" as const },
        { keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"], command: "trade.focus_qty" as const, mode: "press" as const },
        { keys: ["escape"], command: "ui.close" as const, mode: "press" as const },
      ],
      handlers: [
        {
          id: "trade.sell" as const,
          scope: "ui" as const,
          run: () => {
            if (!firstRow || busy) return;
            const input = firstQtyRef.current;
            const qty = input ? Math.max(1, Math.min(firstRow.have, Number(input.value) || 1)) : 1;
            void doSell(firstRow, qty);
          },
        },
        {
          id: "trade.focus_qty" as const,
          scope: "ui" as const,
          run: () => { firstQtyRef.current?.focus(); firstQtyRef.current?.select(); },
        },
        {
          // Modal-local escape → close modal. The router's `trigger`
          // will look up the global "ui.close" handler in the HUD's
          // registration effect (which is global). It calls the `close`
          // function which closes the topmost open UI.
          id: "ui.close" as const,
          scope: "ui" as const,
          run: () => { onClose(); },
        },
      ],
    };
    const dispose = inputRouter.pushKeymap(keymap);
    // Focus the first qty input so the user can type immediately.
    const focusTimer = setTimeout(() => firstQtyRef.current?.focus(), 50);
    return () => { dispose(); clearTimeout(focusTimer); };
  }, [trade, busy, onClose]);

  return (
    <div role="dialog" aria-modal="true" onClick={onClose} className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div onClick={(e) => e.stopPropagation()} className="w-[min(94vw,520px)] rounded-2xl border-4 border-amber-900/70 bg-amber-50 p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="text-lg font-bold text-amber-900">💰 Trade with {trade.npcName}</div>
            {trade.rows.length > 0 && <div className="mt-1 text-[12px] italic text-stone-600">"{trade.rows[0].trade.line}"</div>}
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700" aria-label="Close">✕</button>
        </div>
        <div className="mt-3 space-y-2">
          {trade.rows.length === 0 && (
            <div className="rounded bg-stone-100 p-3 text-center text-stone-500">You have nothing {trade.npcName} buys right now.</div>
          )}
          {trade.rows.map((r, i) => (
            <TradeRow key={r.trade.itemKey} row={r} busy={busy} firstQtyRef={i === 0 ? firstQtyRef : undefined} onSell={(qty) => doSell(r, qty)} />
          ))}
        </div>
        <div className="mt-3 flex justify-end"><Btn on={onClose} subtle>Done (Esc)</Btn></div>
      </div>
    </div>
  );
}

function TradeRow({ row, busy, onSell, firstQtyRef }: {
  row: { trade: TradeItem; have: number };
  busy: boolean;
  onSell: (qty: number) => void;
  firstQtyRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [qty, setQty] = useState(1);
  const total = qty * row.trade.price;
  useEffect(() => { setQty((q) => Math.min(Math.max(1, q), row.have)); }, [row.have]);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white p-2 shadow">
      <span className="text-xl">{ITEM_ICONS[row.trade.itemKey] ?? "📦"}</span>
      <div className="flex-1">
        <div className="font-bold capitalize">{row.trade.itemKey.replace(/_/g, " ")}</div>
        <div className="text-[11px] text-stone-500">you have {row.have}</div>
      </div>
      <div className="flex items-center gap-1.5">
        <button disabled={busy || qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} className="rounded bg-stone-200 px-2 py-0.5 text-sm font-bold disabled:opacity-40">−</button>
        <input
          ref={firstQtyRef}
          type="number"
          min={1}
          max={row.have}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Math.min(row.have, Number(e.target.value) || 1)))}
          className="w-12 rounded border border-stone-300 px-1 py-0.5 text-center text-sm"
          disabled={busy}
        />
        <button disabled={busy || qty >= row.have} onClick={() => setQty((q) => Math.min(row.have, q + 1))} className="rounded bg-stone-200 px-2 py-0.5 text-sm font-bold disabled:opacity-40">+</button>
      </div>
      <div className="w-20 text-right">
        <div className="text-[11px] text-stone-500">= {total} 🪙</div>
        <div className="text-[11px] text-stone-500">{row.trade.price} ea</div>
      </div>
      <div className="flex flex-col gap-1">
        <button disabled={busy || qty < 1} onClick={() => onSell(qty)} className="rounded bg-yellow-600 px-2 py-1 text-[11px] font-bold text-white shadow hover:brightness-110 disabled:opacity-40">Sell {qty}</button>
        <button disabled={busy} onClick={() => onSell(row.have)} className="rounded bg-amber-700 px-2 py-1 text-[10px] font-bold text-white shadow hover:brightness-110 disabled:opacity-40">Sell all ({row.have})</button>
      </div>
    </div>
  );
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

function DailyQuestsPanel() {
  type Quest = {
    id: number;
    title: string;
    description: string;
    requirement: { type: string; [k: string]: unknown };
    reward: { coins?: number; gems?: number; xp?: number };
    progress: number;
    status: string;
  };
  type Streak = { current: number; longest: number; lastCompletedOn: string | null };
  const [data, setData] = useState<{ quests: Quest[]; streak: Streak | null } | null>(null);
  const load = async () => {
    const r = await fetch("/api/quests/today");
    if (r.ok) setData(await r.json());
  };
  useEffect(() => { void load(); }, []);
  if (!data) return <div className="text-stone-500">loading…</div>;
  const targetOf = (q: Quest) => {
    const r = q.requirement as Record<string, unknown>;
    return Number(r.qty ?? r.amount ?? 1);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-sm font-bold text-amber-900">Today's quests</div>
        {data.streak && <div className="rounded-full bg-orange-200 px-2 py-0.5 text-[10px] font-bold text-orange-900">🔥 {data.streak.current}-day streak</div>}
      </div>
      {data.quests.map((q) => {
        const tgt = targetOf(q);
        const done = q.status === "completed" || q.progress >= tgt;
        return (
          <div key={q.id} className={`rounded-lg border-2 bg-white/80 p-2 ${done ? "border-emerald-500" : "border-stone-300"}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[13px] font-bold">{q.title}</div>
                <div className="text-[11px] text-stone-600">{q.description}</div>
              </div>
              <div className="text-right text-[10px] text-stone-500">
                {q.reward.coins && <>🪙{q.reward.coins}<br /></>}
                {q.reward.gems && <>💎{q.reward.gems}<br /></>}
                {q.reward.xp && <>✨{q.reward.xp}</>}
              </div>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded bg-stone-200">
              <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (100 * q.progress) / tgt)}%` }} />
            </div>
            <div className="mt-0.5 text-[10px] text-stone-500">{q.progress}/{tgt} {done ? "✓" : ""}</div>
          </div>
        );
      })}
    </div>
  );
}

function FriendsPanel() {
  type Incoming = { id: number; fromUserId: number; from: { username: string; characterName: string | null } | null };
  type Friend = { username: string; characterName: string; status: "online" | "away" | "offline" };
  const [data, setData] = useState<{ incoming: Incoming[]; friends: Friend[] } | null>(null);
  const load = async () => {
    const r = await fetch("/api/friends");
    if (r.ok) setData(await r.json());
  };
  useEffect(() => { void load(); const i = setInterval(load, 15_000); return () => clearInterval(i); }, []);
  const respond = async (id: number, decision: "accept" | "decline") => {
    await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: decision, requestId: id }) });
    await load();
  };
  if (!data) return <div className="text-stone-500">loading…</div>;
  return (
    <div className="space-y-2">
      <div className="text-sm font-bold text-amber-900">Friend requests</div>
      {data.incoming.length === 0 && <div className="text-[12px] text-stone-500">No new requests.</div>}
      {data.incoming.map((r) => (
        <div key={r.id} className="flex items-center gap-2 rounded-lg border-2 border-stone-300 bg-white/80 p-2">
          <div className="flex-1">
            <div className="text-[13px] font-bold">@{r.from?.username ?? "?"}</div>
            <div className="text-[11px] text-stone-600">{r.from?.characterName ?? "no character"}</div>
          </div>
          <button onClick={() => respond(r.id, "accept")} className="rounded bg-emerald-500 px-2 py-1 text-[12px] text-white">accept</button>
          <button onClick={() => respond(r.id, "decline")} className="rounded bg-stone-300 px-2 py-1 text-[12px]">decline</button>
        </div>
      ))}
      <div className="text-sm font-bold text-amber-900">Friends</div>
      {data.friends.length === 0 && <div className="text-[12px] text-stone-500">No friends yet. Share your username so they can add you.</div>}
      {data.friends.map((f) => (
        <div key={f.username} className="flex items-center gap-2 rounded-lg border-2 border-stone-300 bg-white/80 p-2">
          <span className={`inline-block h-2 w-2 rounded-full ${f.status === "online" ? "bg-emerald-500" : f.status === "away" ? "bg-yellow-400" : "bg-stone-400"}`} />
          <div className="flex-1">
            <div className="text-[13px] font-bold">{f.characterName}</div>
            <div className="text-[11px] text-stone-600">@{f.username} · {f.status}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
