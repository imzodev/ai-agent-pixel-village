"use client";
// Voice chat controls (src/game/voice/voiceClient.ts): the 🎙 button and its
// settings, the first-time notice, push-to-talk on touch, per-player mute and
// volume, and the friends' voice party.

import { useEffect, useState } from "react";
import { voiceClient } from "@/game/voice/voiceClient";
import type { VoiceView } from "@/types/voice";

export function useVoice(): VoiceView {
  const [v, setV] = useState<VoiceView>(() => voiceClient.view());
  useEffect(() => voiceClient.subscribe(setV), []);
  return v;
}

const STATUS_TITLE: Record<VoiceView["status"], string> = {
  off: "Voice chat: off",
  starting: "Voice chat: connecting…",
  on: "Voice chat: on",
  denied: "Voice chat: the browser blocked the microphone",
  unavailable: "Voice chat isn't available",
  quota: "Voice chat is resting until next month",
  banned: "You can't use voice chat",
  full: "Voice chat is full right now",
};

/** The top-bar button: turns voice on (after the notice, the first time) and opens its settings. */
export function VoiceButton({ touch }: { touch: boolean }) {
  const v = useVoice();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(false);
  const on = v.status === "on" || v.status === "starting";
  const icon = !on ? "🎙️" : v.selfMuted ? "🔇" : v.speaking ? "🗣️" : "🎙️";
  const start = () => {
    if (!v.settings.noticeSeen) { setNotice(true); return; }
    void voiceClient.enable();
  };
  return (
    <div className="relative shrink-0">
      <div className="flex">
        <button
          onClick={() => (on ? setOpen((o) => !o) : start())}
          title={STATUS_TITLE[v.status]}
          className={`pixel-btn px-2 py-1 ${on ? (v.selfMuted ? "bg-stone-500 text-white" : "bg-emerald-600 text-white") : "bg-[#2c3a5a]/85 text-[#f4f0e4] hover:bg-[#3a4c74]"}`}
        >
          {icon}{on && v.peers.length > 0 && <span className="ml-0.5 text-[10px]">{v.peers.length}</span>}
          {v.status === "starting" && <span className="ml-0.5 text-[10px]">…</span>}
        </button>
      </div>
      {open && on && <VoiceSettingsPopover v={v} onClose={() => setOpen(false)} />}
      {notice && <VoiceNotice onOk={() => { voiceClient.noticeSeen(); setNotice(false); void voiceClient.enable(); }} onClose={() => setNotice(false)} />}
      {touch && on && v.settings.mode === "ptt" && <PushToTalk talking={v.talking} />}
    </div>
  );
}

function VoiceSettingsPopover({ v, onClose }: { v: VoiceView; onClose: () => void }) {
  const [mics, setMics] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => { void voiceClient.devices().then(setMics); }, []);
  return (
    <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border-2 border-amber-900/60 bg-[#f7eed4] p-3 text-[12px] text-stone-800 shadow-lg">
      <div className="mb-2 flex items-center">
        <div className="flex-1 text-sm font-bold text-amber-900">🎙️ Voice chat</div>
        <button onClick={onClose} className="px-1 text-stone-500" aria-label="Close">✕</button>
      </div>
      <div className="mb-2 text-[11px] text-stone-600">
        {v.peers.length === 0 ? "Nobody in earshot. Walk up to someone with voice on." : `Talking with ${v.peers.length} nearby${v.party ? " and your party" : ""}.`}
      </div>
      <div className="mb-2 flex gap-1">
        <button onClick={() => voiceClient.setMode("open")} className={`flex-1 rounded px-2 py-1 ${v.settings.mode === "open" ? "bg-emerald-600 text-white" : "bg-white"}`}>Open mic</button>
        <button onClick={() => voiceClient.setMode("ptt")} className={`flex-1 rounded px-2 py-1 ${v.settings.mode === "ptt" ? "bg-emerald-600 text-white" : "bg-white"}`}>Push to talk (T)</button>
      </div>
      <label className="mb-2 block">
        <span className="text-[11px] text-stone-600">Microphone</span>
        <select value={v.settings.deviceId ?? ""} onChange={(e) => void voiceClient.setDevice(e.target.value || null)} className="mt-0.5 w-full rounded border border-stone-300 bg-white px-1 py-0.5">
          <option value="">Default</option>
          {mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      <label className="mb-2 block">
        <span className="text-[11px] text-stone-600">Volume</span>
        <input type="range" min={0} max={1} step={0.05} value={v.settings.volume} onChange={(e) => voiceClient.setVolume(Number(e.target.value))} className="w-full" />
      </label>
      <div className="flex gap-1">
        <button onClick={() => voiceClient.toggleSelfMute()} className="flex-1 rounded bg-white px-2 py-1">{v.selfMuted ? "🎙️ Unmute me" : "🔇 Mute me"}</button>
        <button onClick={() => { voiceClient.disable(); onClose(); }} className="flex-1 rounded bg-stone-300 px-2 py-1">Turn off</button>
      </div>
      <div className="mt-2 text-[10px] text-stone-500">Tap a player to mute them or turn them down. Voice goes through a relay, so nobody sees your address, and it isn&apos;t recorded.</div>
    </div>
  );
}

function VoiceNotice({ onOk, onClose }: { onOk: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border-4 border-amber-900/60 bg-[#f7eed4] p-4 text-stone-800" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold text-amber-900">🎙️ Voice chat</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px]">
          <li>You&apos;ll hear players near you (louder the closer they are), and friends in your voice party anywhere.</li>
          <li>Your mic is open while voice is on. Switch to push-to-talk (T) in its settings, or mute yourself any time.</li>
          <li>Voice goes through a relay: other players never see your internet address. Nothing is recorded.</li>
          <li>Be kind. Tap anyone to mute, block or report them.</li>
        </ul>
        <div className="mt-3 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded bg-stone-300 px-3 py-1.5 font-bold">Not now</button>
          <button onClick={onOk} className="flex-1 rounded bg-emerald-600 px-3 py-1.5 font-bold text-white">Turn on voice</button>
        </div>
      </div>
    </div>
  );
}

/** Touch screens: hold to talk. */
function PushToTalk({ talking }: { talking: boolean }) {
  const hold = (on: boolean) => (e: React.PointerEvent) => { e.preventDefault(); voiceClient.setPushToTalk(on); };
  return (
    <button
      onPointerDown={hold(true)} onPointerUp={hold(false)} onPointerLeave={hold(false)} onPointerCancel={hold(false)}
      className={`pixel-btn fixed bottom-[230px] right-3 z-40 select-none px-3 py-3 text-lg ${talking ? "bg-emerald-500 text-white" : "bg-[#2c3a5a]/85 text-white"}`}
      style={{ touchAction: "none" }}
    >
      🎙️ {talking ? "Talking" : "Hold"}
    </button>
  );
}

/** On a player's card: mute them, or set how loud they are. */
export function VoicePeerControls({ id }: { id: number }) {
  const v = useVoice();
  if (v.status !== "on") return null;
  const muted = v.settings.muted.includes(id);
  const vol = v.settings.peerVolume[id] ?? 1;
  const inVoice = v.peers.some((p) => p.id === id);
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <button onClick={() => voiceClient.setMuted(id, !muted)} className="pixel-btn bg-[#efe4c4] px-2 py-1 font-bold text-stone-800 hover:bg-[#f7eed4]">{muted ? "🔊 Unmute voice" : "🔇 Mute voice"}</button>
      {inVoice && !muted && <input type="range" min={0} max={2} step={0.1} value={vol} onChange={(e) => voiceClient.setPeerVolume(id, Number(e.target.value))} title="Their volume" className="w-24" />}
    </div>
  );
}

/** In the Friends panel: your voice party, invites waiting, and how to start one. */
export function VoicePartySection({ friendsOnline }: { friendsOnline: { characterId: number; name: string }[] }) {
  const v = useVoice();
  const on = v.status === "on";
  const speaking = new Set(v.peers.filter((p) => p.speaking).map((p) => p.id));
  const inParty = new Set(v.party?.members.map((m) => m.id) ?? []);
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-bold text-amber-900">🎙️ Voice party</div>
      {v.invites.map((i) => (
        <div key={i.partyId} className="flex items-center gap-2 rounded-lg border-2 border-emerald-400 bg-white/80 p-2">
          <div className="flex-1 text-[13px]"><b>{i.from.name}</b> invites you to their voice party</div>
          <button onClick={() => void voiceClient.join(i.partyId)} className="rounded bg-emerald-500 px-2 py-1 text-[12px] text-white">join</button>
          <button onClick={() => voiceClient.decline(i.partyId)} className="rounded bg-stone-300 px-2 py-1 text-[12px]">no</button>
        </div>
      ))}
      {v.party ? (
        <div className="rounded-lg border-2 border-stone-300 bg-white/80 p-2">
          <div className="flex flex-wrap gap-1.5">
            {v.party.members.map((m) => (
              <span key={m.id} className={`rounded px-1.5 py-0.5 text-[12px] ${speaking.has(m.id) ? "bg-emerald-200 font-bold" : "bg-stone-100"}`}>{speaking.has(m.id) ? "🗣️ " : ""}{m.name}</span>
            ))}
          </div>
          <button onClick={() => voiceClient.leaveParty()} className="mt-1.5 rounded bg-stone-200 px-2 py-1 text-[12px]">leave party</button>
        </div>
      ) : (
        <div className="text-[12px] text-stone-500">{on ? "Invite friends who are online: you'll hear each other anywhere on the map (up to 6)." : "Turn on 🎙️ voice to start a party with friends."}</div>
      )}
      {on && friendsOnline.filter((f) => !inParty.has(f.characterId)).map((f) => (
        <div key={f.characterId} className="flex items-center gap-2 text-[12px]">
          <span className="flex-1">{f.name}</span>
          <button onClick={() => voiceClient.invite(f.characterId)} className="rounded bg-emerald-500 px-2 py-0.5 text-white">🎙️ invite</button>
        </div>
      ))}
    </div>
  );
}
