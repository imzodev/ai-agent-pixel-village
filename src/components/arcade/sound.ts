// The arcade's sounds, made on the spot with WebAudio (nothing to download or
// license). Whistle: the whistle, a blip when a sheep is penned, a thud when a
// wolf takes one, a breathless puff. Harvest Haul: a thump on landing, a crack,
// a whoop when something falls off, hooves on the road.

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
export const thumpSound = (strength: number) => tone(140 + strength * 0.3, 60, 90, "triangle", Math.min(0.12, 0.03 + strength / 3000));
export const crackSound = () => { tone(900, 300, 70, "square", 0.05); setTimeout(() => tone(500, 200, 90, "square", 0.04), 60); };
export const fallSound = () => tone(600, 160, 380, "sine", 0.06);
export const hoofSound = () => tone(320, 220, 50, "triangle", 0.035);
export const cheerSound = () => { tone(520, 780, 160, "triangle", 0.07); setTimeout(() => tone(780, 1040, 220, "triangle", 0.07), 150); };
/** Call from a tap, so the browser lets sound play afterwards. */
export const unlockSound = () => void audio();
