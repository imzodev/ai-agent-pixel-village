// The 40-second promo (`node build40.mjs` → wide40/ and tall40/). Gameplay is on screen from the
// first frame, and every part has footage:
//   0–12 s     the hook: full-frame gameplay cards, big words over them
//   12–14.5 s  the brand, over moving gameplay
//   14.5–28.5  the features: one floating, tilted card per idea, on the game's own colours
//   28.5–35 s  a tilted wall of every clip, with the last word cycling
//   35–40 s    the end card (the same as the 30-second cut)
// Gameplay comes from footage/wide (capture.mjs); the sound from sound.sh (see README).
import fs from "node:fs";

const TOTAL = 40;
// The hook: full-frame gameplay from the very first frame, big words over it.
const HOOK = [
  { text: "These villagers think for themselves.", src: "02-talk", at: 38.4, dur: 3.5, zoom: 1.35, fx: 1130, fy: 420, tfx: 1230 },
  { text: "Talk to them. They answer, and remember.", src: "04-chat", at: 5.2, dur: 3, zoom: 1.6, fx: 1020, fy: 330, tfx: 1110 },
  { text: "They work and trade with each other.", src: "03-carry", at: 3.6, dur: 3, zoom: 2.3, fx: 885, fy: 450 },
  { text: "Every one of them has a life.", src: "01-grove", at: 3.5, dur: 2.5, zoom: 1.2, fx: 960, fy: 520 },
];
const FEATURES = [
  { label: "Get hired. Earn a wage.", src: "05-jobs", at: 2.2, dur: 2.8, zoom: 1.75, fx: 960, fy: 540 },
  { label: "Prices move with the market.", src: "06-market", at: 1.0, dur: 2.8, zoom: 1.75, fx: 960, fy: 560 },
  { label: "Build your own homestead.", src: "07-homestead", at: 0.3, dur: 2.8, zoom: 2.0, fx: 300, fy: 760 },
  { label: "Explore 20 towns.", src: "08-town", at: 0.5, dur: 2.8, zoom: 1.35, fx: 960, fy: 560 },
  { label: "And the wilds between them.", src: "09-fight", at: 3.0, dur: 2.8, zoom: 1.5, fx: 1000, fy: 640 },
];
const WALL = [["01-grove", 3.5], ["02-talk", 40], ["03-carry", 4], ["04-chat", 6], ["05-jobs", 4], ["06-market", 1.5], ["07-homestead", 1], ["08-town", 1], ["09-fight", 3]];
const CYCLE = [["alive.", 29.0], ["social.", 30.4], ["yours.", 31.8], ["free.", 33.2]];
const BRAND = { start: 12, dur: 2.5 };
const FEAT_START = 14.5, WALL_START = 28.5, END_START = 35;
const OVERLAP = 0.45;
/** A phrase as one line of word spans (the line keeps them flowing side by side; each word animates on its own). */
const words = (s, cls = "w") => `<div class="ln">${s.split(" ").map((w) => `<span class="${cls}">${w}</span>`).join(" ")}</div>`;

/** Footage covering a card: scaled to cover it, centred on the focus point, zooming from there. */
function cover(f, cw, ch) {
  const c = Math.max(cw / 1920, ch / 1080), vw = Math.round(1920 * c), vh = Math.round(1080 * c);
  const left = Math.round(Math.min(0, Math.max(cw - vw, cw / 2 - f.fx * c)));
  const top = Math.round(Math.min(0, Math.max(ch - vh, ch / 2 - f.fy * c)));
  return `left:${left}px;top:${top}px;width:${vw}px;height:${vh}px;transform-origin:${Math.round(f.fx * c)}px ${Math.round(f.fy * c)}px`;
}

function composition({ id, w, h, tall }) {
  const html = [], tl = [];
  const at = (x) => +x.toFixed(2);
  /** One shot as a 3D card: swings in (except the first, already there), drifts, swings away under the next. */
  const shotCard = (name, f0, start, box, i, opts = {}) => {
    const f = tall && f0.tfx ? { ...f0, fx: f0.tfx } : f0; // tfx: the vertical cut's own focus
    const shown = at(f.dur + (opts.last ? 0.6 : OVERLAP));
    html.push(`    <div id="${name}" class="card" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;z-index:${opts.z ?? 10 + i}">
      <video id="${name}v" class="clip shot" src="footage/wide/${f.src}.mp4" data-start="${start}" data-duration="${shown}" data-media-start="${f.at}" data-track-index="${i % 2}" muted playsinline style="${cover(f, box.w, box.h)}"></video>${opts.inner ?? ""}
    </div>`);
    const dir = i % 2 ? -1 : 1, swing = tall ? 500 : 700, rest = opts.rest ?? { ry: -8 * dir, rx: 5 };
    if (opts.first) tl.push(`tl.fromTo("#${name}", { z: -260, rotationX: 10, rotationY: -10, opacity: 1 }, { z: 0, rotationX: ${rest.rx}, rotationY: ${rest.ry}, opacity: 1, duration: 0.9, ease: "power3.out" }, 0);`);
    else tl.push(`tl.fromTo("#${name}", { rotationY: ${-40 * dir}, rotationX: 12, z: -900, x: ${swing * dir}, opacity: 1 }, { rotationY: ${rest.ry}, rotationX: ${rest.rx}, z: 0, x: 0, opacity: 1, duration: 0.75, ease: "power3.out", immediateRender: false }, ${start});`);
    const settle = opts.first ? 0.9 : 0.75;
    tl.push(`tl.fromTo("#${name}", { rotationY: ${rest.ry}, rotationX: ${rest.rx}, y: 0 }, { rotationY: ${at(rest.ry / 2)}, rotationX: ${at(rest.rx / 2)}, y: -14, duration: ${at(f.dur - settle)}, ease: "sine.inOut", immediateRender: false }, ${at(start + settle)});`);
    tl.push(`tl.fromTo("#${name}v", { scale: ${f.zoom} }, { scale: ${(f.zoom * 1.07).toFixed(3)}, duration: ${shown}, ease: "none" }, ${start});`);
    if (opts.last) tl.push(`tl.to("#${name}", { z: -1200, rotationX: 40, opacity: 0, duration: 0.6, ease: "power2.in" }, ${at(start + f.dur)});`);
    else {
      tl.push(`tl.to("#${name}", { rotationY: ${45 * dir}, z: -1000, x: ${-swing * dir}, duration: ${OVERLAP}, ease: "power2.in" }, ${at(start + f.dur)});`);
      tl.push(`tl.to("#${name}", { opacity: 0, duration: 0.12 }, ${at(start + f.dur + OVERLAP - 0.12)});`);
    }
  };

  // ── The hook: gameplay from the first frame, big words over it ───────
  const big = tall ? { x: 30, y: 110, w: 1020, h: 1460 } : { x: 46, y: 40, w: 1828, h: 1000 };
  let t = 0;
  HOOK.forEach((f, i) => {
    const start = at(t);
    shotCard(`h${i}`, f, start, big, i, { first: i === 0, rest: { ry: i % 2 ? 3 : -3, rx: 2 }, inner: `<div class="shade"></div>` });
    html.push(`    <div id="ht${i}" class="clip hookText" data-start="${start}" data-duration="${f.dur}" data-track-index="6">${words(f.text)}</div>`);
    tl.push(`tl.fromTo("#ht${i} .w", { y: 90, opacity: 0, rotationX: -60 }, { y: 0, opacity: 1, rotationX: 0, duration: 0.3, stagger: 0.04, ease: "back.out(1.7)" }, ${at(start + (i === 0 ? 0.1 : 0.25))});`);
    tl.push(`tl.to("#ht${i}", { opacity: 0, y: -30, duration: 0.25, ease: "power2.in" }, ${at(start + f.dur - 0.25)});`);
    t += f.dur;
  });

  // ── The brand, over moving gameplay ──────────────────────────────────
  html.push(`    <video id="brandBg" class="clip" src="footage/wide/02-talk.mp4" data-start="${BRAND.start}" data-duration="${BRAND.dur + 0.5}" data-media-start="20" data-track-index="0" muted playsinline></video>`);
  html.push(`    <div id="brandTint"></div>`);
  tl.push(`tl.fromTo(["#brandBg", "#brandTint"], { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "power2.out", immediateRender: false }, ${BRAND.start});`);
  tl.push(`tl.fromTo("#brandBg", { scale: 1.15 }, { scale: 1.3, duration: ${BRAND.dur + 0.5}, ease: "none" }, ${BRAND.start});`);
  html.push(`    <div id="logo" class="clip" data-start="${BRAND.start}" data-duration="${BRAND.dur}" data-track-index="6"><div class="glow"></div><span class="mark">🌳 thegroove</span><div class="sub">${words("A village that thinks for itself.")}</div></div>`);
  tl.push(`tl.fromTo("#logo .mark", { scale: 0.5, opacity: 0, rotationX: -60 }, { scale: 1, opacity: 1, rotationX: 0, duration: 0.5, ease: "back.out(1.8)" }, ${BRAND.start + 0.1});`);
  tl.push(`tl.fromTo("#logo .glow", { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.0, ease: "power2.out" }, ${BRAND.start + 0.1});`);
  tl.push(`tl.fromTo("#logo .sub .w", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.04, ease: "power3.out" }, ${BRAND.start + 0.5});`);
  tl.push(`tl.to("#logo", { opacity: 0, scale: 1.08, duration: 0.3, ease: "power2.in" }, ${at(BRAND.start + BRAND.dur - 0.3)});`);
  tl.push(`tl.fromTo("#bgVivid", { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power2.inOut", immediateRender: false }, ${at(BRAND.start + BRAND.dur - 0.5)});`);
  tl.push(`tl.to(["#brandBg", "#brandTint"], { opacity: 0, duration: 0.4 }, ${at(BRAND.start + BRAND.dur - 0.2)});`);

  // ── The features: floating cards on the meadow-to-night gradient ──────
  const card = tall ? { w: 1000, h: 562, x: 40, y: 700 } : { w: 1180, h: 664, x: 680, y: 210 };
  t = FEAT_START;
  FEATURES.forEach((f, i) => {
    const start = at(t), last = i === FEATURES.length - 1;
    shotCard(`fw${i}`, f, start, card, i, { last });
    html.push(`    <div id="fl${i}" class="clip label" data-start="${start}" data-duration="${f.dur}" data-track-index="6">${words(f.label)}</div>`);
    tl.push(`tl.fromTo("#fl${i} .w", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.04, ease: "power3.out" }, ${at(start + 0.2)});`);
    tl.push(`tl.to("#fl${i}", { opacity: 0, y: -30, duration: 0.3, ease: "power2.in" }, ${at(start + f.dur - 0.3)});`);
    t += f.dur;
  });

  // ── The wall, and the last word cycling ───────────────────────────────
  const tile = tall ? { w: 480, h: 270, gap: 26 } : { w: 540, h: 304, gap: 30 };
  const wallW = tile.w * 3 + tile.gap * 2, wallH = tile.h * 3 + tile.gap * 2, wallDur = END_START - WALL_START;
  html.push(`    <div id="wall" style="left:${Math.round((w - wallW) / 2)}px;top:${Math.round((h - wallH) / 2)}px;width:${wallW}px;height:${wallH}px">`);
  WALL.forEach(([src, ms], i) => {
    const x = (i % 3) * (tile.w + tile.gap), y = Math.floor(i / 3) * (tile.h + tile.gap);
    html.push(`      <div id="tile${i}" class="tile" style="left:${x}px;top:${y}px;width:${tile.w}px;height:${tile.h}px"><video id="wv${i}" class="clip shot" src="footage/wide/${src}.mp4" data-start="${WALL_START}" data-duration="${wallDur}" data-media-start="${ms}" data-track-index="${2 + (i % 3)}" muted playsinline style="width:${tile.w}px;height:${tile.h}px"></video></div>`);
  });
  html.push(`    </div>`);
  tl.push(`tl.fromTo(".tile", { z: -700, opacity: 0, rotationY: 30 }, { z: 0, opacity: 1, rotationY: 0, duration: 0.7, stagger: 0.07, ease: "power3.out", immediateRender: false }, ${WALL_START});`);
  tl.push(`tl.fromTo("#wall", { y: 90, scale: 0.94 }, { y: -90, scale: 1.06, duration: ${wallDur}, ease: "none" }, ${WALL_START});`);
  tl.push(`tl.to(".tile", { z: -900, opacity: 0, rotationZ: 20, duration: 0.6, stagger: { each: 0.05, from: "center" }, ease: "power2.in" }, ${at(END_START - 1.0)});`);
  html.push(`    <div id="cycle" class="clip" data-start="${at(WALL_START + 0.4)}" data-duration="${at(wallDur - 0.8)}" data-track-index="8"><span class="lead">A world that's</span> <span class="slot">${CYCLE.map(([word], i) => `<span id="cw${i}" class="cw">${word}</span>`).join("")}</span></div>`);
  tl.push(`tl.fromTo("#cycle .lead", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, ${at(WALL_START + 0.45)});`);
  CYCLE.forEach(([, st], i) => {
    tl.push(`tl.fromTo("#cw${i}", { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)", immediateRender: false }, ${st});`);
    if (i < CYCLE.length - 1) tl.push(`tl.to("#cw${i}", { yPercent: -110, opacity: 0, duration: 0.35, ease: "power2.in" }, ${at(CYCLE[i + 1][1] - 0.2)});`);
  });
  tl.push(`tl.to("#cycle", { opacity: 0, scale: 1.2, duration: 0.4, ease: "power2.in" }, ${at(END_START - 0.8)});`);
  tl.push(`tl.fromTo("#flash", { opacity: 0.7 }, { opacity: 0, duration: 0.35, ease: "power2.out", immediateRender: false }, ${END_START});`);

  // ── The end card (as in the 30-second cut) ────────────────────────────
  tl.push(`tl.fromTo("#end .logo", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(2)" }, ${END_START + 0.1});`);
  tl.push(`tl.fromTo("#end .tag", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }, ${END_START + 0.4});`);
  tl.push(`tl.fromTo("#end .url", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }, ${END_START + 0.65});`);

  const S = tall ? { label: 76, cycle: 104, logo: 118 } : { label: 84, cycle: 120, logo: 170 };
  const labelBox = tall ? `left:60px;right:60px;top:300px;height:340px;justify-content:center;text-align:center` : `left:90px;top:0;bottom:0;width:560px;justify-content:center;text-align:left`;
  return `<!doctype html>
<!-- Generated by build40.mjs: edit it there, not here. -->
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Pixelify+Sans:wght@600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <style>
    body { margin: 0; }
    #root { position: relative; width: ${w}px; height: ${h}px; overflow: hidden; perspective: ${tall ? 2200 : 1800}px; font-family: "Fredoka", system-ui, sans-serif; color: #141c3c;
      background: radial-gradient(ellipse at 50% 40%, #1f2a5c 0%, #0b1026 75%); }
    /* The game's own colours: forest green, river teal, night navy (amber for accents). */
    #bgVivid { position: absolute; inset: 0; z-index: 0; opacity: 0; background: linear-gradient(130deg, #14532d 0%, #15803d 24%, #0f766e 52%, #1e3a8a 82%, #141c3c 100%); }
    #brandBg { position: absolute; inset: 0; width: ${w}px; height: ${h}px; object-fit: cover; z-index: 4; opacity: 0; filter: blur(7px) saturate(1.1); image-rendering: auto; }
    #brandTint { position: absolute; inset: 0; z-index: 5; opacity: 0; background: radial-gradient(ellipse at 50% 50%, rgba(20, 28, 60, 0.35), rgba(20, 28, 60, 0.8)); }
    .shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(10, 16, 40, 0.78) 0%, rgba(10, 16, 40, 0.25) 38%, transparent 60%); }
    .hookText { position: absolute; z-index: 25; left: ${tall ? 70 : 120}px; right: ${tall ? 70 : 120}px; bottom: ${tall ? 400 : 110}px; font-size: ${tall ? 92 : 104}px; font-weight: 700; line-height: 1.04;
      color: #ffffff; text-shadow: 0 6px 0 rgba(0, 0, 0, 0.35), 0 10px 30px rgba(0, 0, 0, 0.6); perspective: 900px; }
    .ln { display: block; }
    .w { display: inline-block; }
    #logo { position: absolute; inset: 0; z-index: 6; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; perspective: 900px; }
    #logo .mark { position: relative; font-family: "Pixelify Sans", system-ui, sans-serif; font-size: ${S.logo}px; font-weight: 700; color: #fcd34d; text-shadow: 7px 7px 0 #141c3c; }
    #logo .sub { position: relative; font-size: ${tall ? 64 : 64}px; font-weight: 700; color: #ffffff; text-shadow: 0 6px 24px rgba(0, 0, 0, 0.6); text-align: center; padding: 0 60px; }
    #logo .glow { position: absolute; width: ${tall ? 900 : 1100}px; height: ${tall ? 900 : 600}px; border-radius: 50%; background: radial-gradient(closest-side, rgba(252, 211, 77, 0.4), rgba(15, 118, 110, 0.25), transparent); }
    .label { position: absolute; z-index: 20; display: flex; flex-direction: column; ${labelBox}; font-size: ${S.label}px; font-weight: 700; line-height: 1.05; color: #ffffff;
      text-shadow: 0 6px 24px rgba(5, 20, 30, 0.55); }
    .label > span { display: inline-block; }
    .card { position: absolute; overflow: hidden; border-radius: 28px; opacity: 0; backface-visibility: hidden; background: #000;
      box-shadow: 0 60px 120px rgba(0, 10, 20, 0.6), 0 0 0 6px rgba(252, 211, 77, 0.85); }
    .shot { position: absolute; left: 0; top: 0; image-rendering: pixelated; object-fit: fill; }
    #wall { position: absolute; z-index: 15; transform-style: preserve-3d; transform: rotateX(38deg) rotateZ(-12deg); }
    .tile { position: absolute; overflow: hidden; border-radius: 22px; opacity: 0; background: #000; box-shadow: 0 30px 60px rgba(0, 10, 20, 0.5), 0 0 0 5px rgba(252, 211, 77, 0.8); }
    #cycle { position: absolute; left: 0; right: 0; top: 0; bottom: 0; z-index: 30; display: flex; ${tall ? "flex-direction: column;" : ""} align-items: center; justify-content: center; gap: ${tall ? 10 : 30}px;
      font-size: ${S.cycle}px; font-weight: 700; color: #ffffff; text-shadow: 0 8px 30px rgba(0, 10, 20, 0.8), 0 3px 0 rgba(0, 10, 20, 0.5); }
    #cycle .lead { display: inline-block; }
    #cycle .slot { position: relative; display: inline-block; width: ${tall ? 700 : 640}px; height: ${Math.round(S.cycle * 1.25)}px; overflow: hidden; text-align: ${tall ? "center" : "left"}; }
    #cycle .cw { position: absolute; left: 0; right: 0; top: 0; opacity: 0; color: #fde68a; }
    #flash { position: absolute; inset: 0; background: #fff; opacity: 0; z-index: 35; pointer-events: none; }
    #end { position: absolute; inset: 0; z-index: 40; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${tall ? 40 : 28}px;
      background: radial-gradient(circle at 50% 40%, #24306a, #141c3c 70%); color: #fff7d6; text-align: center; font-family: "Pixelify Sans", system-ui, sans-serif; }
    #end .logo { font-size: ${tall ? 120 : 130}px; font-weight: 700; color: #fcd34d; text-shadow: 6px 6px 0 #000; }
    #end .tag { font-size: ${tall ? 58 : 56}px; font-weight: 600; }
    #end .url { font-size: ${tall ? 76 : 72}px; font-weight: 700; color: #141c3c; background: #fcd34d; padding: 10px 34px; border-radius: 16px; border: 4px solid #7a4a10; }
  </style>
</head>
<body>
  <div id="root" data-composition-id="${id}" data-start="0" data-duration="${TOTAL}" data-width="${w}" data-height="${h}">
    <div id="bgVivid"></div>
${html.join("\n")}
    <div id="end" class="clip" data-start="${END_START}" data-duration="${TOTAL - END_START}" data-track-index="9">
      <div class="logo">🌳 thegroove</div>
      <div class="tag">A pixel world where the villagers think.<br />Free in your browser.</div>
      <div class="url">thegroove.fun</div>
    </div>
    <div id="flash"></div>
    <audio id="music" src="audio/promo40.wav" data-start="0" data-duration="${TOTAL}" data-volume="0.9" data-fade-out="1"></audio>
  </div>
  <script>
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });
${tl.map((x) => `  ${x}`).join("\n")}
  window.__timelines["${id}"] = tl;
  </script>
</body>
</html>
`;
}

for (const [dir, opts] of [["wide40", { id: "promo40", w: 1920, h: 1080, tall: false }], ["tall40", { id: "promo40-vertical", w: 1080, h: 1920, tall: true }]]) {
  fs.mkdirSync(dir, { recursive: true });
  for (const shared of ["footage", "audio"]) if (!fs.existsSync(`${dir}/${shared}`)) fs.symlinkSync(`../${shared}`, `${dir}/${shared}`);
  fs.writeFileSync(`${dir}/index.html`, composition(opts));
}
// The sound's cues follow the cuts.
const cues = [...HOOK.reduce((a, f) => [...a, +(a.at(-1) + f.dur).toFixed(2)], [0]).slice(1), FEAT_START, ...FEATURES.slice(0, -1).reduce((a, f) => [...a, +(a.at(-1) + f.dur).toFixed(2)], [FEAT_START]).slice(1), WALL_START, ...CYCLE.slice(1).map(([, t]) => t)];
console.log(`wide40/index.html (1920×1080) and tall40/index.html (1080×1920), ${TOTAL} s`);
console.log(`sound: DUR=${TOTAL} CUTS="${[...new Set(cues)].join(" ")}" CHIME=${END_START} BEAT_FROM=0 OUT=audio/promo40.wav bash sound.sh`);
