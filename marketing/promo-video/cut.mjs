// The 3D card cut both promos share (build.mjs, build-ad.mjs): each shot a
// frame-sized card flying in through depth while its footage zooms, captions on
// flipping plaques, a perspective floor, the end card. `writeProjects` writes one
// HyperFrames project per shape (wide 1920×1080, tall 1080×1920) from a shot list.
// Each shot: footage clip, in-point (media start), length, zoom and the point (in
// the 1920×1080 footage) the zoom and the vertical crop centre on (tz/tfx override
// them for the vertical cut).
import fs from "node:fs";

/** Each shot overlaps the next by this much: it swings away in 3D while the next one flies in. */
export const OVERLAP = 0.45;

export function composition({ id, w, h, tall, shots: SHOTS, end: END, audio, footage }) {
  let t = 0;
  const clips = [], captions = [], anims = [];
  SHOTS.forEach((s, i) => {
    const start = +t.toFixed(2);
    const last = i === SHOTS.length - 1;
    // Wide: the footage fills the frame. Tall: height-filled (×16/9) and slid so the focus point is centred.
    const k = tall ? h / 1080 : 1;
    const vw = 1920 * k, vh = 1080 * k;
    // tz / tfx: the vertical cut's own zoom and focus, where the wide one would crop a panel or a bubble.
    const fx = tall ? s.tfx ?? s.fx : s.fx;
    const left = tall ? Math.round(Math.min(0, Math.max(w - vw, w / 2 - fx * k))) : 0;
    const zoom = tall ? s.tz ?? Math.max(1, s.zoom * 0.7) : s.zoom;
    const shown = +(s.dur + (last ? 0 : OVERLAP)).toFixed(2);
    // A frame-sized card (what moves in 3D; hidden by CSS until its entrance) holding the footage (what zooms, inside it).
    clips.push(`    <div id="w${i}" class="card" style="z-index:${i + 1}">
      <video id="v${i}" class="clip shot" src="${footage}/${s.src}.mp4" data-start="${start}" data-duration="${shown}" data-media-start="${s.at}" data-track-index="${i % 2}" muted playsinline
        style="left:${left}px;top:0;width:${vw}px;height:${vh}px;transform-origin:${fx * k}px ${s.fy * k}px"></video>
    </div>`);
    captions.push(`    <div id="c${i}" class="clip caption${s.big ? " big" : ""}" data-start="${start}" data-duration="${s.dur}" data-track-index="3"><span>${s.caption}</span></div>`);
    // 3D: each shot flies in as a tilted card from deep in the scene (alternating sides), turns
    // slowly while it plays, then swings away the other way as the next one arrives.
    const dir = i % 2 ? -1 : 1;
    const z = (n) => n.toFixed(3);
    const settle = i === 0 ? 1.0 : OVERLAP + 0.35;
    if (i === 0) anims.push(`  tl.fromTo("#w0", { rotationX: 32, rotationY: -12, z: -900, opacity: 0 }, { rotationX: 0, rotationY: 0, z: 0, opacity: 1, duration: ${settle}, ease: "power3.out" }, 0);`);
    // Solid cards, no cross-fade: the new one swings in from the side, on top of the old one leaving.
    else anims.push(`  tl.fromTo("#w${i}", { rotationY: ${-50 * dir}, rotationX: 8, z: -700, x: ${Math.round(w * 0.75 * dir)}, opacity: 1 }, { rotationY: 0, rotationX: 0, z: 0, x: 0, opacity: 1, duration: ${settle}, ease: "power3.out", immediateRender: false }, ${start});`);
    // While it plays: a gentle turn in depth, and the footage pushing in.
    anims.push(`  tl.fromTo("#w${i}", { rotationY: 0, rotationX: 0 }, { rotationY: ${4 * dir}, rotationX: -2, duration: ${(s.dur - settle).toFixed(2)}, ease: "sine.inOut", immediateRender: false }, ${(start + settle).toFixed(2)});`);
    anims.push(`  tl.fromTo("#v${i}", { scale: ${z(zoom)} }, { scale: ${z(zoom * 1.07)}, duration: ${shown}, ease: "none" }, ${start});`);
    if (!last) {
      anims.push(`  tl.to("#w${i}", { rotationY: ${55 * dir}, rotationX: -6, z: -1000, x: ${Math.round(-w * 0.45 * dir)}, duration: ${OVERLAP}, ease: "power2.in" }, ${(start + s.dur).toFixed(2)});`);
      anims.push(`  tl.to("#w${i}", { opacity: 0, duration: 0.12, ease: "none" }, ${(start + s.dur + OVERLAP - 0.12).toFixed(2)});`);
    }
    // Captions: a plaque that flips up from its bottom edge, then flips away.
    anims.push(`  tl.fromTo("#c${i} span", { rotationX: -100, z: -120, opacity: 0 }, { rotationX: 0, z: 0, opacity: 1, duration: 0.6, ease: "back.out(1.5)" }, ${(start + 0.2).toFixed(2)});`);
    anims.push(`  tl.to("#c${i} span", { rotationX: 95, opacity: 0, duration: 0.3, ease: "power2.in" }, ${(start + s.dur - 0.3).toFixed(2)});`);
    t += s.dur;
  });
  const endStart = +t.toFixed(2), total = +(t + END.dur).toFixed(2);
  // The end card, as it was.
  anims.push(`  tl.fromTo("#end .logo", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(2)" }, ${endStart + 0.1});`);
  anims.push(`  tl.fromTo("#end .tag", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }, ${endStart + 0.5});`);
  anims.push(`  tl.fromTo("#end .url", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }, ${endStart + 0.8});`);
  anims.push(`  tl.fromTo("#flash", { opacity: 0.55 }, { opacity: 0, duration: 0.3, ease: "power2.out", immediateRender: false }, ${endStart});`);
  // The floor grid drifts toward the viewer the whole time (seen between and around the cards).
  anims.push(`  tl.fromTo("#floor", { backgroundPosition: "0px 0px" }, { backgroundPosition: "0px ${Math.round(total * 120)}px", duration: ${total}, ease: "none" }, 0);`);
  const cap = tall ? { size: 62, big: 84, bottom: 300, pad: "22px 34px", max: 960 } : { size: 48, big: 66, bottom: 70, pad: "16px 32px", max: 1500 };
  return `<!doctype html>
<!-- Generated by ${END.by}: edit the shot list there, not this file. -->
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Pixelify+Sans:wght@600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <style>
    body { margin: 0; background: #141c3c; }
    #root { position: relative; width: ${w}px; height: ${h}px; overflow: hidden; perspective: ${tall ? 2200 : 1800}px; perspective-origin: 50% 45%;
      background: radial-gradient(ellipse at 50% 35%, #2b3a80 0%, #141c3c 65%, #0b1026 100%); font-family: "Fredoka", system-ui, sans-serif; }
    /* A glowing grid floor in perspective, behind the cards. */
    #floor { position: absolute; left: -50%; right: -50%; bottom: -10%; height: 70%; z-index: 0; transform: rotateX(72deg); transform-origin: 50% 100%;
      background-image: linear-gradient(rgba(252, 211, 77, 0.35) 2px, transparent 2px), linear-gradient(90deg, rgba(252, 211, 77, 0.35) 2px, transparent 2px);
      background-size: 120px 120px; -webkit-mask-image: linear-gradient(to top, #000 10%, transparent 85%); mask-image: linear-gradient(to top, #000 10%, transparent 85%); }
    /* A shot's card: the frame, rounded, with a glow and a drop shadow, so it reads as an object in space. */
    .card { position: absolute; inset: 0; overflow: hidden; border-radius: 22px; opacity: 0; backface-visibility: hidden;
      box-shadow: 0 50px 100px rgba(0, 0, 0, 0.6), 0 0 0 5px rgba(252, 211, 77, 0.55), 0 0 60px rgba(252, 211, 77, 0.25); }
    .shot { position: absolute; image-rendering: pixelated; object-fit: fill; }
    .caption { position: absolute; left: 0; right: 0; bottom: ${cap.bottom}px; display: flex; justify-content: center; z-index: 20; pointer-events: none; perspective: 900px; }
    .caption span { display: inline-block; transform-origin: 50% 100%; max-width: ${cap.max}px; text-align: center; color: #fffaf0; font-size: ${cap.size}px; font-weight: 700; line-height: 1.15; letter-spacing: 0.01em;
      padding: ${cap.pad}; background: linear-gradient(180deg, #2a3878, #18214a); border: 4px solid #fcd34d; border-radius: 18px;
      /* a thick lower edge and a soft drop: a 3D plaque */
      box-shadow: 0 10px 0 #a16207, 0 12px 0 #713f12, 0 24px 36px rgba(0, 0, 0, 0.55);
      /* raised letters */
      text-shadow: 0 2px 0 #c7a84a, 0 4px 0 #8a6a1c, 0 6px 10px rgba(0, 0, 0, 0.6); }
    .caption.big { bottom: auto; top: ${tall ? 380 : 120}px; }
    .caption.big span { font-size: ${cap.big}px; }
    #flash { position: absolute; inset: 0; background: #fff; opacity: 0; z-index: 30; pointer-events: none; }
    #end { position: absolute; inset: 0; z-index: 40; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${tall ? 40 : 28}px;
      background: radial-gradient(circle at 50% 40%, #24306a, #141c3c 70%); color: #fff7d6; text-align: center; font-family: "Pixelify Sans", system-ui, sans-serif;
      /* Pixelify Sans's "fi" ligature reads as an A */ font-variant-ligatures: none; }
    #end .logo { font-size: ${tall ? 120 : 130}px; font-weight: 700; color: #fcd34d; text-shadow: 6px 6px 0 #000; }
    #end .tag { font-size: ${tall ? 58 : 56}px; font-weight: 600; }
    #end .url { font-size: ${tall ? (END.url.length > 16 ? 58 : 76) : 72}px; font-weight: 700; color: #141c3c; background: #fcd34d; padding: 10px 34px; border-radius: 16px; border: 4px solid #7a4a10; }
  </style>
</head>
<body>
  <div id="root" data-composition-id="${id}" data-start="0" data-duration="${total}" data-width="${w}" data-height="${h}">
    <div id="floor" class="clip" data-start="0" data-duration="${total}" data-track-index="5"></div>
${clips.join("\n")}
${captions.join("\n")}
    <div id="end" class="clip" data-start="${endStart}" data-duration="${END.dur}" data-track-index="4">
      <div class="logo">${END.logo}</div>
      <div class="tag">${END.tag}</div>
      <div class="url">${END.url}</div>
    </div>
    <div id="flash"></div>
    <audio id="music" src="${audio}" data-start="0" data-duration="${total}" data-volume="0.9" data-fade-out="1"></audio>
  </div>
  <script>
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });
${anims.join("\n")}
  window.__timelines["${id}"] = tl;
  </script>
</body>
</html>
`;
}

/**
 * Write the projects: `dirs` maps a folder to its id and shape; `cut` is the
 * shot list, the end card ({ dur, logo, tag, url, by }), the soundtrack and
 * where the footage is (relative to each project).
 */
export function writeProjects(dirs, cut) {
  for (const [dir, opts] of dirs) {
    fs.mkdirSync(dir, { recursive: true });
    for (const shared of ["footage", "audio"]) if (!fs.existsSync(`${dir}/${shared}`)) fs.symlinkSync(`../${shared}`, `${dir}/${shared}`);
    fs.writeFileSync(`${dir}/index.html`, composition({ ...opts, ...cut }));
  }
  const total = cut.shots.reduce((s, x) => s + x.dur, 0) + cut.end.dur;
  const cuts = cut.shots.reduce((a, s) => [...a, +(a.at(-1) + s.dur).toFixed(2)], [0]).slice(1);
  return { total, cuts };
}
