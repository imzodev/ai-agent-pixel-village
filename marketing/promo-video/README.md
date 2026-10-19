# thegroove promo videos

Two cuts, both from real gameplay:
- **40 seconds** (`build40.mjs`): gameplay with big words from the first frame, the brand, floating feature
  cards on the game's own colours (forest green, river teal, night navy), a wall of clips, the end card.
  `npm run sound40 && npm run render40` → `out/thegroove-promo-40s-*.mp4`.
- **30 seconds** (`build.mjs`), described below.

The 30-second cut: a 30-second promo made with [HyperFrames](https://hyperframes.heygen.com) from real gameplay in the **local dev
world**, cut twice:
- **wide** (1920×1080) for X, YouTube, Reddit and the landing page;
- **vertical** (1080×1920) for TikTok, Reels and Shorts.

## Make it again

With the game's dev server and tickd running (`npm run dev` at the repo root) and the `.env` in place:

```
cd marketing/promo-video
npm install
npm run capture        # records footage/wide/*.mp4 (~5 min; one shot: SHOTS=05 npm run capture)
npm run sound          # audio/promo.wav, made with ffmpeg (nothing to license)
npm run render         # node build.mjs, then wide/ and tall/ → out/*.mp4
npm run cleanup        # deletes the filming characters capture made
```

Output: `out/thegroove-promo-1080p.mp4` and `out/thegroove-promo-vertical.mp4`. For lighter copies to post:

```
ffmpeg -i out/thegroove-promo-1080p.mp4 -crf 22 -preset slow -movflags +faststart -c:a aac -b:a 128k out/thegroove-promo-1080p-web.mp4
```

## How it works

- **`capture.mjs` + `rec.mjs`** record headless Chrome on `localhost:3000`, on the GPU, at 60 fps from Chrome's
  screencast.
  - Each shot gets a fresh copy of the filming character, made in the dev database at the shot's spot. A
    character the game server has already seen keeps its live position: the speed guard stops teleports.
  - Shots set the weather and time of day, and set up what they show: a job, a flooded market, wolves.
- **`build.mjs`** writes both HyperFrames projects from one shot list: footage, in-point, length, zoom, focus
  point, caption. Edit captions and timing there, never in `wide/index.html` or `tall/index.html`.
  - The vertical cut reframes the wide footage around each shot's focus (`tfx` / `tz` override it).
  - The style is 3D. Each shot is a frame-sized card that flies in from the side through depth and turns
    slowly while it plays; the footage zooms inside the card. As the next card arrives, the previous one swings
    away (`OVERLAP`). A perspective grid floor drifts behind the cards.
  - Captions are Fredoka plaques that flip up in 3D. The end card keeps Pixelify Sans.
- **`sound.sh`**: a soft pad, a pluck on each cut and a chime on the end card. If you move the cuts in
  `build.mjs`, move them here too.

Footage, audio and renders are ignored by git (`.gitignore`): only the sources are kept.
