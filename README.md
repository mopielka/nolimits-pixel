# nolimits-pixel

Animations for the **Pixel** LED floor at the No Limits dance school: 28 × 16 tiles of 30 × 30 cm, played at 25 fps.

**Player:** https://mopielka.github.io/nolimits-pixel-player/ – watch any animation here in 3D, from any side of the room.

- [SPEC.md](SPEC.md) – what the school needs (deliverable, design rules, orientation).
- [FORMAT.md](FORMAT.md) – the animation package format: `index.json` + PNGs, with scenes, layers, keyframes and transitions.
- [CLAUDE.md](CLAUDE.md) – how to work on this repo with Claude Code (or any coding agent): setup, architecture, how to make a new animation.

## Po polsku w skrócie

To narzędzia do robienia animacji na podłogę Pixel (28 × 16 kafli, 25 klatek/s). Animację opisuje plik `index.json` (sceny, napisy, ruchome obrazki, przejścia), z którego build robi to, czego potrzebuje szkoła: ZIP z 1500 plikami PNG 28 × 16 i podgląd MP4. Aplikacja webowa pokazuje animację w 3D w ciemnej sali, z góry, z boku albo od wejścia.

Najprościej pracować z Claude Code: sklonuj repo, otwórz je w Claude i opisz, jaką animację chcesz – instrukcje dla Claude'a są w [CLAUDE.md](CLAUDE.md). Gotowe animacje leżą w `animations/`, przykłady w `examples/`. Muzyki nie dodawaj do repo (jest publiczne) – trzymaj plik u siebie w folderze animacji.

## Build

Requires Node 26+ (runs the TypeScript directly) and, for the preview videos, `ffmpeg` (`brew install ffmpeg`).

```bash
npm install
npm run build -- examples/demo          # a package directory…
npm run build -- path/to/animation.zip  # …or a zipped one
```

Output lands in `out/<name>/`:

| File                       | What it is                                                                 |
| -------------------------- | -------------------------------------------------------------------------- |
| `klatki/klatka_NNNN.png`   | Every frame, 28 × 16 RGB.                                                  |
| `<name>.zip`               | The same frames, flat – this is what we send.                              |
| `preview.mp4`              | 560 × 320 nearest-neighbour preview (with music, if the package has it) – the one the school asked for. |
| `preview-floor.mp4`        | Same, with thin black gaps between tiles so it looks like the real floor.  |
| music file                 | Copied from the package, to send alongside.                                |

The build also prints safety warnings (too-dark pixels, long full white, strobing) – see [FORMAT.md](FORMAT.md#safety-checks).

## Examples

- `examples/test-orientation` – the single "UP" test frame the school asked for; red marks the top-left corner, green the top-right.
- `examples/demo` – every scene type and several transitions.
- `examples/layers` – movement written in code (`generate.ts`): dots meeting, a beating heart, a walking cat. The starting point for animations with movement.

## Animations

Put animations in `animations/<name>/` – see [animations/README.md](animations/README.md). Anything there is public; personal ones go in a private repo that includes this one as a submodule (see [CLAUDE.md](CLAUDE.md#public-vs-private)).

## Code layout

- `src/core/` – platform-independent: parsing `index.json`, rendering frames, the pixel font, safety checks, reading packages and ZIPs. Shared by the CLI and the web player.
- `src/cli/build.ts` – Node CLI that writes PNGs, the ZIP and the preview.
- `test/` – `npm test`; `npm run typecheck` for types.

## Web player

```bash
npm run web            # http://localhost:5173
node --watch examples/layers/generate.ts   # optional: regenerate index.json on every save
```

Plays an animation on a 3D model of the floor in a dark dance hall (light from the floor spills onto the walls). Views: top-down landscape or portrait, from either long side, from either short side (the entrance), or free orbit with the mouse; eye height and distance from the floor are adjustable (locked in top-down and free views). The **human vision** framing approximates one person's glance: a wide oval field (120° across, reaching further down than up), sharp in the centre and increasingly blurred, desaturated and dim towards the edges. In the side and entrance views you can turn your head – drag the picture with the mouse, or use the joystick on touch screens; it drifts back to straight ahead when released. Packages in `animations/` and `examples/` are listed automatically and reload when their files change. Music in a package plays in sync.

**Your own animations, online:** click **Otwórz folder…** (or drag a folder onto the page) and pick an animation folder – or a whole repo of them, which lists every subfolder with an `index.json`. In Chrome and Edge the player then re-reads the folder every second and reloads on each save, staying at the same moment and keeping the music; after a page reload, **📁 Wznów** reopens it. Other browsers load the folder once. **Otwórz pliki…** takes a package ZIP, a bare `index.json` (no music), or the delivered frames ZIP together with its MP3. `npm run web:build` writes a static site to `dist-web/`.

**Public site:** `npm run web:deploy` builds it and force-pushes it to the site-only repo `mopielka/nolimits-pixel-player`, served by GitHub Pages at https://mopielka.github.io/nolimits-pixel-player/. From a fork, create your own pages repo and run `PAGES_REPO=<you>/<repo> npm run web:deploy`. The script refuses to publish music files.

Code: `web/src/floor-scene.ts` (three.js room, floor and cameras), `web/src/sources.ts` (loading packages and ZIPs in the browser through `src/core`), `web/src/main.ts` (UI and playback).
