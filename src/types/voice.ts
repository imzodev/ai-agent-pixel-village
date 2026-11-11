// Voice chat (src/lib/voice.ts rules, src/lib/voiceServer.ts server,
// src/game/voice/voiceClient.ts browser). Types only, no logic.
//
// Audio is WebRTC, relayed by Cloudflare's TURN (relay-only, so no player
// ever sees another's address). The game server only decides who may talk
// to whom (pairs) and passes the small set-up messages between them.

/** One ICE server as RTCPeerConnection takes it. */
export type IceServer = { urls: string | string[]; username?: string; credential?: string };

/** A player with voice on, as the pairing sees them. */
export type VoicePlayer = { id: number; x: number; y: number };

/** Two players who may talk (a < b). `party`: friends in one voice party, heard anywhere. */
export type VoicePair = { a: number; b: number; party: boolean };

/** Someone you're connected to (or should connect to). The polite side yields on an offer clash. */
export type VoicePeer = { id: number; polite: boolean; party: boolean };

/** What changed for one player on a pairing tick. */
export type VoicePeerDiff = { add: VoicePeer[]; drop: number[] };

/** A friends' voice party (in memory; it dissolves on a restart). */
export type VoiceParty = {
  id: number;
  members: number[];
  names: Record<number, string>;
  /** Each member's user id (blocks are by user). */
  users: Record<number, number>;
  /** When the last present member left (a party nobody's in for a while is dropped). */
  emptySince: number | null;
};

/** A party invite waiting for an answer. */
export type VoiceInvite = { partyId: number; from: number; to: number; at: number };

/** A party as its members see it. */
export type VoicePartyView = { id: number; members: { id: number; name: string }[] };

/** Why the server turned voice off (or wouldn't turn it on). */
export type VoiceOffReason = "quota" | "banned" | "unavailable" | "full";

/** An SDP offer/answer and an ICE candidate, as they cross the server. */
export type VoiceSdp = { type: "offer" | "answer"; sdp: string };
export type VoiceCandidate = { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };

/** A pair that existed (for reports: proof two players were in voice together). */
export type VoicePairLog = { a: number; b: number; from: number; to: number | null };

/** The server's view of one player with voice on (or recently on). */
export type VoiceMember = {
  playerId: number;
  userId: number;
  name: string;
  on: boolean;
  banned: boolean;
  /** Users blocked by, or blocking, this player (either way: no pair). */
  blocks: Set<number>;
  /** Relay credentials handed out, and when they run out (ms). */
  ice: { servers: IceServer[]; username: string | null; expiresAt: number } | null;
  mintedAt: number;
  minting: boolean;
  /** Signaling rate limit (token bucket). */
  rtcTokens: number;
  rtcAt: number;
  /** Last party invite sent (rate limit). */
  invitedAt: number;
  /** The socket to talk to them on. */
  send: (msg: string) => void;
};

/** This month's estimated relay traffic, and what's been saved of it. */
export type VoiceUsage = { month: string; bytes: number; unsaved: number; savedAt: number; loaded: boolean; measured: number; measuredAt: number };

/** A connected player as the WS server hands them to voice. */
export type VoiceConnRef = { playerId: number; userId: number; send: (msg: string) => void; alive: () => boolean };

/** What the WS server lends voice: live positions and a way to reach anyone connected. */
export type VoiceHost = {
  positionOf: (playerId: number) => { x: number; y: number } | null;
  /** Send to a connected player; false if they aren't connected here. */
  sendTo: (playerId: number, msg: string) => boolean;
};

/** Process-wide voice state (globalThis, shared by the server and Next's copy of the module). */
export type VoiceShared = {
  members: Map<number, VoiceMember>;
  pairs: Map<string, VoicePair>;
  parties: Map<number, VoiceParty>;
  partyOf: Map<number, number>;
  invites: VoiceInvite[];
  nextParty: number;
  usage: VoiceUsage;
  log: Map<string, VoicePairLog[]>;
  lastTickAt: number;
  host: VoiceHost | null;
  timer: ReturnType<typeof setInterval> | null;
};

/** Browser side: where voice stands. */
export type VoiceStatus = "off" | "starting" | "on" | "denied" | "unavailable" | "quota" | "banned" | "full";
export type VoiceMode = "open" | "ptt";

/** Saved per browser (localStorage). */
export type VoiceSettings = {
  mode: VoiceMode;
  /** Master volume, 0…1. */
  volume: number;
  deviceId: string | null;
  /** Character ids muted, and per-player volume (0…2). */
  muted: number[];
  peerVolume: Record<string, number>;
  /** Saw the first-time notice. */
  noticeSeen: boolean;
};

/** What the HUD shows. */
export type VoiceView = {
  status: VoiceStatus;
  selfMuted: boolean;
  /** Push-to-talk held. */
  talking: boolean;
  /** Your own mic is picking up speech (and going out). */
  speaking: boolean;
  peers: { id: number; party: boolean; speaking: boolean; connected: boolean }[];
  party: VoicePartyView | null;
  invites: { partyId: number; from: { id: number; name: string } }[];
  settings: VoiceSettings;
};

/** What the scene tells the voice client, ~10 times a second: where everyone is. */
export type VoicePositions = { me: () => { x: number; y: number } | null; of: (id: number) => { x: number; y: number } | null };

/** One connection to another player, browser side. */
export type VoicePeerConn = {
  id: number;
  polite: boolean;
  party: boolean;
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  /** Candidates that came before the remote description. */
  pending: RTCIceCandidateInit[];
  /** Set-up messages handled one at a time. */
  chain: Promise<void>;
  audio: HTMLAudioElement | null;
  gain: GainNode | null;
  pan: StereoPannerNode | null;
  analyser: AnalyserNode | null;
  speaking: boolean;
  loudAt: number;
  connected: boolean;
};

/** How the voice client talks to the server (over the world stream). */
export type VoiceTransport = { send: (msg: VoiceClientMessage) => void };

/** Browser → server. */
export type VoiceClientMessage =
  | { type: "voice"; on: boolean }
  | { type: "rtc"; to: number; sdp?: VoiceSdp; cand?: VoiceCandidate | null }
  | { type: "voiceParty"; op: "invite"; characterId: number }
  | { type: "voiceParty"; op: "join"; partyId: number }
  | { type: "voiceParty"; op: "leave" }
  | { type: "voiceParty"; op: "decline"; partyId: number };

/** Server → browser. */
export type VoiceServerMessage =
  | { type: "voicePeers"; add: VoicePeer[]; drop: number[] }
  | { type: "rtc"; from: number; sdp?: VoiceSdp; cand?: VoiceCandidate | null }
  | { type: "voiceIce"; iceServers: IceServer[]; relayOnly: boolean; expiresAt: number }
  | { type: "voiceOff"; reason: VoiceOffReason }
  | { type: "voiceParty"; party: VoicePartyView | null }
  | { type: "voiceInvite"; partyId: number; from: { id: number; name: string } }
  | { type: "voiceNotice"; text: string };
