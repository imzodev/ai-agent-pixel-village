// The billboard promo (about 14 s): an empty board in the plaza, the same kind of
// board with a poster up, a close-up, then "the first one is free". Footage from
// capture-ad.mjs; writes wide-ad/ and tall-ad/ with the shared cut (cut.mjs):
// `npm run render-ad`. Move a cut here, move it in the "sound-ad" script too.
import { writeProjects } from "./cut.mjs";

const SHOTS = [
  { src: "01-empty", at: 1.0, dur: 3.5, zoom: 1.5, fx: 880, fy: 330, tz: 1.3, caption: "Got a game, a shop or a channel?" },
  { src: "02-poster", at: 0.5, dur: 3.5, zoom: 1.4, fx: 960, fy: 330, tz: 1.3, caption: "Put your poster in our world." },
  { src: "02-poster", at: 4.0, dur: 3, zoom: 2.6, fx: 960, fy: 320, tz: 2, caption: "Every player walking past sees it." },
];
const END = {
  dur: 4, by: "build-ad.mjs",
  logo: "🎁 The first one's free",
  tag: "One billboard in thegroove, on us.<br />Reply to claim it.",
  url: "thegroove.fun/advertise",
};

const { total, cuts } = writeProjects(
  [["wide-ad", { id: "billboard", w: 1920, h: 1080, tall: false }], ["tall-ad", { id: "billboard-vertical", w: 1080, h: 1920, tall: true }]],
  { shots: SHOTS, end: END, audio: "audio/billboard.wav", footage: "footage/ad" },
);
console.log(`wide-ad/ and tall-ad/, ${total}s; cuts at ${cuts.join(", ")}`);
