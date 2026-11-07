# Animation package format (v1)

An **animation package** is a directory (or a ZIP of it) with `index.json` at its root plus any PNG files it references:

```
my-animation/
  index.json
  frames/heart.png
  frames/wave_01.png
  music.mp3
```

A ZIP may also wrap everything in a single top-level folder (what macOS "Compress" produces).

The build turns a package into the deliverable described in [SPEC.md](SPEC.md): `klatka_0001.png … klatka_NNNN.png` (28 × 16, 25 fps), an upscaled preview MP4, and the music file.

## `index.json`

```json
{
  "version": 1,
  "title": "No Limits",
  "background": "#000000",
  "audio": { "src": "music.mp3", "offset": 0 },
  "scenes": [
    { "type": "color", "color": "#ff0000", "duration": 2, "transition": { "type": "fade", "duration": 1 } },
    { "type": "image", "src": "frames/heart.png", "duration": 3, "transition": { "type": "slide-left", "duration": 0.5 } },
    { "type": "text", "text": "NO LIMITS ♥", "color": "#ff3399" }
  ]
}
```

| Field        | Default   | Meaning                                                                 |
| ------------ | --------- | ----------------------------------------------------------------------- |
| `version`    | –         | Must be `1`.                                                            |
| `title`      | –         | Free text.                                                              |
| `width`      | `28`      | Canvas width in pixels (the floor is 28).                               |
| `height`     | `16`      | Canvas height in pixels (the floor is 16).                              |
| `fps`        | `25`      | Frame rate (the floor plays 25).                                        |
| `background` | `#000000` | What the first scene fades/slides in from.                              |
| `audio`      | –         | Optional `{ "src": "music.mp3", "offset": seconds }`; offset delays the music. |
| `scenes`     | –         | Played in order, back to back.                                          |

Colours are `#rgb` or `#rrggbb`.

## Scene timing

Every scene sets its length with **either** `"duration"` (seconds, rounded to whole frames) **or** `"frames"` (exact frame count). `text` and `sequence` scenes have a natural length and may omit both.

## Scene types

### `color` – fill the whole floor

```json
{ "type": "color", "color": "#00ff00", "duration": 2 }
```

### `image` – a still PNG

```json
{ "type": "image", "src": "frames/heart.png", "duration": 3 }
```

The PNG must be 28 × 16, or an exact multiple (e.g. 280 × 160) made of uniform blocks – each block's centre pixel is used. Transparent pixels become black.

### `sequence` – flipbook of PNGs

```json
{ "type": "sequence", "src": ["frames/wave_01.png", "frames/wave_02.png", "frames/wave_03.png"], "frameDuration": 0.12, "duration": 4 }
```

Each image is held for `frameDuration` seconds (or `frameFrames` frames; default 1 frame). Without `duration`/`frames` the sequence plays once; with it, the sequence loops to fill the time.

### `pixels` – inline pixel art

```json
{
  "type": "pixels",
  "palette": { "r": "#ff0000", "y": "#ffdd00" },
  "rows": [
    "r..........................y",
    "..."
  ],
  "duration": 2
}
```

Exactly `height` rows of exactly `width` characters. `.` and space are black; every other character must be in `palette`. Handy for test frames and simple shapes without drawing a PNG.

### `text` – pixel-font text

```json
{ "type": "text", "text": "KOCHAM CIĘ", "color": "#ff3399", "background": "#000000", "framesPerPixel": 4 }
```

| Field            | Default   | Meaning                                                        |
| ---------------- | --------- | -------------------------------------------------------------- |
| `color`          | `#ffffff` | Letter colour.                                                 |
| `background`     | `#000000` | Fill behind the text.                                          |
| `y`              | centred   | Top row of the 5 px letter body.                               |
| `scroll`         | `true`    | Scroll right → left. `false` = static, centred (needs a duration). |
| `framesPerPixel` | `4`       | Scroll speed: frames per 1 px step (spec recommends 3–4).      |

A scrolling text's natural length runs from its first column appearing at the right edge to its last column at the left edge. The 5 px font covers A–Z, Polish letters (Ą Ć Ę Ł Ń Ó Ś Ź Ż), digits, `. , ! ? - + : '` and `♥`. Lowercase is drawn as uppercase.

## Transitions

Any scene may have `"transition": { "type": "...", "duration": seconds }`. It plays during the **first** `duration` seconds of that scene (it doesn't add time), blending from the last frame of the previous scene (or from `background` for the first scene).

| Type                                                  | Effect                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| `cut`                                                 | Default – instant switch.                                  |
| `fade`                                                | Cross-fade.                                                |
| `slide-left` / `slide-right` / `slide-up` / `slide-down` | Both scenes move in that direction; the new one pushes the old one out. |
| `wipe-left` / `wipe-right` / `wipe-up` / `wipe-down`  | A hard edge moves in that direction, revealing the new scene. |

Up/down refer to the image (row 0 is the top).

## Safety checks

The build warns (it doesn't fail) when the output breaks the guidance in [SPEC.md](SPEC.md):

- **dark pixels** – lit pixels with every channel below 40, which look off or "dirty" on the floor;
- **long full white** – at least half the floor near-white for more than 3 s;
- **strobing** – more than 3 full-floor light/dark flashes within one second.
