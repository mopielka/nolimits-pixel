# Working on this repo

Animations for the **Pixel** LED floor at the No Limits dance school: 28 × 16 square tiles (30 × 30 cm each, 8.4 × 4.8 m in total), each lit in one solid colour, played at 25 fps. The school plays a ZIP of 28 × 16 PNG frames; everything here exists to produce that ZIP and to preview it.

Read these before changing anything:

- [SPEC.md](SPEC.md) – what the school needs and the design rules for the floor (the source of truth for constraints).
- [FORMAT.md](FORMAT.md) – the `index.json` animation package format (scenes, layers, keyframes, transitions).
- [README.md](README.md) – commands and layout.

## Setup

- **Node 26+** runs the TypeScript directly (type stripping): there is no compile step and no `tsx`.
- **ffmpeg** on `PATH` for the preview videos (`brew install ffmpeg`); without it the build skips them.
- `npm install`

## Commands

| Command | What it does |
| --- | --- |
| `npm test` / `npm run typecheck` | Unit tests (`node:test`) and `tsc`. Run both after any change to `src/`. |
| `npm run build -- animations/<name>` | Renders a package (directory or ZIP) to `out/<name>/`: `klatki/klatka_NNNN.png`, `<name>.zip` (what the school gets), `preview.mp4`, `preview-floor.mp4`, and prints safety warnings. |
| `node animations/<name>/generate.ts` | Regenerates that animation's `index.json` from code. |
| `npm run web` | The 3D player at http://localhost:5173 – lists every package in `animations/` and `examples/` and reloads when their files change. |
| `npm run web:deploy` | Builds the player and force-pushes it to a GitHub Pages repo (`PAGES_REPO`, default `mopielka/nolimits-pixel-player` – set it to your own fork's pages repo). |

## How the code fits together

- `src/core/` – everything that understands animations: `parse.ts` validates `index.json`, `render.ts` compiles it into `renderFrame(i)`, `layers.ts` draws keyframed layers, `font.ts` is the 5 px pixel font (with Polish letters), `lint.ts` checks the floor's safety rules, `package.ts` reads packages and ZIPs. It is shared by the CLI and the browser, so it must not use Node (`node:*`) or DOM APIs – platform code passes decoded images in.
- `src/cli/build.ts` – Node-only: reads a package, writes PNGs, the ZIP and the previews.
- `web/` – Vite + three.js player: `floor-scene.ts` (dark dance hall, the floor as a canvas texture, cameras for each view), `sources.ts` (turns bundled packages, folders, ZIPs and loose files into something playable), `local-folder.ts` (folder picking, live re-reading via the File System Access API, remembering the folder), `human-vision.ts` (post-processing shader for the human-vision framing), `head-control.ts` (turning the head by mouse drag or touch joystick), `main.ts` (UI, playback, music sync).
- `animations/<name>/` – real animations. Complex ones are written as `generate.ts` (+ `sprites.ts` for pixel art) that writes `index.json`; **commit the generated `index.json`** – the build and the player only read that.
- `examples/` – small packages: `demo` (every scene type), `layers` (movement in code: dots, a beating heart, a walking cat), `test-orientation` (the "UP" arrow frame the school asked for, red/green corner marks top-left/top-right).

## Making a new animation

1. Create `animations/<name>/`. For a simple one, hand-write `index.json`; for anything with movement, start from `examples/layers/generate.ts` (helpers for fades and walk cycles, sprites swapped to change size, a tricolour cat).
2. Keep a preview open while editing: `npm run web` (lists `animations/`), or the published player with **Otwórz folder…** on the animation's folder (Chrome/Edge reload it on every save). `node --watch animations/<name>/generate.ts` regenerates `index.json` on every save.
3. **Look at the result, don't trust the numbers.** Render the frames (`npm run build`) and inspect key moments – overlaps are the usual bug: text touching a sprite, a dot next to a letter reading as an extra letter, a sprite crossing text. An upscaled contact sheet of a dozen frames is the quickest check.
4. Stay within the floor's limits (all from SPEC.md; `lint` warns on the measurable ones):
   - letters are 5 px tall; about 5–7 fit across (`textWidth()` tells you exactly); two lines fit vertically with `\n`; longer text should scroll at 3–4 frames per pixel;
   - saturated colours; black is "off"; nothing lit should stay below 40/255 per channel;
   - no more than ~3 s of mostly-white floor, no full-floor flashing faster than 3 times a second;
   - about 60 s = 1500 frames.
5. Deliver `out/<name>/<name>.zip` + `preview.mp4` (+ the music file) and tell the school which side the viewer stands on.

## Conventions

- Coordinates: x 0–27 left → right, y 0–15 top → bottom. Row 0 is the image's top edge; in the 3D player it is the far side for a viewer at the "bottom" long side. Seen from a short side, text reads rotated 90°.
- Only erasable TypeScript (no `enum`, no constructor parameter properties) and `.ts` extensions in relative imports – Node strips types without compiling.
- Comments only for intent the code can't show. Conventional commit messages (`feat(<animation>): …`, `fix(web): …`).
- Changes to `src/core` need a test in `test/core.test.ts` and an update to `FORMAT.md` if the format changes.
- **Music is never committed** (`.gitignore` excludes audio files, and the deploy script refuses to publish them): songs are copyrighted and these repos are public. Keep the file locally in the package folder; `index.json` references it by name.

## Public vs private

This repo and the published player are public: anything in `animations/` and `examples/` is visible to anyone with the link. Personal animations belong in a private repo that includes this one as a submodule (e.g. `pixel/`), importing `../pixel/src/core/...`; build them with `(cd pixel && npm run build -- ../<name> --out ../out)` and watch them by dropping their `index.json` onto the player. Never copy or symlink them into `animations/`.
