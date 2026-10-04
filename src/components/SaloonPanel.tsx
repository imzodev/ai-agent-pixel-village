"use client";
// The inn's Games tab: blackjack against the innkeeper, liar's dice at the
// table with whoever's here, and arm wrestling. The server holds every game;
// this panel shows your side of it, refreshing when the server nudges
// (a WebSocket "saloon" message) and on a short poll as a fallback.
import { useCallback, useEffect, useRef, useState } from "react";
import { bus } from "@/game/bus";
import { needleAt } from "@/lib/saloon/arm";
import { MAX_BET, MIN_BET } from "@/lib/saloon/rules";
import type { ArmMatchView, BlackjackView, Card, DiceTableView, SaloonView } from "@/types/saloon";
import type { InnPatron } from "@/types/inn";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const PIPS = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const BETS = [5, 10, 25, 50];

type Tab = "blackjack" | "dice" | "arm" | "leaders";
type Send = (game: "blackjack" | "dice" | "arm", action: string, extra?: Record<string, unknown>) => Promise<void>;

export default function SaloonPanel({ innKey, patrons, myId, onMessage, onChanged }: {
  innKey: string;
  patrons: InnPatron[];
  myId: number | null;
  onMessage: (text: string, kind: "good" | "bad") => void;
  onChanged: () => void;
}) {
  const [view, setView] = useState<SaloonView | null>(null);
  const [tab, setTab] = useState<Tab>("blackjack");
  const [busy, setBusy] = useState(false);
  /** Server clock minus ours (for countdowns and the arm-wrestling needle). */
  const offset = useRef(0);

  const take = useCallback((v: SaloonView) => { offset.current = v.serverTime - Date.now(); setView(v); }, []);
  const load = useCallback(() => fetch(`/api/saloon?inn=${encodeURIComponent(innKey)}`).then((r) => r.json()).then((r) => { if (r && !r.error) take(r); }).catch(() => {}), [innKey, take]);

  // Busy tables refresh quickly; a quiet one now and then. Nudges refresh at once.
  const live = !!view && (view.dice.seats.some((s) => s.you) || view.arm?.status === "playing" || view.arm?.status === "invited" || view.invites.length > 0);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), live ? 2500 : 8000);
    const off = bus.on("saloon", ({ inn }) => { if (inn === innKey) void load(); });
    return () => { clearTimeout(first); clearInterval(t); off(); };
  }, [load, live, innKey]);

  const send: Send = async (game, action, extra = {}) => {
    if (busy) return;
    setBusy(true);
    const r = await fetch("/api/saloon", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ inn: innKey, game, action, ...extra }) }).then((r) => r.json()).catch(() => ({ error: "Network error" }));
    setBusy(false);
    if (r.error) { onMessage(r.error, "bad"); return; }
    if (r.message) onMessage(r.message, "good");
    if (r.view) take(r.view);
    onChanged();
  };

  if (!view) return <div className="mt-3 text-stone-500">Shuffling the cards…</div>;
  const tabs: [Tab, string][] = [["blackjack", "🃏 Blackjack"], ["dice", "🎲 Liar's dice"], ["arm", "💪 Arm wrestling"], ["leaders", "🏆 This week"]];
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-1">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded px-2 py-1 text-xs font-bold ${tab === k ? "bg-amber-600 text-white" : "bg-amber-200/70 text-amber-900 hover:bg-amber-200"}`}>
            {label}{k === "arm" && view.invites.length ? " ❗" : ""}{k === "dice" && view.dice.phase === "playing" && view.dice.turnId === myId ? " ❗" : ""}
          </button>
        ))}
      </div>
      <div className="text-[11px] text-stone-600">
        Today: <b className={view.today >= 0 ? "text-emerald-700" : "text-red-700"}>{view.today >= 0 ? "+" : ""}{view.today} 🪙</b> · bets {MIN_BET}–{MAX_BET} · the house stops at +{view.dailyCap} a day
      </div>
      {tab === "blackjack" && <Blackjack hand={view.blackjack} busy={busy} send={send} />}
      {tab === "dice" && <LiarsDice table={view.dice} busy={busy} send={send} offset={offset} />}
      {tab === "arm" && <ArmWrestling match={view.arm} invites={view.invites} patrons={patrons.filter((p) => p.id !== myId)} busy={busy} send={send} offset={offset} />}
      {tab === "leaders" && (
        <div className="rounded bg-amber-50/90 p-2 text-sm">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-800">Biggest winners this week</div>
          {view.leaders.length === 0 ? <div className="text-stone-500">Nobody&apos;s come out ahead yet.</div> : (
            <ol className="space-y-0.5">{view.leaders.map((l, i) => <li key={l.name} className="flex"><span className="w-6">{i + 1}.</span><b className="flex-1">{l.name}</b><span className="text-emerald-700">+{l.net} 🪙</span></li>)}</ol>
          )}
        </div>
      )}
    </div>
  );
}

function CardFace({ c }: { c: Card | null }) {
  if (!c) return <div className="flex h-12 w-9 items-center justify-center rounded border-2 border-amber-900/60 bg-[repeating-linear-gradient(45deg,#7a2a1e,#7a2a1e_4px,#9b3a2a_4px,#9b3a2a_8px)]" />;
  const red = c.suit === 1 || c.suit === 2;
  return (
    <div className={`flex h-12 w-9 flex-col items-center justify-center rounded border-2 border-stone-400 bg-white leading-none ${red ? "text-red-600" : "text-stone-900"}`}>
      <span className="text-sm font-bold">{RANKS[c.rank]}</span><span className="text-base">{SUITS[c.suit]}</span>
    </div>
  );
}

function BetPicker({ value, set }: { value: number; set: (n: number) => void }) {
  return <div className="flex gap-1">{BETS.map((b) => <button key={b} onClick={() => set(b)} className={`rounded px-2 py-0.5 text-xs font-bold ${value === b ? "bg-amber-600 text-white" : "bg-stone-200 hover:bg-stone-300"}`}>{b} 🪙</button>)}</div>;
}

function Blackjack({ hand, busy, send }: { hand: BlackjackView | null; busy: boolean; send: Send }) {
  const [bet, setBet] = useState(10);
  const playing = hand?.status === "playing";
  const verdict: Record<string, string> = { blackjack: "Blackjack! 🎉", won: "You win!", push: "Push", lost: "The house wins", bust: "Bust!" };
  return (
    <div className="rounded bg-emerald-900/85 p-2 text-amber-50">
      {hand && (
        <div className="space-y-2">
          <div>
            <div className="text-[11px] opacity-80">The innkeeper {hand.dealerTotal != null ? `· ${hand.dealerTotal}` : ""}</div>
            <div className="flex gap-1">{hand.dealer.map((c, i) => <CardFace key={i} c={c} />)}</div>
          </div>
          <div>
            <div className="text-[11px] opacity-80">You · {hand.playerTotal} · bet {hand.bet} 🪙</div>
            <div className="flex gap-1">{hand.player.map((c, i) => <CardFace key={i} c={c} />)}</div>
          </div>
          {!playing && <div className="font-bold">{verdict[hand.status]} {hand.net != null && <span className={hand.net > 0 ? "text-emerald-300" : hand.net < 0 ? "text-red-300" : ""}>{hand.net > 0 ? "+" : ""}{hand.net} 🪙</span>}</div>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {playing ? (
          <>
            <button disabled={busy} onClick={() => void send("blackjack", "hit")} className="pixel-btn bg-amber-300 px-3 py-1 text-sm font-bold text-stone-900">Hit</button>
            <button disabled={busy} onClick={() => void send("blackjack", "stand")} className="pixel-btn bg-amber-100 px-3 py-1 text-sm font-bold text-stone-900">Stand</button>
            {hand.canDouble && <button disabled={busy} onClick={() => void send("blackjack", "double")} className="pixel-btn bg-amber-200 px-3 py-1 text-sm text-stone-900">Double</button>}
          </>
        ) : (
          <>
            <BetPicker value={bet} set={setBet} />
            <button disabled={busy} onClick={() => void send("blackjack", "deal", { bet })} className="pixel-btn bg-amber-300 px-3 py-1 text-sm font-bold text-stone-900">Deal</button>
          </>
        )}
      </div>
      <div className="mt-1 text-[10px] opacity-70">Dealer stands on 17 · blackjack pays 3:2 · double on your first two cards</div>
    </div>
  );
}

/** A countdown to a server-clock moment, ticking each second. */
function useSecondsLeft(at: number, offset: React.RefObject<number>): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((at - (Date.now() + offset.current)) / 1000)));
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 500);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [at, offset]);
  return left;
}

function LiarsDice({ table, busy, send, offset }: { table: DiceTableView; busy: boolean; send: Send; offset: React.RefObject<number> }) {
  const seated = table.seats.some((s) => s.you);
  const me = table.seats.find((s) => s.you);
  const myTurn = table.phase === "playing" && me != null && table.turnId === me.id;
  const minQty = table.bid ? table.bid.qty : 1;
  const [qty, setQty] = useState(1);
  const [face, setFace] = useState(2);
  const [ante, setAnte] = useState(10);
  const secs = useSecondsLeft(table.deadline, offset);
  const q = Math.max(qty, minQty);
  return (
    <div className="space-y-2">
      <div className="rounded bg-amber-50/90 p-2 text-sm">
        <div className="mb-1 flex items-center text-xs font-bold uppercase tracking-wide text-amber-800">
          <span className="flex-1">The table {table.phase === "playing" ? `· pot ${table.pot} 🪙` : table.ante ? `· ante ${table.ante} 🪙` : ""}</span>
          {table.phase === "playing" && <span className="normal-case text-stone-600">{table.totalDice} dice in play</span>}
        </div>
        {table.seats.length === 0 ? <div className="text-stone-500">Nobody&apos;s at the table. Sit down and set the ante.</div> : (
          <div className="flex flex-wrap gap-1">
            {table.seats.map((s) => (
              <span key={s.id} className={`rounded px-2 py-0.5 text-xs ${table.turnId === s.id ? "bg-amber-500 font-bold text-white" : s.out ? "bg-stone-200 text-stone-400 line-through" : "bg-amber-200/70"}`}>
                {s.you ? "You" : s.name}{table.phase === "playing" ? ` · ${"🎲".repeat(s.count)}` : ""}{table.turnId === s.id ? ` · ${secs}s` : ""}
              </span>
            ))}
          </div>
        )}
        {table.bid && <div className="mt-1">Bid: <b>at least {table.bid.qty} × {PIPS[table.bid.face]}</b> <span className="text-stone-500">({table.seats.find((s) => s.id === table.bid!.by)?.name})</span></div>}
      </div>

      {table.phase === "playing" && seated && !me?.out && (
        <div className="rounded bg-emerald-900/85 p-2 text-amber-50">
          <div className="text-[11px] opacity-80">Your dice (only you can see them)</div>
          <div className="text-3xl leading-none tracking-wider">{table.yourDice.map((d, i) => <span key={i}>{PIPS[d]}</span>)}</div>
          {myTurn ? (
            <div className="mt-2 space-y-1">
              <div className="flex flex-wrap items-center gap-1 text-sm">
                <span>At least</span>
                <button onClick={() => setQty(Math.max(minQty, q - 1))} className="rounded bg-amber-200 px-1.5 text-stone-900">−</button>
                <b className="w-5 text-center">{q}</b>
                <button onClick={() => setQty(Math.min(table.totalDice, q + 1))} className="rounded bg-amber-200 px-1.5 text-stone-900">+</button>
                <span>×</span>
                {[1, 2, 3, 4, 5, 6].map((f) => <button key={f} onClick={() => setFace(f)} className={`rounded px-1 text-xl leading-none ${face === f ? "bg-amber-400 text-stone-900" : "bg-emerald-800"}`}>{PIPS[f]}</button>)}
              </div>
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => void send("dice", "bid", { qty: q, face })} className="pixel-btn bg-amber-300 px-3 py-1 text-sm font-bold text-stone-900">Bid</button>
                {table.bid && <button disabled={busy} onClick={() => void send("dice", "call")} className="pixel-btn bg-red-500 px-3 py-1 text-sm font-bold text-white">Liar!</button>}
              </div>
            </div>
          ) : <div className="mt-1 text-[11px] opacity-80">Waiting for {table.seats.find((s) => s.id === table.turnId)?.name ?? "…"}…</div>}
        </div>
      )}

      {table.reveal && (
        <div className="rounded bg-stone-100 p-2 text-xs">
          <div className="mb-0.5 font-bold text-stone-600">Last showdown</div>
          {table.reveal.map((r) => <div key={r.name}>{r.name}: <span className="text-base">{r.dice.map((d) => PIPS[d]).join("")}</span></div>)}
        </div>
      )}
      {table.log.length > 0 && <ul className="space-y-0.5 rounded bg-amber-50/70 p-2 text-[12px] italic text-stone-700">{table.log.map((l, i) => <li key={i}>{l}</li>)}</ul>}

      <div className="flex flex-wrap items-center gap-2">
        {!seated && table.phase === "waiting" && (
          <>
            {table.seats.length === 0 && <BetPicker value={ante} set={setAnte} />}
            <button disabled={busy} onClick={() => void send("dice", "sit", { ante })} className="pixel-btn bg-amber-300 px-3 py-1 text-sm font-bold">Sit down{table.seats.length ? ` (ante ${table.ante} 🪙)` : ""}</button>
          </>
        )}
        {!seated && table.phase === "playing" && <span className="text-xs text-stone-500">A game&apos;s under way — you can join the next one.</span>}
        {seated && table.phase === "waiting" && <button disabled={busy || table.seats.length < 2} onClick={() => void send("dice", "start")} className="pixel-btn bg-amber-300 px-3 py-1 text-sm font-bold disabled:opacity-40" title={table.seats.length < 2 ? "Wait for another player" : ""}>Roll! ({table.seats.length} at the table)</button>}
        {seated && <button disabled={busy} onClick={() => void send("dice", "leave")} className="pixel-btn bg-stone-200 px-3 py-1 text-sm">{table.phase === "playing" ? "Fold & leave" : "Stand up"}</button>}
      </div>
      <div className="text-[10px] text-stone-500">Three dice each. Raise the bid, or call the last bidder a liar — whoever&apos;s wrong loses a die. Last one with dice takes the pot. 30 seconds a turn.</div>
    </div>
  );
}

function ArmWrestling({ match, invites, patrons, busy, send, offset }: {
  match: ArmMatchView | null;
  invites: SaloonView["invites"];
  patrons: InnPatron[];
  busy: boolean;
  send: Send;
  offset: React.RefObject<number>;
}) {
  const [stake, setStake] = useState(10);
  return (
    <div className="space-y-2">
      {invites.map((i) => (
        <div key={i.id} className="flex items-center gap-2 rounded bg-amber-200 p-2 text-sm">
          <span className="flex-1">💪 <b>{i.from}</b> challenges you for {i.stake} 🪙!</span>
          <button disabled={busy} onClick={() => void send("arm", "accept", { id: i.id })} className="pixel-btn bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">Accept</button>
          <button disabled={busy} onClick={() => void send("arm", "decline", { id: i.id })} className="pixel-btn bg-stone-200 px-2 py-0.5 text-xs">No</button>
        </div>
      ))}
      {match && match.status !== "invited" ? <ArmMatch m={match} busy={busy} send={send} offset={offset} /> : (
        <div className="space-y-2 rounded bg-amber-50/90 p-2 text-sm">
          {match?.status === "invited" && <div className="text-xs text-stone-600">Waiting for {match.bName} to take your challenge…</div>}
          <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-amber-800">Stake</span><BetPicker value={stake} set={setStake} /></div>
          <div className="flex flex-wrap gap-1">
            <button disabled={busy} onClick={() => void send("arm", "innkeeper", { stake })} className="pixel-btn bg-amber-300 px-2 py-1 text-xs font-bold">Take on the innkeeper</button>
            {patrons.map((p) => <button key={p.id} disabled={busy || !!p.doing} onClick={() => void send("arm", "challenge", { stake, target: p.id })} className="pixel-btn bg-amber-100 px-2 py-1 text-xs disabled:opacity-40">Challenge {p.name}</button>)}
          </div>
          <div className="text-[10px] text-stone-500">Best of three. Pull when the needle crosses the gold mark — the closer, the stronger.</div>
        </div>
      )}
    </div>
  );
}

function ArmMatch({ m, busy, send, offset }: { m: ArmMatchView; busy: boolean; send: Send; offset: React.RefObject<number> }) {
  const needle = useRef<HTMLDivElement>(null);
  const round = m.rounds[m.round];
  const mine = m.you === "a" ? m.scores.a : m.scores.b;
  const theirs = m.you === "a" ? m.scores.b : m.scores.a;
  const pulled = mine[m.round] != null;
  const wait = useSecondsLeft(round?.startAt ?? 0, offset);
  // The needle swings on the server's clock, so both sides see the same sweep.
  useEffect(() => {
    if (!round || m.status !== "playing") return;
    let raf = 0;
    const frame = () => {
      if (needle.current) needle.current.style.left = `${needleAt(round, Date.now() + offset.current) * 100}%`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [round, m.status, offset]);
  const pull = () => { void send("arm", "pull", { t: Date.now() + offset.current }); };
  // Space pulls too; the listener reads the latest state through a ref.
  const canPull = useRef<(() => void) | null>(null);
  useEffect(() => { canPull.current = m.status === "playing" && !pulled && wait === 0 ? () => void send("arm", "pull", { t: Date.now() + offset.current }) : null; });
  useEffect(() => {
    // Capture phase, and stop it there, so the game doesn't also take Space as "interact".
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space" && canPull.current) { e.preventDefault(); e.stopImmediatePropagation(); canPull.current(); } };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);
  const me = m.you === "a" ? m.aName : m.bName, them = m.you === "a" ? m.bName : m.aName;
  const result = m.status === "done" ? (m.winner == null ? "A draw — stakes back." : (m.you === "a" ? m.a : m.b) === m.winner ? `You win ${m.stake * 2} 🪙! 💪` : `${them} wins.`) : null;
  return (
    <div className="rounded bg-stone-800 p-2 text-amber-50">
      <div className="flex text-sm"><b className="flex-1">{me}</b><span className="opacity-70">vs</span><b className="flex-1 text-right">{them}</b></div>
      <div className="mt-1 grid grid-cols-3 gap-1 text-center text-xs">
        {m.rounds.map((_, i) => (
          <div key={i} className={`rounded p-1 ${i === m.round && m.status === "playing" ? "bg-amber-700" : "bg-stone-700"}`}>
            R{i + 1}: <b>{mine[i] ?? "–"}</b> · {theirs[i] != null && (mine[i] != null || m.status === "done") ? theirs[i] : "?"}
          </div>
        ))}
      </div>
      {m.status === "playing" && round && (
        <>
          <div className="relative mt-3 h-6 rounded bg-gradient-to-r from-red-900 via-stone-600 to-red-900">
            <div className="absolute top-0 h-full w-[6%] -translate-x-1/2 rounded bg-amber-400/90" style={{ left: `${round.zone * 100}%` }} />
            <div ref={needle} className="absolute -top-1 h-8 w-1 -translate-x-1/2 bg-white shadow" />
          </div>
          <button disabled={busy || pulled || wait > 0} onClick={pull} className="pixel-btn mt-2 w-full bg-amber-400 py-1.5 text-base font-bold text-stone-900 disabled:opacity-50">
            {pulled ? "Holding… waiting for them" : wait > 0 ? `Ready… ${wait}` : "PULL! (Space)"}
          </button>
        </>
      )}
      {result && <div className="mt-2 text-center font-bold">{result}</div>}
      <div className="mt-1 text-center text-[10px] opacity-70">Stake {m.stake} 🪙 each · best of three</div>
    </div>
  );
}
