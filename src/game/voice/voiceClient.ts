// Voice chat in the browser: the mic, one WebRTC connection per player the
// server paired us with, and spatial audio (louder the closer they stand,
// panned left / right; party members always clear).
//
// Every connection is relay-only (`iceTransportPolicy: "relay"`) through
// Cloudflare's TURN, so the other player only ever learns the relay's
// address, never ours, whatever their own browser does. We only connect to
// players the server names in `voicePeers`, and only take set-up messages
// from them. Audio is encrypted end to end (DTLS-SRTP); the relay can't hear it.
//
// One instance for the page (`voiceClient`): the scene lends it the world
// stream and live positions, the HUD drives it and listens to `subscribe`.

import { bus } from "@/game/bus";
import { inputRouter } from "@/game/input/router";
import { VOICE_MAX_BITRATE, gainAt, panAt } from "@/lib/voice";
import type {
  IceServer, VoiceCandidate, VoiceMode, VoicePartyView, VoicePeer, VoicePeerConn, VoicePositions, VoiceSdp, VoiceServerMessage, VoiceSettings, VoiceStatus,
  VoiceTransport, VoiceView,
} from "@/types/voice";

const SETTINGS_KEY = "grove_voice";
const LOOP_MS = 100;
/** Speech louder than this (RMS) lights the speaking mark; it stays lit HOLD_MS after. */
const SPEAK_RMS = 0.025;
const HOLD_MS = 350;

const DEFAULTS: VoiceSettings = { mode: "open", volume: 1, deviceId: null, muted: [], peerVolume: {}, noticeSeen: false };

function loadSettings(): VoiceSettings {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SETTINGS_KEY) : null;
    if (!raw) return { ...DEFAULTS };
    const v = JSON.parse(raw) as Partial<VoiceSettings>;
    return {
      mode: v.mode === "ptt" ? "ptt" : "open",
      volume: typeof v.volume === "number" ? Math.max(0, Math.min(1, v.volume)) : 1,
      deviceId: typeof v.deviceId === "string" ? v.deviceId : null,
      muted: Array.isArray(v.muted) ? v.muted.filter((n) => Number.isInteger(n)) : [],
      peerVolume: v.peerVolume && typeof v.peerVolume === "object" ? v.peerVolume : {},
      noticeSeen: v.noticeSeen === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Ask the far side to send DTX (near-silent packets when quiet) and keep to our bitrate. Only the copy we send is changed. */
function tuneOpus(sdp: string): string {
  return sdp.replace(/a=fmtp:(\d+) (.*)/g, (line, pt: string, params: string) => {
    if (!new RegExp(`a=rtpmap:${pt} opus/`, "i").test(sdp)) return line;
    const kept = params.split(";").filter((p) => !/^(usedtx|maxaveragebitrate|stereo)=/.test(p.trim()));
    return `a=fmtp:${pt} ${[...kept, "usedtx=1", "stereo=0", `maxaveragebitrate=${VOICE_MAX_BITRATE}`].join(";")}`;
  });
}

const rms = (a: AnalyserNode, buf: Float32Array<ArrayBuffer>): number => {
  a.getFloatTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
};

export class VoiceClient {
  private transport: VoiceTransport | null = null;
  private positions: VoicePositions | null = null;
  private status: VoiceStatus = "off";
  /** The player wants voice on (re-asked after a reconnect). */
  private wanted = false;
  private ice: { servers: IceServer[]; relayOnly: boolean } | null = null;
  private mic: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private meAnalyser: AnalyserNode | null = null;
  private peers = new Map<number, VoicePeerConn>();
  private party: VoicePartyView | null = null;
  private invites: { partyId: number; from: { id: number; name: string } }[] = [];
  private pendingJoin: number | null = null;
  private settings: VoiceSettings = loadSettings();
  private selfMuted = false;
  private pttUi = false;
  private talking = false;
  private meSpeaking = false;
  private meLoudAt = 0;
  private loop: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(v: VoiceView) => void>();
  private buf = new Float32Array(512);

  // ── Wiring ────────────────────────────────────────────────────────────────

  /** The scene's world stream and live positions. */
  attach(transport: VoiceTransport, positions: VoicePositions): void {
    this.transport = transport;
    this.positions = positions;
    if (this.wanted) this.transport.send({ type: "voice", on: true });
  }

  detach(): void {
    this.closeAll();
    this.transport = null;
    this.positions = null;
  }

  /** The stream (re)connected: ask again if voice should be on. */
  onOpen(): void {
    if (this.wanted && this.transport) { this.setStatus("starting"); this.transport.send({ type: "voice", on: true }); }
  }

  /** The stream dropped: the server forgets our pairs, so do we. */
  onClose(): void {
    this.closeAll();
    if (this.wanted) this.setStatus("starting");
  }

  subscribe(fn: (v: VoiceView) => void): () => void {
    this.listeners.add(fn);
    fn(this.view());
    return () => { this.listeners.delete(fn); };
  }

  view(): VoiceView {
    return {
      status: this.status,
      selfMuted: this.selfMuted,
      talking: this.talking,
      speaking: this.meSpeaking,
      peers: [...this.peers.values()].map((p) => ({ id: p.id, party: p.party, speaking: p.speaking, connected: p.connected })),
      party: this.party,
      invites: this.invites,
      settings: this.settings,
    };
  }

  private notify(): void {
    const v = this.view();
    for (const fn of this.listeners) fn(v);
  }

  private setStatus(s: VoiceStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.notify();
  }

  private save(): void {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* private window */ }
    this.notify();
  }

  // ── Turning it on and off ────────────────────────────────────────────────

  /** Call from a click (the browser wants a gesture for the mic and for audio). */
  async enable(): Promise<void> {
    if (this.wanted && this.status !== "denied") return;
    if (typeof RTCPeerConnection === "undefined" || !navigator.mediaDevices?.getUserMedia) { this.setStatus("unavailable"); return; }
    this.setStatus("starting");
    try {
      this.mic = await this.openMic(this.settings.deviceId);
    } catch {
      this.setStatus("denied");
      return;
    }
    this.startAudio();
    this.wanted = true;
    this.applyTalk();
    this.transport?.send({ type: "voice", on: true });
    if (!this.loop) this.loop = setInterval(() => this.tick(), LOOP_MS);
  }

  disable(): void {
    this.wanted = false;
    this.pendingJoin = null;
    this.transport?.send({ type: "voice", on: false });
    this.closeAll();
    this.stopMic();
    this.party = null;
    if (this.loop) { clearInterval(this.loop); this.loop = null; }
    void this.ctx?.suspend().catch(() => {});
    this.setStatus("off");
  }

  private async openMic(deviceId: string | null): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
      video: false,
    });
  }

  private stopMic(): void {
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.mic = null;
    this.meAnalyser = null;
  }

  private startAudio(): void {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
      }
      void this.ctx.resume().catch(() => {});
      if (this.master) this.master.gain.value = this.settings.volume;
      if (this.mic) {
        this.meAnalyser = this.ctx.createAnalyser();
        this.meAnalyser.fftSize = 512;
        this.ctx.createMediaStreamSource(this.mic).connect(this.meAnalyser); // measured only, never played back
      }
    } catch {
      this.ctx = null; // no Web Audio: peers play through their <audio> element instead
      this.master = null;
    }
  }

  private get track(): MediaStreamTrack | null {
    return this.mic?.getAudioTracks()[0] ?? null;
  }

  /** Whether our mic goes out right now: not muted, and open mic or push-to-talk held. */
  private applyTalk(): void {
    const ptt = this.settings.mode === "ptt";
    const held = this.pttUi || inputRouter.isHeld("voice.talk");
    const talking = !this.selfMuted && (!ptt || held);
    const t = this.track;
    if (t) t.enabled = talking;
    if (talking !== this.talking) { this.talking = talking; this.notify(); }
  }

  // ── Server messages ─────────────────────────────────────────────────────

  handle(msg: VoiceServerMessage): void {
    switch (msg.type) {
      case "voiceIce": {
        this.ice = { servers: msg.iceServers, relayOnly: msg.relayOnly };
        for (const p of this.peers.values()) { try { p.pc.setConfiguration(this.rtcConfig()); } catch { /* next connection gets it */ } }
        if (!this.wanted) { this.transport?.send({ type: "voice", on: false }); return; }
        this.setStatus("on");
        if (this.pendingJoin != null) { this.transport?.send({ type: "voiceParty", op: "join", partyId: this.pendingJoin }); this.pendingJoin = null; }
        return;
      }
      case "voiceOff": {
        this.closeAll();
        this.stopMic();
        this.wanted = false;
        this.party = null;
        const why = { quota: "Voice chat is resting until next month.", banned: "You can't use voice chat.", unavailable: "Voice chat isn't available right now.", full: "Voice chat is full right now; try again soon." }[msg.reason];
        bus.emit("toast", { text: why, kind: "bad" });
        this.setStatus(msg.reason);
        return;
      }
      case "voicePeers": {
        for (const id of msg.drop) this.closePeer(id);
        for (const p of msg.add) this.addPeer(p);
        this.notify();
        return;
      }
      case "rtc": {
        const peer = this.peers.get(msg.from);
        if (!peer) return; // not someone the server paired us with
        peer.chain = peer.chain.then(() => this.onRtc(peer, msg.sdp, msg.cand)).catch(() => {});
        return;
      }
      case "voiceParty":
        this.party = msg.party;
        this.notify();
        return;
      case "voiceInvite":
        this.invites = [...this.invites.filter((i) => i.partyId !== msg.partyId), { partyId: msg.partyId, from: msg.from }];
        bus.emit("toast", { text: `🎙 ${msg.from.name} invites you to their voice party (Friends → Voice party).`, kind: "info" });
        this.notify();
        return;
      case "voiceNotice":
        bus.emit("toast", { text: msg.text, kind: "info" });
        return;
    }
  }

  // ── Connections ─────────────────────────────────────────────────────────

  private rtcConfig(): RTCConfiguration {
    return { iceServers: this.ice?.servers ?? [], iceTransportPolicy: this.ice?.relayOnly ? "relay" : "all", bundlePolicy: "max-bundle", rtcpMuxPolicy: "require" };
  }

  private addPeer(p: VoicePeer): void {
    const had = this.peers.get(p.id);
    if (had) { had.party = p.party; return; }
    if (!this.ice || !this.wanted) return;
    const pc = new RTCPeerConnection(this.rtcConfig());
    const peer: VoicePeerConn = {
      id: p.id, polite: p.polite, party: p.party, pc, makingOffer: false, ignoreOffer: false, pending: [], chain: Promise.resolve(),
      audio: null, gain: null, pan: null, analyser: null, speaking: false, loudAt: 0, connected: false,
    };
    this.peers.set(p.id, peer);
    const send = (m: { sdp?: VoiceSdp; cand?: VoiceCandidate | null }) => this.transport?.send({ type: "rtc", to: p.id, ...m });

    pc.onicecandidate = (e) => {
      if (!e.candidate) { send({ cand: null }); return; }
      if (this.ice?.relayOnly && e.candidate.type && e.candidate.type !== "relay") return; // never our own address
      const c = e.candidate.toJSON();
      send({ cand: { candidate: c.candidate ?? "", sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null } });
    };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        const d = pc.localDescription;
        if (d) send({ sdp: { type: d.type as "offer", sdp: tuneOpus(d.sdp) } });
      } catch { /* a newer negotiation took over */ } finally {
        peer.makingOffer = false;
      }
    };
    pc.ontrack = (e) => this.hear(peer, e.streams[0] ?? new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      peer.connected = st === "connected";
      if (st === "connected") void this.capBitrate(pc);
      if (st === "failed" && !peer.polite) pc.restartIce();
      this.notify();
    };
    // The impolite side (higher id) offers; the polite side adds its mic when the offer comes.
    if (!p.polite) pc.addTransceiver(this.track ?? "audio", { direction: "sendrecv", streams: this.mic ? [this.mic] : [] });
  }

  /** Perfect negotiation (the polite side yields on a clash). */
  private async onRtc(peer: VoicePeerConn, sdp?: VoiceSdp, cand?: VoiceCandidate | null): Promise<void> {
    const pc = peer.pc;
    if (sdp) {
      const clash = sdp.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
      peer.ignoreOffer = !peer.polite && clash;
      if (peer.ignoreOffer) return;
      await pc.setRemoteDescription(sdp);
      for (const c of peer.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      if (sdp.type === "offer") {
        const tr = pc.getTransceivers().find((t) => t.receiver.track.kind === "audio");
        if (tr && this.track && !tr.sender.track) {
          await tr.sender.replaceTrack(this.track);
          tr.direction = "sendrecv";
          if (this.mic) tr.sender.setStreams?.(this.mic);
        }
        await pc.setLocalDescription();
        const d = pc.localDescription;
        if (d) this.transport?.send({ type: "rtc", to: peer.id, sdp: { type: d.type as "answer", sdp: tuneOpus(d.sdp) } });
      }
      return;
    }
    if (cand === undefined) return;
    const init: RTCIceCandidateInit = cand ? { candidate: cand.candidate, sdpMid: cand.sdpMid, sdpMLineIndex: cand.sdpMLineIndex } : { candidate: "" };
    if (!pc.remoteDescription) { peer.pending.push(init); return; }
    try { await pc.addIceCandidate(init); } catch { if (!peer.ignoreOffer) { /* a stale candidate: harmless */ } }
  }

  private async capBitrate(pc: RTCPeerConnection): Promise<void> {
    for (const s of pc.getSenders()) {
      if (s.track?.kind !== "audio") continue;
      try {
        const params = s.getParameters();
        if (!params.encodings?.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = VOICE_MAX_BITRATE;
        await s.setParameters(params);
      } catch { /* the far side's maxaveragebitrate still holds */ }
    }
  }

  /** Their audio: through Web Audio (volume by distance, pan) or, without it, the <audio> element. */
  private hear(peer: VoicePeerConn, stream: MediaStream): void {
    if (peer.audio) return;
    const el = new Audio();
    el.autoplay = true;
    el.srcObject = stream;
    peer.audio = el;
    if (this.ctx && this.master) {
      el.muted = true; // Chrome only feeds a remote stream into Web Audio while a media element plays it
      const src = this.ctx.createMediaStreamSource(stream);
      peer.analyser = this.ctx.createAnalyser();
      peer.analyser.fftSize = 512;
      peer.gain = this.ctx.createGain();
      peer.gain.gain.value = 0;
      peer.pan = this.ctx.createStereoPanner();
      src.connect(peer.analyser);
      src.connect(peer.gain).connect(peer.pan).connect(this.master);
    }
    void el.play().catch(() => {});
  }

  private closePeer(id: number): void {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    try { p.pc.close(); } catch { /* closed */ }
    if (p.audio) { p.audio.srcObject = null; p.audio = null; }
    p.gain?.disconnect();
    p.pan?.disconnect();
    if (p.speaking) bus.emit("voiceSpeaking", { id, on: false });
  }

  private closeAll(): void {
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    if (this.meSpeaking) { this.meSpeaking = false; bus.emit("voiceSpeaking", { id: null, on: false }); }
    this.notify();
  }

  // ── Every 100 ms: who we hear how loud, who's speaking, push-to-talk ─────

  private tick(): void {
    this.applyTalk();
    const now = performance.now();
    const me = this.positions?.me() ?? null;
    let changed = false;
    for (const p of this.peers.values()) {
      const muted = this.settings.muted.includes(p.id);
      const at = this.positions?.of(p.id) ?? null;
      const near = p.party ? 1 : me && at ? gainAt(Math.hypot(at.x - me.x, at.y - me.y)) : 0;
      const vol = muted ? 0 : near * (this.settings.peerVolume[p.id] ?? 1);
      if (p.gain && this.ctx) {
        p.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.08);
        if (p.pan) p.pan.pan.setTargetAtTime(p.party || !me || !at ? 0 : panAt(at.x - me.x), this.ctx.currentTime, 0.1);
      } else if (p.audio) {
        p.audio.muted = vol === 0;
        p.audio.volume = Math.min(1, vol * this.settings.volume);
      }
      const loud = !muted && vol > 0 && !!p.analyser && rms(p.analyser, this.buf) > SPEAK_RMS;
      if (loud) p.loudAt = now;
      const speaking = loud || now - p.loudAt < HOLD_MS;
      if (speaking !== p.speaking) {
        p.speaking = speaking;
        changed = true;
        bus.emit("voiceSpeaking", { id: p.id, on: speaking });
      }
    }
    const loud = this.talking && !!this.meAnalyser && rms(this.meAnalyser, this.buf) > SPEAK_RMS;
    if (loud) this.meLoudAt = now;
    const speaking = loud || (this.talking && now - this.meLoudAt < HOLD_MS);
    if (speaking !== this.meSpeaking) {
      this.meSpeaking = speaking;
      changed = true;
      bus.emit("voiceSpeaking", { id: null, on: speaking });
    }
    if (changed) this.notify();
  }

  // ── Settings and controls (the HUD) ─────────────────────────────────────

  setMode(mode: VoiceMode): void { this.settings = { ...this.settings, mode }; this.applyTalk(); this.save(); }
  toggleSelfMute(): void { this.selfMuted = !this.selfMuted; this.applyTalk(); this.notify(); }
  /** The on-screen push-to-talk button. */
  setPushToTalk(held: boolean): void { this.pttUi = held; this.applyTalk(); }

  setVolume(v: number): void {
    this.settings = { ...this.settings, volume: Math.max(0, Math.min(1, v)) };
    if (this.master) this.master.gain.value = this.settings.volume;
    this.save();
  }

  setMuted(id: number, muted: boolean): void {
    const rest = this.settings.muted.filter((x) => x !== id);
    this.settings = { ...this.settings, muted: muted ? [...rest, id] : rest };
    this.save();
  }

  isMuted(id: number): boolean { return this.settings.muted.includes(id); }

  setPeerVolume(id: number, v: number): void {
    this.settings = { ...this.settings, peerVolume: { ...this.settings.peerVolume, [id]: Math.max(0, Math.min(2, v)) } };
    this.save();
  }

  noticeSeen(): void { this.settings = { ...this.settings, noticeSeen: true }; this.save(); }

  async devices(): Promise<{ id: string; label: string }[]> {
    try {
      return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput").map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
    } catch {
      return [];
    }
  }

  /** Another microphone: swapped into every connection without renegotiating. */
  async setDevice(deviceId: string | null): Promise<void> {
    this.settings = { ...this.settings, deviceId };
    this.save();
    if (!this.wanted) return;
    let next: MediaStream;
    try { next = await this.openMic(deviceId); } catch { bus.emit("toast", { text: "Couldn't open that microphone.", kind: "bad" }); return; }
    const old = this.mic;
    this.mic = next;
    this.startAudio();
    this.applyTalk();
    for (const p of this.peers.values()) for (const s of p.pc.getSenders()) if (s.track?.kind === "audio" || s.track === null) void s.replaceTrack(this.track).catch(() => {});
    for (const t of old?.getTracks() ?? []) t.stop();
  }

  // ── Party ──────────────────────────────────────────────────────────────

  invite(characterId: number): void { this.transport?.send({ type: "voiceParty", op: "invite", characterId }); }
  leaveParty(): void { this.transport?.send({ type: "voiceParty", op: "leave" }); }

  async join(partyId: number): Promise<void> {
    this.invites = this.invites.filter((i) => i.partyId !== partyId);
    if (this.status === "on") this.transport?.send({ type: "voiceParty", op: "join", partyId });
    else { this.pendingJoin = partyId; await this.enable(); }
    this.notify();
  }

  decline(partyId: number): void {
    this.invites = this.invites.filter((i) => i.partyId !== partyId);
    if (this.status === "on") this.transport?.send({ type: "voiceParty", op: "decline", partyId });
    this.notify();
  }
}

export const voiceClient = new VoiceClient();
