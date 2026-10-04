"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { bus, ITEM_ICONS, type Selection, type Snapshot } from "@/game/bus";
import { inputRouter } from "@/game/input/router";
import { formatBinding, prettyKey } from "@/game/input/bindings";
import type { ConversationSource, Offer, Recipe, TalkLine, TradeItem } from "@/lib/types";
import { TRADES, stockForNpc } from "@/lib/trade";
import { CROP_KINDS, GARDEN_CROPS } from "@/lib/crops";
import { RECIPES, canCraft, maxCraftable, recipesForNpc } from "@/lib/recipes";
import { AXE_ITEMS, PERKS, enemyKind, levelForXp, nextUnlock, unlocksBetween, xpForLevel } from "@/lib/progression";
import { positionAt } from "@/lib/motion";
import { NPC_TALK_KEEPALIVE_MS } from "@/lib/constants";
import LocationBanner from "./LocationBanner";
import QuestTracker from "./QuestTracker";
import CollectionBook from "./CollectionBook";
import ForgePanel from "./ForgePanel";
import InnPanel from "./InnPanel";
import RanchPanel from "./RanchPanel";
import MapPanel from "./MapPanel";
import BountyPanel from "./BountyPanel";
import TreasureMapView from "./TreasureMapView";
import Notifications from "./Notifications";
import type { ToastKind } from "@/types/notifications";
import { RELIC_REACH_PX } from "@/lib/relics";
import { BIKE_ITEM } from "@/lib/bike";
import BountyTracker from "./BountyTracker";
import { BOARD_REACH_PX, SPOT_REACH_PX, boardPoint } from "@/lib/bounties";
import { FORAGE_COOLDOWN_MS, isForage } from "@/lib/forage";
import { ENCOUNTERS } from "@/lib/encounters";
import type { EncounterView } from "@/types/encounter";
import type { BountyView } from "@/types/bounty";
import { WAYSTONE_ATTUNE_PX, chunksAround } from "@/lib/worldAtlas";
import { TUTORIAL_STEPS } from "@/lib/tutorial";
import { plusOf, withPlus } from "@/lib/forge";
import type { Move } from "@/types/motion";

type InvItem = { id: number; itemKey: string; qty: number; equipped: boolean; meta: Record<string, unknown>; def: { name: string; kind: string; description: string; icon: string; equippable: boolean; placeable: boolean } | null };
type Mission = { id: number; missionId: number; title: string; description: string; status: string; progress: number; target: number; npcName: string; npcId: number; sponsored: boolean; reward: { coins?: number; xp?: number; items?: { itemKey: string; qty: number }[] } };
type Me = { me: { id: number; name: string; coins: number; gems: number; hp: number; maxHp: number; level: number; xp: number; homeTheme: { wall: string; floor: string }; tutorialStep: number; tutorialProgress: number; title: string | null } | null; inventory: InvItem[]; missions: Mission[]; decor: { id: number; itemKey: string; gx: number; gy: number }[]; codesClaimed: number; perks: string[]; perkPoints: number };
type Inspect = { title: string; subtitle?: string; lines: string[]; events?: { text: string; when: string }[]; target?: { type: string; id: number; x?: number; y?: number; key?: string; reservable?: boolean } };

const WEATHER_ICON: Record<string, string> = { clear: "☀️", rain: "🌧️", fog: "🌫️", snow: "❄️" };

async function api<T = unknown>(url: string, body?: unknown, method = body ? "POST" : "GET"): Promise<T & { error?: string }> {
  try {
    const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return await res.json();
  } catch (err) {
    // Network error (server down, CORS, dropped connection). Surface as a
    // soft error so callers can show a toast instead of throwing an
    // unhandled rejection into the browser console.
    return { error: err instanceof Error ? err.message : "Network error" } as T & { error?: string };
  }
}

export default function Hud() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [selfPos, setSelfPos] = useState<{ x: number; y: number } | null>(null);
  const [rawSel, setSel] = useState<Selection | null>(null);
  // The selection with its distance kept live as the player walks. Worked
  // out while rendering, never stored: storing it from an effect made every
  // step a state update, which at running speed looped ("Maximum update
  // depth exceeded"). Uses the live sprite position — `snap.me` is the
  // server row and can be ~10 s stale.
  const sel = useMemo(() => {
    if (!rawSel || !snap) return rawSel;
    const self = selfPos ?? snap.me;
    const pos = entityPos(snap, rawSel);
    if (!self || !pos) return rawSel;
    return { ...rawSel, distance: Math.hypot(pos.x - self.x, pos.y - self.y) };
  }, [rawSel, snap, selfPos]);
  // Lot key whose "move out / give up" is waiting for a second tap.
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [panel, setPanel] = useState<"bag" | "missions" | "log" | "home" | "quests" | "friends" | "perks" | "book" | null>(null);
  const [talk, setTalk] = useState<{ npcId: number; name: string; role: string; sponsor: { businessName: string; brandColor: string } | null; lines: TalkLine[]; offers: Offer[]; busy: boolean } | null>(null);
  const [trade, setTrade] = useState<{ npcId: number; npcName: string; npcKey: string; rows: { trade: TradeItem; have: number }[] } | null>(null);
  const [craft, setCraft] = useState<{ npcId: number; npcName: string; recipes: Recipe[] } | null>(null);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [building, setBuilding] = useState<{ key: string; name: string } | null>(null);
  const [auth, setAuth] = useState<"login" | null>(null);
  const [chat, setChat] = useState("");
  const [ask, setAsk] = useState("");
  const [canFish, setCanFish] = useState(false);
  // Wild patches you've picked: node id → when it's yours to pick again.
  const [forageWait, setForageWait] = useState<ReadonlyMap<number, number>>(new Map());
  // Random encounters near you; which you've been told about / paid for.
  const [nearEncounters, setNearEncounters] = useState<EncounterView[]>([]);
  const announced = useRef(new Set<number>());
  const paid = useRef(new Set<number>());
  // Bounty boards: the one you're reading, and the bounties you carry.
  const [board, setBoard] = useState<{ town: string; name: string } | null>(null);
  /** The treasure map being read (its map id). */
  const [reading, setReading] = useState<number | null>(null);
  /** Hidden relics already found (the scene stops drawing their glints). */
  const relicsFound = useRef<Set<string>>(new Set());
  const [myBounties, setMyBounties] = useState<BountyView[]>([]);
  const bountiesRef = useRef<BountyView[]>([]);
  const arriving = useRef(new Map<number, number>());
  // The world map (M): open / opened at a waystone, the quest star, and
  // chunks seen this session that haven't been saved yet.
  const [mapOpen, setMapOpen] = useState<null | "browse" | "travel">(null);
  const [guideTarget, setGuideTarget] = useState<{ x: number; y: number } | null>(null);
  const [freshSeen, setFreshSeen] = useState<ReadonlySet<string>>(new Set());
  const pendingSeen = useRef(new Set<string>());
  const lastSeenChunk = useRef("");
  const attuned = useRef<Set<string> | null>(null);
  const attuning = useRef(new Set<string>());
  const talkInput = useRef<HTMLInputElement>(null);
  // Notifications are drawn by their own component (./Notifications), so a
  // burst of them never re-renders the HUD: these just send them along.
  const toast = useCallback((text: string, kind: ToastKind | string = "info") => {
    bus.emit("toast", { text, kind: kind === "good" || kind === "bad" ? kind : "info" });
  }, []);
  const refreshMe = useCallback(async () => setMe(await api<Me>("/api/me")), []);
  const loadBounties = useCallback(async () => {
    const r = await api<{ bounties?: BountyView[] }>("/api/bounties?mine=1");
    if (r.bounties) { setMyBounties(r.bounties); bountiesRef.current = r.bounties; }
  }, []);
  /** Tutorial steps, book discoveries and the like ride along on responses. */
  const notify = useCallback((notices?: string[]) => { for (const n of notices ?? []) toast(n, "good"); }, [toast]);

  useEffect(() => {
    const u = [
      bus.on("snapshot", setSnap),
      bus.on("playerMoved", setSelfPos),
      bus.on("select", setSel),
      bus.on("refreshMe", () => void refreshMe()),
      bus.on("canFish", setCanFish),
      bus.on("guide", setGuideTarget),
      // Entering a region fills the book's Places page (server checks you're there).
      bus.on("region", ({ key }) => {
        void api<{ new?: boolean; message?: string }>("/api/collection", { action: "visit", region: key }).then((r) => { if (r.new && r.message) toast(r.message, "good"); });
      }),
      bus.on("toggle", (which) => {
        if (which === "shop") {
          window.location.href = "/shop";
          return;
        }
        // The mobile action buttons emit "map" / "quests" / "friends" too —
        // map those to existing panels when possible.
        if (which === "map") { setMapOpen((m) => (m ? null : "browse")); return; }
        const target: "bag" | "missions" | "log" | "home" | "quests" | "friends" | null =
          which === "bag" ? "bag" :
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
  // HP from a `hurt` push: snapshots can lag a few seconds behind, so the
  // pushed value wins for a short while.
  const [hpLive, setHpLive] = useState<{ hp: number; maxHp: number } | null>(null);
  useEffect(() => bus.on("hurt", ({ hp, maxHp }) => { if (hp != null && maxHp != null) setHpLive({ hp, maxHp }); }), []);
  useEffect(() => {
    if (!hpLive) return;
    const t = setTimeout(() => setHpLive(null), 12_000);
    return () => clearTimeout(t);
  }, [hpLive]);
  useEffect(() => bus.on("knockout", () => setHpLive(null)), []);
  // World-boss news (it rose / was driven back / left) as a toast for
  // everyone online. The first snapshot only sets the baseline.
  const lastEventId = useRef<number | null>(null);
  useEffect(() => {
    const evs = snap?.events;
    if (!evs || evs.length === 0) return;
    const maxId = Math.max(...evs.map((e) => e.id));
    const prev = lastEventId.current;
    lastEventId.current = Math.max(prev ?? 0, maxId);
    if (prev == null) return;
    for (const e of evs) if (e.id > prev && (e.kind === "boss" || e.kind === "boss_defeated")) toast(e.text, "good");
  }, [snap?.events, toast]);
  // Level-up toast with what the new level unlocks.
  const lastLevel = useRef<number | null>(null);
  useEffect(() => {
    const lv = me?.me?.level;
    if (lv == null) return;
    const prev = lastLevel.current;
    lastLevel.current = lv;
    if (prev == null || lv <= prev) return;
    const unlocked = unlocksBetween(prev, lv).map((u) => u.text).join(" · ");
    toast(`⬆️ Level ${lv}!${unlocked ? ` Unlocked: ${unlocked}` : ""}`, "good");
  }, [me?.me?.level, toast]);

  // Mirror local selection changes to the bus so WorldScene's
  // `lastSelection` (which gates the context-sensitive E behavior) stays
  // in sync with the HUD. Without this, clearing `sel` here — via
  // setSel(null) after a pickup, the ✕ button, or because the entity
  // vanished — leaves WorldScene thinking the player still has the
  // stale selection, and the next E press runs primaryAction on a
  // gone entity (no menu, no action).
  // The stored selection, not the derived `sel`: that's a new object every
  // render, and the HUD also listens for "select" — mirroring it would loop.
  useEffect(() => {
    bus.emit("select", rawSel);
  }, [rawSel]);

  // (The router-registration effect lives further down, after `commitSelection`
  // and `close` are defined.)

  // Close the talk panel when the NPC drifts out of range (e.g. they walked
  // away, or you did) — without waiting for the next failed send.
  // Both positions must be live: the player's from the sprite (`snap.me`
  // can be a full resync old) and the NPC's from its scheduled move (row
  // x/y is where the move ENDS, not where the NPC is).
  useEffect(() => {
    if (!talk || !snap) return;
    const n = snap.npcs.find((x) => x.id === talk.npcId);
    const self = selfPos ?? snap.me;
    if (!n || !self) return;
    const p = livePos(n);
    if (Math.hypot(p.x - self.x, p.y - self.y) > 160) setTalk(null);
  }, [snap, talk, selfPos]);
  // While the dialog is open, keep the NPC holding still (the server
  // stops scheduling its moves until the hold lapses after we close).
  const talkNpcId = talk?.npcId;
  useEffect(() => {
    if (talkNpcId == null) return;
    const t = setInterval(() => void api(`/api/npc/${talkNpcId}/hold`, {}), NPC_TALK_KEEPALIVE_MS);
    return () => clearInterval(t);
  }, [talkNpcId]);
  // Tell the canvas when a modal is open so Phaser can ignore clicks behind it.
  useEffect(() => {
    bus.emit("modalOpen", !!talk || reading != null);
  }, [talk, reading]);
  // The selected entity vanished (someone picked the item up, it despawned):
  // drop the stale card instead of showing it forever.
  useEffect(() => {
    if (rawSel && snap && !entityPos(snap, rawSel)) setSel(null);
  }, [snap, rawSel]);

  const showGain = (items: { itemKey: string; qty: number; label?: string }[]) => bus.emit("gained", items);

  // ---------- actions ----------
  const act = async (body: Record<string, unknown>) => {
    const r = await api<{ ok?: boolean; message?: string; gained?: { itemKey: string; qty: number }[]; missions?: string[]; notices?: string[]; encounterResolved?: number | null; taken?: number; knockout?: { x: number; y: number; coinsLost: number } | null }>("/api/act", body);
    if (r.taken) bus.emit("hurt", { amount: r.taken });
    if (r.knockout) bus.emit("knockout", r.knockout);
    if (r.error) toast(r.error, "bad");
    else { if (r.message) toast(r.message, "good"); if (r.gained?.length) showGain(r.gained); if (r.missions?.length) toast(`Mission progress: ${r.missions.join(", ")}`, "good"); notify(r.notices); if (r.notices?.length) void loadBounties(); if (r.encounterResolved) paid.current.add(r.encounterResolved); void refreshMe(); bus.emit("poke", undefined); }
    return r;
  };
  // Garden, lot and seed-shop actions share act()'s toast/refresh handling.
  const post = async (url: string, body: Record<string, unknown>) => {
    const r = await api<{ ok?: boolean; message?: string; gained?: { itemKey: string; qty: number }[]; notices?: string[] }>(url, body);
    if (r.error) toast(r.error, "bad");
    else { if (r.message) toast(r.message, "good"); if (r.gained?.length) showGain(r.gained); notify(r.notices); void refreshMe(); bus.emit("poke", undefined); }
    return r;
  };
  const garden = (body: Record<string, unknown>) => post("/api/garden", body);
  const lotAction = (action: "acquire" | "release", key: string) => { setConfirmRelease(null); return post("/api/lots", { action, key }); };
  // Land lots are fenced fields, not buildings you can walk into.
  const isLandKey = (key: string) => key.startsWith("land_");
  const buy = async (npcKey: string, itemKey: string) => {
    const r = await api<{ ok?: boolean; spent?: number; notices?: string[] }>("/api/trade", { action: "buy", npcKey, itemKey, qty: 1 });
    if (r.error) toast(r.error, "bad");
    else { showGain([{ itemKey, qty: 1 }]); notify(r.notices); void refreshMe(); }
  };
  const myId = me?.me?.id ?? null;
  const seedsInBag = (me?.inventory ?? []).filter((i) => i.itemKey in GARDEN_CROPS && i.qty > 0);
  const hasAxe = (me?.inventory ?? []).some((i) => AXE_ITEMS.includes(i.itemKey) && i.qty > 0);
  const hasRod = (me?.inventory ?? []).some((i) => i.itemKey === "fishing_rod" && i.qty > 0);
  // The scene lets you ride (V) only with a bicycle in your bag.
  const hasBike = (me?.inventory ?? []).some((i) => i.itemKey === BIKE_ITEM && i.qty > 0);
  useEffect(() => {
    if (me) bus.emit("hasBike", hasBike);
    return bus.on("sceneReady", () => { if (me) bus.emit("hasBike", hasBike); });
  }, [me, hasBike]);

  const doInspect = async (q: string) => {
    const r = await api<Inspect>(q);
    if (r.error) toast(r.error, "bad"); else setInspect(r);
  };
  const startTalk = async (npcId: number, name: string, role: string) => {
    setTalk({ npcId, name, role, sponsor: null, lines: [], offers: [], busy: true });
    setSel(null);
    const hist = await api<{ history: { role: string; text: string }[] }>(`/api/npc/${npcId}/talk`);
    const r = await api<{ text: string; offers: Offer[]; source?: ConversationSource; notices?: string[]; npc: { sponsor: { businessName: string; brandColor: string } | null } }>(`/api/npc/${npcId}/talk`, { message: "" });
    if (r.error) { toast(r.error, "bad"); setTalk(null); return; }
    if (r.notices?.length) { notify(r.notices); void refreshMe(); }
    setTalk({ npcId, name, role, sponsor: r.npc.sponsor, lines: [...(hist.history ?? []).slice(-6).map((h) => ({ role: h.role as "player" | "npc", text: h.text })), { role: "npc", text: r.text, source: r.source }], offers: r.offers, busy: false });
    setTimeout(() => talkInput.current?.focus(), 50);
  };
  const sendTalk = async (message: string) => {
    if (!talk || talk.busy) return;
    setTalk({ ...talk, lines: [...talk.lines, { role: "player", text: message }], busy: true });
    const r = await api<{ text: string; offers: Offer[]; source?: ConversationSource; notices?: string[] }>(`/api/npc/${talk.npcId}/talk`, { message });
    if (r.error) {
      toast(r.error, "bad");
      // Walked out of range? Close the panel — the conversation is no longer
      // reachable and an open panel hides the toast behind itself.
      if (/closer first/i.test(r.error)) setTalk(null);
      else setTalk((t) => t && { ...t, busy: false });
      return;
    }
    if (r.notices?.length) { notify(r.notices); void refreshMe(); }
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
    const r = await api<{ ok?: boolean; error?: string; gained?: number; coins?: number; notices?: string[] }>("/api/trade", { itemKey, qty, npcKey: trade.npcKey });
    if (r.error || !r.ok) { toast(r.error ?? "Trade failed.", "bad"); return; }
    toast(`Sold ${qty} ${itemKey.replace(/_/g, " ")} for ${r.gained} 🪙.`, "good");
    notify(r.notices);
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
  const isPortalKey = (key: string) => snap?.buildings.some((b) => b.key === key && b.kind === "portal") ?? false;
  const isWaystoneKey = (key: string) => snap?.buildings.some((b) => b.key === key && b.kind === "waystone") ?? false;
  /** Attune a waystone you're beside (once; the server checks you're there). */
  const attune = useCallback(async (key: string) => {
    if (attuned.current?.has(key) || attuning.current.has(key)) return;
    attuning.current.add(key);
    const r = await api<{ new?: boolean; message?: string }>("/api/waystones", { action: "attune", key });
    attuning.current.delete(key);
    if (r.error) return;
    (attuned.current ??= new Set()).add(key);
    if (r.new && r.message) toast(r.message, "good");
  }, [toast]);
  // Waystones you've attuned (loaded once), so walking past only asks once.
  const loggedInNow = !!snap?.me;
  useEffect(() => {
    if (!loggedInNow || attuned.current) return;
    void api<{ waystones?: { key: string; attuned: boolean }[] }>("/api/map/markers").then((m) => {
      if (m.waystones) attuned.current = new Set(m.waystones.filter((w) => w.attuned).map((w) => w.key));
    });
  }, [loggedInNow]);
  useEffect(() => {
    if (!loggedInNow) return;
    const first = setTimeout(() => void loadBounties(), 0);
    const t = setInterval(() => void loadBounties(), 20_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [loggedInNow, loadBounties]);
  // Hidden relics you've found: the scene only draws the rest. Loaded once
  // (only your own pickups change it); sent again whenever the scene asks,
  // so it doesn't matter which of the two comes up first.
  const relicsLoaded = useRef(false);
  useEffect(() => {
    if (!loggedInNow) return;
    let off = false;
    const load = (retry: number) => void api<{ found?: string[] }>("/api/relics").then((r) => {
      if (off) return;
      if (!r.found) { if (retry < 5) setTimeout(() => load(retry + 1), 3000 * (retry + 1)); return; }
      relicsFound.current = new Set(r.found);
      relicsLoaded.current = true;
      bus.emit("relicsFound", r.found);
    });
    load(0);
    const unsub = bus.on("sceneReady", () => { if (relicsLoaded.current) bus.emit("relicsFound", [...relicsFound.current]); });
    return () => { off = true; unsub(); };
  }, [loggedInNow]);
  const pickUpRelic = async (key: string) => {
    const r = await post("/api/relics", { key }) as { error?: string; have?: number; total?: number };
    if (r.error) return;
    relicsFound.current.add(key);
    bus.emit("relicsFound", [...relicsFound.current]);
    bus.emit("relicPicked", { key, have: r.have ?? 0, total: r.total ?? 0 });
    setSel(null);
  };
  // Encounters: announce new ones nearby, and pay-outs you shared in.
  useEffect(() => {
    if (!loggedInNow) return;
    const poll = () => void api<{ encounters?: EncounterView[] }>("/api/encounters").then((r) => {
      if (!r.encounters) return;
      setNearEncounters(r.encounters);
      for (const e of r.encounters) {
        if (e.state === "active" && !announced.current.has(e.id)) { announced.current.add(e.id); toast(ENCOUNTERS[e.kind].call, "info"); }
        if (e.rewardedMe && !paid.current.has(e.id)) { paid.current.add(e.id); toast(`🤝 You helped: ${e.title}. +${ENCOUNTERS[e.kind].reward.coins} 🪙`, "good"); void refreshMe(); }
      }
    });
    const first = setTimeout(poll, 0);
    const t = setInterval(poll, 8_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [loggedInNow, toast, refreshMe]);
  const helpStranger = async (id: number) => {
    const r = await api<{ message?: string }>("/api/encounters", { action: "help", id });
    if (r.error) { toast(r.error, "bad"); return; }
    paid.current.add(id);
    if (r.message) toast(r.message, "good");
    void refreshMe();
    setNearEncounters((list) => list.map((e) => (e.id === id ? { ...e, state: "resolved" as const, rewardedMe: true } : e)));
  };
  // As you walk: mark the chunks around you seen (fog of war) and attune
  // any waystone you pass. Runs off the move event, reading the latest
  // snapshot through a ref.
  const buildingsRef = useRef(snap?.buildings ?? []);
  useEffect(() => { buildingsRef.current = snap?.buildings ?? []; }, [snap?.buildings]);
  const seenKeys = useRef(new Set<string>());
  useEffect(() => {
    if (!loggedInNow) return;
    return bus.on("playerMoved", (pos) => {
      const here = chunksAround(pos.x, pos.y);
      const key = `${here[4].cx},${here[4].cy}`;
      if (key !== lastSeenChunk.current) {
        lastSeenChunk.current = key;
        const add = here.map((c) => `${c.cx},${c.cy}`).filter((k) => !seenKeys.current.has(k));
        if (add.length) {
          for (const k of add) { seenKeys.current.add(k); pendingSeen.current.add(k); }
          setFreshSeen(new Set(seenKeys.current));
        }
      }
      for (const b of buildingsRef.current) {
        if (b.kind === "waystone" && Math.hypot(b.doorX + 8 - pos.x, b.doorY - pos.y) <= WAYSTONE_ATTUNE_PX) void attune(b.key);
      }
      // Bounties: reaching a scouting spot, or a parcel's board, counts.
      for (const b of bountiesRef.current) {
        if (!b.mine || b.mine.progress >= b.mine.target) continue;
        const spot = b.data.kind === "explore" ? b.data : b.data.kind === "delivery" ? boardPoint(b.data.toTown) : null;
        const reach = b.data.kind === "explore" ? SPOT_REACH_PX : BOARD_REACH_PX;
        if (!spot || Math.hypot(spot.x - pos.x, spot.y - pos.y) > reach) continue;
        if (Date.now() - (arriving.current.get(b.id) ?? 0) < 10_000) continue;
        arriving.current.set(b.id, Date.now());
        void api<{ message?: string }>("/api/bounties", { action: "arrive", id: b.id }).then((r) => { if (r.message) { toast(r.message, "good"); void loadBounties(); } });
      }
    });
  }, [loggedInNow, attune, toast, loadBounties]);
  useEffect(() => {
    if (!loggedInNow) return;
    const flush = () => {
      if (pendingSeen.current.size === 0) return;
      const chunks = [...pendingSeen.current].map((k) => k.split(",").map(Number));
      pendingSeen.current.clear();
      void api("/api/map/seen", { chunks });
    };
    const t = setInterval(flush, 10_000);
    return () => { clearInterval(t); flush(); };
  }, [loggedInNow]);
  const enterBuilding = async (key: string, name: string) => {
    const r = (await act({ action: "enter", key })) as { teleport?: { x: number; y: number }; error?: string };
    if (!r.error) bus.emit("dismount", undefined); // bikes stay outside
    // Portals (the cave) move you instead of opening a panel.
    if (r.teleport) bus.emit("teleport", r.teleport);
    else if (isPortalKey(key)) { /* refused (too far, …): act() already toasted */ }
    else if (key === "homes") setPanel("home");
    else if (isWaystoneKey(key)) { void attune(key); setMapOpen("travel"); }
    else setBuilding({ key, name });
    setSel(null);
  };

  // Computed once per render; reused below by commitSelection and the JSX.
  const loggedIn = !!snap?.me;
  const fishHint = (() => {
    const k = formatBinding("player.fish");
    return k ? `(${prettyKey(k)})` : "";
  })();
  const interactHint = (() => {
    const k = formatBinding("player.interact");
    return k ? `(${prettyKey(k)})` : "";
  })();
  const keyHint = (cmd: "player.craft" | "player.sell" | "player.attack"): string => {
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
      case "node": {
        const crop = snap.nodes.find((n) => n.id === s.id);
        if (crop?.ownerId != null) {
          // Garden crop: harvest when ripe (owner), otherwise water it.
          if (d > 90) { walk(); break; }
          if (crop.stage >= crop.stages - 1) {
            if (crop.ownerId === myId) void garden({ action: "harvest", nodeId: s.id });
            else toast("It's ready — but it isn't yours to harvest.", "info");
          } else if (!crop.watered) void garden({ action: "water", nodeId: s.id });
          else toast("Already watered. Check back when it grows.", "info");
          break;
        }
        const chop = CROP_KINDS[s.kind]?.needsAxe === true;
        if (s.stage < 1) { toast(chop ? "Just a stump. It'll grow back." : "Picked clean. It'll grow back.", "info"); return; }
        if (d > 90) { walk(); break; }
        if (chop && !hasAxe) { toast("You need an axe. Pip sells them.", "info"); break; }
        if (chop) bus.emit("attack", { x: pos.x, y: pos.y, tool: "axe" }); // swing the axe at the trunk
        void act({ action: "gather", id: s.id }).then((r) => {
          // Wild patches come back for you alone after a cooldown.
          const wait = (r as { readyInMs?: number }).readyInMs ?? (r.ok && isForage(s.kind) ? FORAGE_COOLDOWN_MS[s.kind] : 0);
          if (wait > 0) setForageWait((m) => new Map(m).set(s.id, Date.now() + wait));
        });
        break;
      }
      case "board":
        if (d > BOARD_REACH_PX) { walk(); break; }
        setBoard({ town: s.town, name: s.name });
        setSel(null);
        break;
      case "relic":
        if (d > RELIC_REACH_PX) { walk(); break; }
        void pickUpRelic(s.key);
        break;
      case "tree":
        // A terrain tree: a few chops fell it and open the way.
        if (d > 44) { walk(); break; }
        if (!hasAxe) { toast("You need an axe. Pip sells them.", "info"); break; }
        bus.emit("attack", { x: pos.x, y: pos.y, tool: "axe" });
        void act({ action: "chop_tree", vx: s.vx, vy: s.vy }).then((r) => { if ((r as { felled?: boolean }).felled) setSel(null); });
        break;
      case "plot":
        if (d > 90) { walk(); break; }
        if (seedsInBag[0]) void garden({ action: "plant", lotKey: s.lotKey, plot: s.plot, seedKey: seedsInBag[0].itemKey });
        else toast("You need seeds. The shopkeeper sells them.", "info");
        break;
      case "animal":
        if (d <= 90) void act({ action: "pet", id: s.id });
        else walk();
        break;
      case "enemy":
        if (d <= 80) {
          bus.emit("attack", { x: pos.x, y: pos.y }); // swing right away; the server resolves the hit
          void act({ action: "attack", id: s.id });
        } else walk();
        break;
      case "building":
        if (isLandKey(s.key)) { if (d > 140) walk(); } // nothing to enter
        else if (d <= 140) void enterBuilding(s.key, s.name);
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
    if (mapOpen) { setMapOpen(null); return; }
    if (board) { setBoard(null); return; }
    if (talk) { setTalk(null); return; }
    if (trade) { setTrade(null); return; }
    if (craft) { setCraft(null); return; }
    if (inspect) { setInspect(null); return; }
    if (panel) { setPanel(null); return; }
    if (building) { setBuilding(null); return; }
    if (sel) { setSel(null); return; }
  }, [mapOpen, board, talk, trade, craft, inspect, panel, building, sel]);

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
        run: () => setMapOpen((m) => (m ? null : "browse")),
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
    <div className="pointer-events-none absolute inset-0 select-none font-pixel text-[14px] text-stone-800">
      <LocationBanner />
      {loggedIn && (selfPos ?? snap?.me) && (
        // Where you stand, in world tiles (x grows east, y grows south).
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/55 px-2 py-0.5 text-[11px] text-white" title="Your position in tiles (x east, y south)">
          📍 {Math.floor((selfPos ?? snap!.me!).x / 16)}, {Math.floor((selfPos ?? snap!.me!).y / 16)}
        </div>
      )}
      {loggedIn && <BountyTracker list={myBounties} />}
      {loggedIn && board && (
        <BountyPanel town={board.town} name={board.name} activeCount={myBounties.length} onClose={() => setBoard(null)}
          onMessage={(text, kind, notices) => { toast(text, kind); notify(notices); void refreshMe(); }} onChanged={() => void loadBounties()} />
      )}
      {loggedIn && reading != null && (
        <TreasureMapView mapId={reading} onClose={() => setReading(null)} onMessage={(text, kind) => toast(text, kind)} onDug={() => void refreshMe()} />
      )}
      {loggedIn && mapOpen && (
        <MapPanel me={selfPos ?? snap?.me ?? null} guide={guideTarget} bounties={myBounties} encounters={nearEncounters} extraSeen={freshSeen} travelMode={mapOpen === "travel"} onClose={() => setMapOpen(null)} onMessage={(text, kind) => toast(text, kind)} />
      )}
      {loggedIn && me?.me && me.me.tutorialStep < TUTORIAL_STEPS.length && (
        <QuestTracker step={me.me.tutorialStep} progress={me.me.tutorialProgress} snap={snap} onSkip={async () => { await api("/api/tutorial", { action: "skip" }); toast("Tutorial skipped. Talk to the Elder any time for tips.", "info"); void refreshMe(); }} />
      )}
      {loggedIn && canFish && hasRod && !sel && !talk && (
        <div className="pointer-events-auto absolute bottom-20 left-1/2 -translate-x-1/2">
          <button onClick={() => inputRouter.trigger("player.fish")} className="pixel-btn px-3 py-1.5 font-bold">🎣 Fish {fishHint}</button>
        </div>
      )}
      {/* Top bar */}
      <div className="pointer-events-auto absolute left-0 right-0 top-0 flex flex-wrap items-center gap-2 bg-gradient-to-b from-black/50 to-transparent p-2 text-white">
        <div className="rounded-lg border-2 border-amber-900/60 bg-amber-100 px-3 py-1 text-base font-bold tracking-tight text-amber-900 shadow">🌳 thegrove</div>
        <div className="pixel-panel-dark px-2 py-1">{WEATHER_ICON[snap?.weather ?? "clear"]} {snap?.weather ?? "…"} · 🕰 {String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}</div>
        <div className="pixel-panel-dark px-2 py-1">👥 {snap?.onlineCount ?? snap?.players.length ?? 0} online · 🤖 {snap?.npcs.length ?? 0} agents</div>
        <div className="flex-1" />
        {loggedIn && me?.me && (
          <div className="pixel-panel-dark flex items-center gap-2 px-2 py-1">
            <span className="font-bold text-amber-200">{me.me.name}</span> <span>Lv {me.me.level}</span>
            {(() => {
              const hp = hpLive?.hp ?? snap?.me?.hp ?? me.me.hp;
              const maxHp = hpLive?.maxHp ?? snap?.me?.maxHp ?? me.me.maxHp;
              return (
                <>
                  <span className="h-2 w-20 overflow-hidden rounded bg-black/50"><span className="block h-full bg-red-500" style={{ width: `${(100 * hp) / maxHp}%` }} /></span>
                  <span>❤️ {hp}</span>
                </>
              );
            })()}<span>🪙 {snap?.me?.coins ?? me.me.coins}</span><span>💎 {(snap?.me as unknown as { gems?: number })?.gems ?? 0}</span>
            {(() => {
              // XP toward the next level, with the next unlock as a hint.
              const xp = (snap?.me as unknown as { xp?: number })?.xp ?? me.me.xp;
              const lv = levelForXp(xp);
              const lo = xpForLevel(lv), hi = xpForLevel(lv + 1);
              const next = nextUnlock(lv);
              return (
                <span className="flex items-center gap-1" title={`${xp - lo}/${hi - lo} XP to level ${lv + 1}${next ? ` · next unlock at Lv ${next.level}: ${next.text}` : ""}`}>
                  ✨<span className="h-2 w-16 overflow-hidden rounded bg-black/50"><span className="block h-full bg-amber-300" style={{ width: `${(100 * (xp - lo)) / (hi - lo)}%` }} /></span>
                </span>
              );
            })()}
          </div>
        )}
        {loggedIn ? (
          <>
            <TopBtn on={() => setPanel(panel === "bag" ? null : "bag")} active={panel === "bag"}>🎒 Bag</TopBtn>
            {((me?.perkPoints ?? 0) > 0 || (me?.perks.length ?? 0) > 0) && (
              <TopBtn on={() => setPanel(panel === "perks" ? null : "perks")} active={panel === "perks"}>⭐ Perks{(me?.perkPoints ?? 0) > 0 ? ` (${me?.perkPoints})` : ""}</TopBtn>
            )}
            <TopBtn on={() => setPanel(panel === "missions" ? null : "missions")} active={panel === "missions"}>📜 Missions{me?.missions.some((m) => m.status === "active" && m.progress >= m.target) ? " ✓" : ""}</TopBtn>
            <TopBtn on={() => setPanel(panel === "quests" ? null : "quests")} active={panel === "quests"}>⚡ Quests</TopBtn>
            <TopBtn on={() => setPanel(panel === "friends" ? null : "friends")} active={panel === "friends"}>👥 Friends</TopBtn>
            <TopBtn on={() => setPanel(panel === "home" ? null : "home")} active={panel === "home"}>🏡 Home</TopBtn>
            <TopBtn on={() => setPanel(panel === "book" ? null : "book")} active={panel === "book"}>📖 Book</TopBtn>
            <Link href="/shop" className="rounded-lg bg-violet-500 px-2 py-1 font-bold text-white hover:bg-violet-400">🛍️ Shop</Link>
          </>
        ) : null}
        {loggedIn && <TopBtn on={() => setMapOpen(mapOpen ? null : "browse")} active={!!mapOpen}>🗺️ Map</TopBtn>}
        <TopBtn on={() => setPanel(panel === "log" ? null : "log")} active={panel === "log"}>📰 World</TopBtn>
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
        <div className="pointer-events-auto absolute bottom-24 left-1/2 w-[min(92vw,420px)] -translate-x-1/2 pixel-panel p-4 shadow-xl">
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
        <div className="pointer-events-auto absolute bottom-20 left-1/2 flex -translate-x-1/2 flex-wrap items-center gap-2 pixel-panel p-2 shadow-xl">
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
                {npcKey && stockForNpc(npcKey).map((t) => {
                  const locked = !!t.minLevel && (me?.me?.level ?? 1) < t.minLevel;
                  return (
                    <Btn key={t.itemKey} on={() => void buy(npcKey, t.itemKey)} subtle disabled={locked}>
                      {locked ? `🔒 Lv ${t.minLevel}` : t.itemKey.endsWith("_seeds") ? "🌱" : ITEM_ICONS[t.itemKey] ?? "🛒"} Buy {t.itemKey.replace(/_seeds$/, "").replace(/_/g, " ")} · {t.price}🪙
                    </Btn>
                  );
                })}
              </>
            );
            return sel.distance <= 160 ? Buttons : <WalkBtn snap={snap} sel={sel} />;
          })()}
          {loggedIn && sel.type === "animal" && (sel.distance <= 90 ? <Btn on={() => commitSelection(sel)}>🤚 Pet {interactHint}</Btn> : <WalkBtn snap={snap} sel={sel} />)}
          {loggedIn && sel.type === "item" && (sel.distance <= 90 ? <Btn on={() => commitSelection(sel)}>🫳 Pick up {interactHint}</Btn> : <WalkBtn snap={snap} sel={sel} />)}
          {loggedIn && sel.type === "node" && (() => {
            const crop = snap?.nodes.find((n) => n.id === sel.id);
            if (crop?.ownerId == null) return null;
            // Garden crop: growth status, water (anyone), harvest (owner).
            const ripe = crop.stage >= crop.stages - 1;
            // Snapshot server time keeps render pure; minutes-level accuracy is plenty.
            const mins = crop.nextAdvanceAt ? Math.max(1, Math.ceil((crop.nextAdvanceAt - (snap?.now ?? 0)) / 60_000)) : 0;
            const stageMs = CROP_KINDS[crop.kind]?.regrowthMs ?? 0;
            const left = ripe ? 0 : mins + Math.round(((crop.stages - 2 - crop.stage) * stageMs) / 60_000);
            const status = ripe ? "Ready to harvest!" : `Stage ${crop.stage}/${crop.stages - 1} · ready in ~${left} min${crop.watered ? " · 💧" : ""}`;
            if (sel.distance > 90) return <><span className="text-[11px] text-stone-600">{status}</span><WalkBtn snap={snap} sel={sel} /></>;
            return (
              <>
                <span className="text-[11px] text-stone-600">{status}</span>
                {!ripe && <Btn on={() => void garden({ action: "water", nodeId: sel.id })} disabled={crop.watered}>💧 Water</Btn>}
                {ripe && crop.ownerId === myId && <Btn on={() => void garden({ action: "harvest", nodeId: sel.id })}>🧺 Harvest {interactHint}</Btn>}
              </>
            );
          })()}
          {loggedIn && sel.type === "plot" && (() => {
            const lot = snap?.lots.find((l) => l.key === sel.lotKey);
            if (!lot?.owner) return <span className="text-[11px] text-stone-600">{lot?.kind === "land" ? "Empty farmland. Claim this lot at its gate to plant here." : "An empty garden plot. Move into the house to plant here."}</span>;
            if (lot.owner.id !== myId) return <span className="text-[11px] text-stone-600">{lot.owner.name}&apos;s garden.</span>;
            if (sel.distance > 90) return <WalkBtn snap={snap} sel={sel} />;
            if (seedsInBag.length === 0) return <span className="text-[11px] text-stone-600">No seeds — the shopkeeper sells them.</span>;
            return seedsInBag.map((i) => (
              <Btn key={i.itemKey} on={() => void garden({ action: "plant", lotKey: sel.lotKey, plot: sel.plot, seedKey: i.itemKey })}>
                🌱 Plant {i.itemKey.replace(/_seeds$/, "")} ×{i.qty}
              </Btn>
            ));
          })()}
          {loggedIn && sel.type === "node" && snap?.nodes.find((n) => n.id === sel.id)?.ownerId == null && (() => {
            // Pickable at every stage except 0 (depleted). Out-of-range
            // shows Walk over. Stage 0 shows a dimmed "empty" label.
            const empty = sel.stage === 0;
            const chop = CROP_KINDS[sel.kind]?.needsAxe === true;
            if (sel.distance > 90) return <WalkBtn snap={snap} sel={sel} />;
            const wait = minutesUntil(forageWait.get(sel.id) ?? 0);
            if (wait) return <span className="text-[11px] text-stone-600">⏳ Yours again in {wait}m — others can still pick it.</span>;
            if (chop && !empty && !hasAxe) return <span className="text-[11px] text-stone-600">Needs an axe (Pip sells them).</span>;
            return (
              <Btn on={() => commitSelection(sel)} disabled={empty}>
                {chop ? (empty ? "🪵 Stump — regrowing" : "🪓 Chop") : empty ? "🌱 Empty" : "🧺 Gather"} {interactHint}
              </Btn>
            );
          })()}
          {loggedIn && sel.type === "relic" && (sel.distance > RELIC_REACH_PX ? <WalkBtn snap={snap} sel={sel} /> : <Btn on={() => commitSelection(sel)}>✨ Pick it up {interactHint}</Btn>)}
          {loggedIn && sel.type === "board" && (sel.distance > BOARD_REACH_PX ? <WalkBtn snap={snap} sel={sel} /> : <Btn on={() => commitSelection(sel)}>📜 Read the board {interactHint}</Btn>)}
          {loggedIn && sel.type === "tree" && (sel.distance > 44 ? <WalkBtn snap={snap} sel={sel} />
            : hasAxe ? <Btn on={() => commitSelection(sel)}>🪓 Chop {interactHint}</Btn>
            : <span className="text-[11px] text-stone-600">Needs an axe (Pip sells them).</span>)}
          {loggedIn && sel.type === "enemy" && (sel.distance <= 80 ? <Btn on={() => commitSelection(sel)}>⚔️ Attack {keyHint("player.attack")}</Btn> : <WalkBtn snap={snap} sel={sel} />)}
          {loggedIn && sel.type === "building" && !isLandKey(sel.key) && (sel.distance <= 140 ? (
            <Btn on={() => commitSelection(sel)}>{sel.key === "cave_mouth" ? "🕳️ Enter the cave" : sel.key === "cave_exit" ? "☀️ Climb out" : "🚪 Enter"} {interactHint}</Btn>
          ) : <WalkBtn snap={snap} sel={sel} />)}
          {loggedIn && sel.type === "building" && isLandKey(sel.key) && sel.distance > 140 && <WalkBtn snap={snap} sel={sel} />}
          {loggedIn && sel.type === "building" && (() => {
            const lot = snap?.lots.find((l) => l.buildingKey === sel.key);
            if (!lot) return null;
            const land = lot.kind === "land";
            const ranch = lot.kind === "ranch";
            if (lot.owner?.id === myId) {
              const confirming = confirmRelease === lot.key;
              return <>
                <span className="text-[11px] font-bold text-emerald-700">{land ? "🌱 Your land" : ranch ? "🐔 Your ranch" : "🏡 Your home"}</span>
                <Btn on={() => (confirming ? void lotAction("release", lot.key) : setConfirmRelease(lot.key))} subtle>
                  {confirming ? (ranch ? "Sure? Animals leave" : "Sure? Crops are cleared") : land || ranch ? "Give up" : "Move out"}
                </Btn>
              </>;
            }
            if (lot.owner) return <span className="text-[11px] text-stone-600">{land ? `🌱 Land of ${lot.owner.name}` : ranch ? `🐔 Ranch of ${lot.owner.name}` : `🏡 Home of ${lot.owner.name}`}</span>;
            if (land) return <Btn on={() => void lotAction("acquire", lot.key)}>🌱 {lot.price > 0 ? `Buy land · ${lot.price}🪙` : "Claim land (free)"}</Btn>;
            if (ranch) return <Btn on={() => void lotAction("acquire", lot.key)}>🐔 {lot.price > 0 ? `Buy ranch · ${lot.price}🪙` : "Claim ranch (free)"}</Btn>;
            return <Btn on={() => void lotAction("acquire", lot.key)}>🏡 {lot.price > 0 ? `Buy · ${lot.price}🪙` : "Move in (free)"}</Btn>;
          })()}
          {sel.type === "building" && sel.reservable && !sel.hasSponsor && <Link href={`/sponsor?building=${sel.key}`} className="rounded-lg bg-orange-500 px-3 py-1.5 font-bold text-white hover:bg-orange-400">🏪 Reserve for your business</Link>}
          {sel.type !== "plot" && sel.type !== "tree" && sel.type !== "board" && sel.type !== "relic" && <Btn on={() => doInspect(`/api/inspect?type=${sel.type}&id=${sel.id}`)} subtle>🔍 About</Btn>}
          <button className="px-2 text-stone-400 hover:text-stone-700" onClick={() => setSel(null)}>✕</button>
        </div>
      )}

      {/* Chat input */}
      {loggedIn && !talk && (
        <form className="pointer-events-auto absolute bottom-3 left-3 flex w-[min(90vw,360px)] gap-1" onSubmit={async (e) => { e.preventDefault(); if (!chat.trim()) return; await act({ action: "chat", text: chat }); setChat(""); }}>
          <input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Say something to the plaza… (WASD to walk, Shift to run, E to interact)" className="flex-1 rounded-lg border-2 border-amber-900/50 bg-amber-50/95 px-2 py-1.5 outline-none focus:border-amber-700" maxLength={140} />
          <button className="rounded-lg bg-amber-700 px-3 text-white">Say</button>
        </form>
      )}
      {!loggedIn && <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/40 px-2 py-1 text-[11px] text-white">Spectating · drag to pan · scroll to zoom · click things</div>}

      {/* Toasts + gains (their own component: bursts don't re-render the HUD) */}
      <Notifications />

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
          className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-black/20 pb-3"
        >
        <div onClick={(e) => e.stopPropagation()} className="pixel-panel relative mt-6 w-[min(96vw,720px)]">
          {/* Speaker name tab, like a handheld RPG text box */}
          <div className="pixel-panel-dark absolute -top-5 left-4 flex items-center gap-2 px-3 py-0.5">
            <span className="font-bold">{talk.name}</span><span className="text-[12px] opacity-75">{talk.role}</span>
            {talk.sponsor && <span className="rounded px-1.5 text-[11px] font-bold text-white" style={{ background: talk.sponsor.brandColor }}>★ {talk.sponsor.businessName}</span>}
          </div>
          {(() => {
            // A stranger out in the wilds who needs something handed over.
            const enc = nearEncounters.find((e) => e.npcId === talk.npcId && e.state === "active" && e.need);
            return enc ? (
              <div className="absolute -top-5 right-4"><button onClick={() => void helpStranger(enc.id)} className="pixel-btn bg-emerald-400 px-3 py-0.5 text-sm font-bold">🤝 Give {enc.need}</button></div>
            ) : null;
          })()}
          <button className="absolute right-2 top-1 text-stone-500 hover:text-stone-800" onClick={() => { setTalk(null); }}>✕</button>
          {/* Earlier lines, small; the latest NPC line types out large below. */}
          <div className="max-h-28 space-y-1 overflow-y-auto px-4 pt-5 text-[13px]">
            {talk.lines.slice(0, Math.max(0, lastNpcLine(talk.lines))).map((l, i) => (
              <div key={i} className={`flex ${l.role === "player" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] ${l.role === "player" ? "text-emerald-800" : l.text.startsWith("(") ? "italic text-stone-500" : "text-stone-600"}`}>
                  {l.role === "player" ? "▸ " : ""}{l.text}
                </div>
              </div>
            ))}
          </div>
          <div className="min-h-[3.5rem] px-4 pb-2 pt-1 text-[16px] leading-snug text-stone-900">
            {(() => {
              const i = lastNpcLine(talk.lines);
              const l = i >= 0 ? talk.lines[i] : null;
              if (!l) return talk.busy ? <span className="blink-caret">▼</span> : null;
              return (
                <div className="flex items-start gap-1.5">
                  <Typewriter key={`${i}:${l.text.length}`} text={l.text} />
                  {l.source && <SourceBadge source={l.source} />}
                </div>
              );
            })()}
            {talk.lines.slice(lastNpcLine(talk.lines) + 1).map((l, k) => (
              <div key={`after${k}`} className="mt-1 text-right text-[13px] text-emerald-800">▸ {l.text}</div>
            ))}
            {talk.busy && lastNpcLine(talk.lines) >= 0 && <div className="blink-caret text-right text-stone-500">▼</div>}
          </div>
          {talk.offers.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pb-2">
              {talk.offers.map((o) => (
                <button key={o.id} onClick={() => acceptOffer(o.id)} className={`pixel-btn px-3 py-1.5 font-bold text-white hover:brightness-110 ${o.type === "discount" ? "bg-orange-500" : o.type === "sell" ? "bg-yellow-600" : o.type === "turnin" ? "bg-emerald-600" : o.type === "mission" ? "bg-sky-600" : "bg-violet-600"}`}>
                  {o.type === "discount" ? "🎟️ " : o.type === "turnin" ? "✅ " : o.type === "mission" ? "📜 " : "🎁 "}{o.label}
                </button>
              ))}
            </div>
          )}
          <form className="flex gap-1 border-t-2 border-[#e2c58c] p-2" onSubmit={(e) => { e.preventDefault(); const v = talkInput.current?.value.trim(); if (!v) return; talkInput.current!.value = ""; void sendTalk(v); }}>
            <input ref={talkInput} placeholder={`Say something to ${talk.name}…`} className="flex-1 rounded border-2 border-[#3b2a1d]/50 bg-[#fffdf4] px-2 py-1.5 outline-none focus:border-[#3b2a1d]" maxLength={300} />
            <button className="pixel-btn bg-[#4f9a4a] px-3 font-bold text-white" disabled={talk.busy}>Send</button>
          </form>
        </div>
        </div>
      )}

      {/* Side panels */}
      {panel && (
        <div className="pointer-events-auto absolute bottom-16 right-3 top-14 w-[min(92vw,360px)] overflow-y-auto pixel-panel p-3 shadow-2xl">
          <div className="mb-2 flex items-center"><div className="text-base font-bold text-amber-900">{panel === "bag" ? "🎒 Your bag" : panel === "missions" ? "📜 Missions" : panel === "home" ? "🏡 Your cottage" : panel === "perks" ? "⭐ Perks" : panel === "book" ? "📖 Collection book" : "🗺️ The world"}</div><div className="flex-1" /><button onClick={() => setPanel(null)} className="text-stone-400 hover:text-stone-700">✕</button></div>
          {panel === "bag" && <BagPanel me={me} onAction={invAction} onRead={(mapId) => { setReading(mapId); setPanel(null); }} />}
          {panel === "missions" && <MissionsPanel me={me} snap={snap} />}
          {panel === "quests" && <DailyQuestsPanel />}
          {panel === "friends" && <FriendsPanel />}
          {panel === "book" && <CollectionBook onMessage={(text, kind) => { toast(text, kind); void refreshMe(); }} />}
          {panel === "perks" && me && <PerksPanel me={me} onPick={async (perk) => { await post("/api/perks", { perk }); }} />}
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
        <div className="pointer-events-auto absolute left-1/2 top-1/2 w-[min(94vw,520px)] -translate-x-1/2 -translate-y-1/2 pixel-panel p-4 shadow-2xl">
          <div className="flex items-start"><div><div className="text-lg font-bold text-amber-900">{building.name}</div>{bInfo?.sponsor && <div className="text-[12px]"><span className="rounded px-2 py-0.5 font-bold text-white" style={{ background: bInfo.sponsor.brandColor }}>{bInfo.sponsor.businessName}</span> <span className="text-stone-500">— {bInfo.sponsor.tagline}</span></div>}</div><div className="flex-1" /><button onClick={() => setBuilding(null)} className="text-stone-400 hover:text-stone-700">✕</button></div>
          {bInfo?.kind === "forge" && <ForgePanel onMessage={(text, kind) => { toast(text, kind); void refreshMe(); }} />}
          {bInfo?.kind === "ranch" && <RanchPanel ranchKey={bInfo.key} onMessage={(text, kind) => { toast(text, kind); void refreshMe(); }} onGain={showGain} />}
          {bInfo?.kind === "inn" && <InnPanel innKey={bInfo.key} myId={me?.me?.id ?? null} hurt={(hpLive?.hp ?? snap?.me?.hp ?? 0) < (hpLive?.maxHp ?? snap?.me?.maxHp ?? 0)} onMessage={(text, kind) => { toast(text, kind); setHpLive(null); void refreshMe(); }} onGain={showGain} onChanged={() => void refreshMe()} />}
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

/** Whole minutes until `at` (rounded up), or 0 once it's passed. */
function minutesUntil(at: number): number {
  const ms = at - Date.now();
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
}
function clockFrom(s: Snapshot) {
  const dayMs = s.dayLengthMinutes * 60_000;
  return ((((Date.now() - s.epochStart) % dayMs) / dayMs) * 24 + 7) % 24;
}
function timeAgo(at: number) {
  const m = Math.floor((Date.now() - at) / 60000);
  return m < 1 ? "now" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
}
const TREE_NAMES: Readonly<Record<string, string>> = { oak: "🌳 Oak tree", pine: "🌲 Pine tree", palm: "🌴 Palm tree", snowpine: "🌲 Snowy pine", dead: "🪵 Dead tree", dark: "🌳 Darkwood tree" };
function selTitle(sel: Selection) {
  switch (sel.type) {
    case "npc": return `${sel.name} · ${sel.role}${sel.sponsored ? " ★" : ""}`;
    case "animal": return `${sel.name} the ${sel.species}`;
    case "building": return sel.name;
    case "player": return `${sel.name} (villager)`;
    case "item": return `${ITEM_ICONS[sel.itemKey] ?? "📦"} ${sel.itemKey.replace("_", " ")}`;
    case "node": {
      const base = sel.kind.replace(/_crop$/, "").replace("_", " ");
      if (sel.kind === "oak_tree") return sel.stage === 0 ? "Oak stump" : "Oak tree";
      return sel.stage === 0 ? `${base} (empty)` : base;
    }
    case "enemy": {
      const def = enemyKind(sel.kind);
      const tier = def.tier === "boss" ? "Boss" : `Tier ${def.tier}`;
      return sel.title ? `${sel.title} · Wanted ${def.name} · ${sel.hp}/${sel.maxHp} HP` : `${def.name} · ${tier} · ${sel.hp}/${sel.maxHp} HP · ${def.xp} XP`;
    }
    case "plot": return "🌱 Garden plot";
    case "tree": return TREE_NAMES[sel.kind] ?? "🌳 Tree";
    case "board": return `📜 ${sel.name} bounty board`;
    case "relic": return "✨ Something glinting on the ground";
  }
}
/** Pick a perk (one point every 5 levels) and see the ones you have. */
function PerksPanel({ me, onPick }: { me: Me; onPick: (perk: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const owned = new Set(me.perks);
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-stone-600">
        {me.perkPoints > 0 ? `You have ${me.perkPoints} perk point${me.perkPoints > 1 ? "s" : ""} to spend.` : "You earn a perk point every 5 levels."}
      </p>
      {PERKS.map((p) => (
        <div key={p.key} className="flex items-center gap-2 rounded-lg bg-white p-2 shadow">
          <span className="text-xl">{p.icon}</span>
          <div className="flex-1"><div className="font-bold">{p.name}</div><div className="text-[11px] text-stone-600">{p.description}</div></div>
          {owned.has(p.key) ? (
            <span className="text-[11px] font-bold text-emerald-700">✓ Yours</span>
          ) : (
            <button
              disabled={busy || me.perkPoints < 1}
              onClick={async () => { setBusy(true); try { await onPick(p.key); } finally { setBusy(false); } }}
              className="rounded bg-amber-700 px-2 py-1 text-[11px] font-bold text-white shadow disabled:opacity-40"
            >Pick</button>
          )}
        </div>
      ))}
    </div>
  );
}
/** Index of the newest NPC line in a conversation (-1 if none). */
function lastNpcLine(lines: TalkLine[]): number {
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].role === "npc") return i;
  return -1;
}

/** Text that types itself out; a click shows it all at once. */
function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) return;
    const t = setTimeout(() => setN((k) => Math.min(text.length, k + (text[k] === " " ? 2 : 1))), 22);
    return () => clearTimeout(t);
  }, [n, text]);
  return (
    <span className="flex-1 cursor-pointer" onClick={() => setN(text.length)}>
      {text.slice(0, n)}
      {n < text.length && <span className="opacity-0">{text.slice(n)}</span>}
    </span>
  );
}

function TopBtn({ children, on, active }: { children: React.ReactNode; on: () => void; active?: boolean }) {
  return <button onClick={on} className={`pixel-btn px-2 py-1 ${active ? "bg-[#f4d27a] text-[#3b2a1d]" : "bg-[#2c3a5a]/85 text-[#f4f0e4] hover:bg-[#3a4c74]"}`}>{children}</button>;
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
  return <button disabled={disabled} onClick={on} className={`pixel-btn px-3 py-1.5 font-bold disabled:opacity-40 ${subtle ? "bg-[#efe4c4] text-stone-800 hover:bg-[#f7eed4]" : "bg-[#4f9a4a] text-white hover:bg-[#5aaa54]"}`}>{children}</button>;
}
/** Where a moving entity is right now (row x/y is where its move ends). */
function livePos(e: { x: number; y: number; move: Move | null }): { x: number; y: number } {
  if (!e.move) return { x: e.x, y: e.y };
  const p = positionAt(e.move, Date.now());
  return { x: p.x, y: p.y };
}
function entityPos(snap: Snapshot, sel: Selection): { x: number; y: number } | null {
  if (sel.type === "npc") { const n = snap.npcs.find((x) => x.id === sel.id); return n ? livePos(n) : null; }
  if (sel.type === "animal") { const a = snap.animals.find((x) => x.id === sel.id); return a ? livePos(a) : null; }
  if (sel.type === "item") { const a = snap.groundItems.find((x) => x.id === sel.id); return a ? { x: a.x, y: a.y } : null; }
  if (sel.type === "node") { const a = snap.nodes.find((x) => x.id === sel.id); return a ? { x: a.x, y: a.y } : null; }
  if (sel.type === "enemy") { const a = snap.enemies.find((x) => x.id === sel.id); return a ? livePos(a) : null; }
  if (sel.type === "building") { const b = snap.buildings.find((x) => x.id === sel.id); return b ? { x: b.doorX, y: b.doorY } : null; }
  if (sel.type === "player") { const p = snap.players.find((x) => x.id === sel.id); return p ? { x: p.x, y: p.y } : null; }
  if (sel.type === "plot") return { x: sel.x, y: sel.y };
  if (sel.type === "tree" || sel.type === "board" || sel.type === "relic") return { x: sel.x, y: sel.y };
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
      <form className="w-[min(92vw,340px)] pixel-panel p-4 shadow-2xl" onSubmit={async (e) => { e.preventDefault(); const r = await api<{ ok?: boolean }>("/api/auth/login", { username: u, password: p }); if (r.error) setErr(r.error); else location.reload(); }}>
        <div className="text-lg font-bold text-amber-900">Welcome back</div>
        <input ref={userRef} value={u} onChange={(e) => setU(e.target.value)} placeholder="username" autoComplete="username" className="mt-3 w-full rounded-lg border-2 border-amber-900/40 px-2 py-1.5" />
        <input value={p} onChange={(e) => setP(e.target.value)} type="password" placeholder="password" autoComplete="current-password" className="mt-2 w-full rounded-lg border-2 border-amber-900/40 px-2 py-1.5" />
        {err && <div className="mt-2 text-red-700">{err}</div>}
        <div className="mt-3 flex gap-2"><button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white">Sign in</button><button type="button" onClick={onClose} className="rounded-lg bg-stone-200 px-3 py-1.5">Cancel</button><Link href="/signup" className="ml-auto self-center text-amber-800 underline">New here?</Link></div>
      </form>
    </div>
  );
}
function BagPanel({ me, onAction, onRead }: { me: Me | null; onAction: (b: Record<string, unknown>, m?: string) => Promise<void>; onRead: (mapId: number) => void }) {
  if (!me) return <div>Loading…</div>;
  if (me.inventory.length === 0) return <div className="text-stone-500">Empty. Pet a chicken, pick a berry, talk to a baker.</div>;
  return (
    <div className="space-y-1.5">
      {me.inventory.map((i) => (
        <div key={i.id} className={`rounded-lg border-2 bg-white p-2 ${i.equipped ? "border-emerald-500" : "border-transparent"}`} style={i.itemKey === "discount" ? { borderColor: String(i.meta.color ?? "#e76f51") } : undefined}>
          <div className="flex items-center gap-2"><span className="text-xl">{i.def?.icon ?? "📦"}</span><div><div className="font-bold">{i.itemKey === "discount" ? `${i.meta.business} code` : withPlus(i.def?.name ?? i.itemKey, plusOf(i.meta))}{i.qty > 1 && <span className="text-stone-500"> ×{i.qty}</span>}{i.equipped && <span className="ml-1 text-[10px] text-emerald-700">equipped</span>}</div><div className="text-[11px] text-stone-500">{i.itemKey === "discount" ? <span><b className="text-base tracking-widest text-orange-700">{String(i.meta.code)}</b> — {String(i.meta.text)}{typeof i.meta.website === "string" && i.meta.website ? <> · <a className="underline" href={i.meta.website} target="_blank" rel="noreferrer">redeem</a></> : null}</span> : i.def?.description}</div></div></div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {i.def?.kind === "consumable" && <Sm on={() => onAction({ action: "use", inventoryId: i.id })}>Eat</Sm>}
            {i.itemKey === "treasure_map" && typeof i.meta.mapId === "number" && <Sm on={() => onRead(i.meta.mapId as number)}>🔍 Read</Sm>}
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
  const needLevel = recipe.requires?.level ?? 0;
  const locked = (me?.me?.level ?? 1) < needLevel;
  const max = locked ? 0 : Math.max(0, maxCraftable(recipe, bag));
  useEffect(() => { setQty((q) => Math.min(Math.max(1, q), Math.max(1, max))); }, [max]);
  const canMake = max >= 1;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white p-2 shadow">
      <span className="text-xl">{recipe.icon}</span>
      <div className="flex-1">
        <div className="font-bold">{recipe.name}{locked && <span className="ml-1 text-[11px] font-normal text-stone-500">🔒 Lv {needLevel}</span>}</div>
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
