// Writes the two HyperFrames projects (wide/ and tall/) from one shot list, so
// the wide (1920×1080) and vertical (1080×1920) cuts stay in step: `node build.mjs`.
// The cut itself (cards, captions, end card) is cut.mjs.
import { writeProjects } from "./cut.mjs";

const SHOTS = [
  { src: "01-grove", at: 3.5, dur: 3, zoom: 1.15, fx: 960, fy: 540, caption: "These villagers think for themselves.", big: true },
  { src: "02-talk", at: 38.6, dur: 5, zoom: 1.6, fx: 1130, fy: 400, tz: 1, tfx: 1170, caption: "They talk. They gossip. About you." },
  { src: "03-carry", at: 3.6, dur: 4, zoom: 2.6, fx: 885, fy: 450, caption: "They run real shops and supply each other." },
  { src: "04-chat", at: 5.5, dur: 3, zoom: 1.7, fx: 1020, fy: 320, tz: 1, tfx: 1060, caption: "They answer you, and remember you." },
  { src: "05-jobs", at: 2.8, dur: 3, zoom: 2.0, fx: 960, fy: 540, tz: 1, caption: "Get hired. Earn a wage. Get promoted." },
  { src: "06-market", at: 1.2, dur: 3, zoom: 2.0, fx: 960, fy: 560, tz: 1, caption: "A real economy: flood a town, prices drop." },
  { src: "07-homestead", at: 0.3, dur: 3, zoom: 2.2, fx: 300, fy: 760, caption: "Build a homestead." },
  { src: "08-town", at: 1.0, dur: 1.5, zoom: 1.35, fx: 960, fy: 560, caption: "Explore 20 towns." },
  { src: "09-fight", at: 4.0, dur: 1.5, zoom: 1.7, fx: 1000, fy: 620, caption: "Fight what lives in the wilds." },
];
const END = { dur: 3, by: "build.mjs", logo: "🌳 thegroove", tag: "A pixel world where the villagers think.<br />Free in your browser.", url: "thegroove.fun" };

const { total, cuts } = writeProjects(
  [["wide", { id: "promo", w: 1920, h: 1080, tall: false }], ["tall", { id: "promo-vertical", w: 1080, h: 1920, tall: true }]],
  { shots: SHOTS, end: END, audio: "audio/promo.wav", footage: "footage/wide" },
);
console.log(`wide/index.html (1920×1080) and tall/index.html (1080×1920), ${total}s; cuts at ${cuts.join(", ")}`);
