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
| `audio`      | –         | Optional music, see below.                                              |
| `scenes`     | –         | Played in order, back to back.                                          |

Colours are `#rgb` or `#rrggbb`.

### Music

```json
"audio": { "src": "song.mp3", "start": 0, "offset": 0, "fadeIn": 0, "fadeOut": 6 }
```

| Field     | Default | Meaning                                                                 |
| --------- | ------- | ----------------------------------------------------------------------- |
| `src`     | –       | Audio file in the package (MP3, WAV, OGG, M4A).                          |
| `start`   | `0`     | Seconds into the file where playback begins – to skip an intro.          |
| `offset`  | `0`     | Seconds of silence before the music starts.                             |
| `fadeIn`  | `0`     | Fade-in length, starting when the music starts.                         |
| `fadeOut` | `0`     | Fade-out length, ending exactly on the last frame.                      |

The build writes the music as an MP3 cut to exactly the animation's length (the school starts it with the first frame), with the trim, delay and fades applied; the previews and the web player use the same settings.

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

Use `\n` for several lines: each line is centred within the widest one, 8 rows apart (room for the next line's accents). Two lines fit the 16-row floor, e.g. `"KOCHAM\nCIĘ"`.

A scrolling text's natural length runs from its first column appearing at the right edge to its last column at the left edge. The 5 px font covers A–Z, Polish letters (Ą Ć Ę Ł Ń Ó Ś Ź Ż), digits, `. , ! ? - + : '` and `♥`. Lowercase is drawn as uppercase.

### `layers` – moving things

A scene built from layers drawn bottom to top over `background` (defaults to the animation's). Each layer is a **sprite** (named pixel art from the top-level `sprites`), a **text**, or a **rect**, and can move, fade and change over time with keyframes.

```json
{
  "sprites": {
    "dot": { "palette": { "o": "#ff4fa3" }, "rows": ["oo", "oo"] }
  },
  "scenes": [
    {
      "type": "layers",
      "duration": 6,
      "layers": [
        { "sprite": "dot", "x": 2, "y": 12, "keyframes": [{ "t": 3, "x": 24, "y": 2, "ease": "in-out" }] },
        { "text": "17.07", "x": 14, "y": 8, "anchor": "center", "from": 3.5, "opacity": 0,
          "keyframes": [{ "t": 3.5, "opacity": 0 }, { "t": 4.5, "opacity": 1 }] }
      ]
    }
  ]
}
```

| Field       | Default    | Meaning                                                                            |
| ----------- | ---------- | ---------------------------------------------------------------------------------- |
| `sprite`    | –          | Name of a sprite in `sprites`.                                                     |
| `text`      | –          | Text in the pixel font (multi-line with `\n`).                                     |
| `rect`      | –          | `[width, height]` filled with `color`.                                             |
| `x`, `y`    | `0`        | Position in pixels (rounded when drawn).                                           |
| `anchor`    | `top-left` | `center` makes `x`, `y` the middle of the layer (for text: of the letter bodies).  |
| `color`     | `#ffffff`  | Text / rect colour. Sprites keep their palette.                                    |
| `opacity`   | `1`        | `0`–`1`, blended over the layers below.                                            |
| `from`, `to`| whole scene| Seconds within the scene when the layer is shown.                                  |
| `keyframes` | –          | `{ "t": seconds, ...changes, "ease": ... }`, see below.                            |

**Keyframes** change any of `x`, `y`, `opacity`, `color`, `sprite`, `text` at time `t` (seconds from the scene start). The layer's own values act as a keyframe at `t: 0`. Numbers and colours move smoothly from the previous keyframe that set them; `ease` on the arriving keyframe sets the pace: `linear` (default), `in`, `out`, `in-out`, or `step` (hold, then jump). `sprite` and `text` switch at their keyframe – use that for flipbook animation (e.g. a cat's walk cycle) or a growing heart drawn at several sizes.

**Sprites** are defined once at the top level: `"sprites": { "name": { "palette": {...}, "rows": [...] } }`, rows of any equal-ish length, `.` or space transparent.

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

- **dark pixels** – a lit pixel holding the same colour with every channel below 40 for more than 1 s (fades are fine), which look off or "dirty" on the floor;
- **long full white** – at least half the floor near-white for more than 3 s;
- **strobing** – more than 3 full-floor light/dark flashes within one second.
