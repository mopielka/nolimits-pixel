# nolimits-pixel

Animations for the **Pixel** LED floor at the No Limits dance school: 28 × 16 tiles of 30 × 30 cm, played at 25 fps.

- [SPEC.md](SPEC.md) – what the school needs from us (deliverable, design rules, orientation).
- [FORMAT.md](FORMAT.md) – our animation package format: `index.json` + PNGs, with scenes, durations and transitions.

## Build

Requires Node 26 (runs the TypeScript directly) and, for the preview video, `ffmpeg` (`brew install ffmpeg`).

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

## Code layout

- `src/core/` – platform-independent: parsing `index.json`, rendering frames, the pixel font, safety checks, reading packages and ZIPs. Shared with the planned web player.
- `src/cli/build.ts` – Node CLI that writes PNGs, the ZIP and the preview.
- `test/` – `npm test`; `npm run typecheck` for types.

## Planned: web player

A browser tool that opens a package ZIP (or a delivered frames ZIP) and plays it on a simulated floor – top-down or in perspective as seen from the entrance, in either orientation – reusing `src/core`.
