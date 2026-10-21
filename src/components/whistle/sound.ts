// Whistle's sounds, made on the spot with WebAudio (nothing to download or
// license): the whistle, a soft bleat-ish blip when a sheep is penned, a thud
// when a wolf takes one, and a breathless puff when there's no breath left.

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(from: number, to: number, ms: number, type: OscillatorType, volume: number): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime, end = t + ms / 1000;
  const osc = a.createOscillator(), gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, end);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(end + 0.02);
}

export const whistleSound = () => { tone(1900, 2600, 140, "sine", 0.12); setTimeout(() => tone(2600, 2100, 160, "sine", 0.1), 120); };
export const pennedSound = () => tone(520, 760, 110, "triangle", 0.07);
export const lostSound = () => tone(180, 70, 260, "square", 0.05);
export const dryWhistleSound = () => tone(700, 500, 90, "sine", 0.03);
/** Call from a tap, so the browser lets sound play afterwards. */
export const unlockSound = () => void audio();
