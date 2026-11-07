# Pixel Floor Animation – Production Spec

Instructions from the dance school for preparing an animation for their **Pixel** LED floor.

## The "screen"

The Pixel floor is not a screen in the usual sense. It is **448 large light tiles** (each 30 × 30 cm), laid out in a rectangle of **28 columns × 16 rows** – about 8.4 × 4.8 m in total. Each tile lights up in a single solid colour.

So the effective resolution is **28 × 16 pixels**, and one pixel is 30 cm.

The viewer stands at one of the **short sides** of the floor, by the entrance (or on the floor itself – it is designed to be walked on).

## 1. Deliverable

Preferred: **a PNG image sequence** (one file per frame), packed into a ZIP.

| Parameter        | Value                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| Frame size       | exactly **28 × 16 px** (width × height)                                |
| Format           | PNG, RGB (transparency is ignored – transparent = black)               |
| Frame rate       | **25 fps**                                                             |
| Length           | ~60 s = ~**1500 frames**                                               |
| File names       | `klatka_0001.png`, `klatka_0002.png`, … (sequential, zero-padded)      |

Also acceptable: a GIF or MP4 at exactly 28 × 16 px, 25 fps. PNGs are better – video compression at this tiny size blurs and distorts colours.

**Do not send a Full HD video to be downscaled.** Automatic downscaling from 1920 × 1080 to 28 × 16 turns the image into colourful mush. Design natively at 28 × 16 (or an exact multiple, e.g. 280 × 160 where every "pixel" is a uniform 10 × 10 block of one colour – that can be scaled down losslessly).

**Include a preview:** the same animation as a regular MP4, upscaled **without smoothing** (nearest-neighbour), e.g. 560 × 320 where each pixel is a 20 × 20 square. They will use it to check that everything matches.

## 2. Design guidelines

- **Think in big shapes.** Hearts, stars, waves, flashes, filling the floor with colour, moving stripes – these look great. Fine detail disappears.
- **Text:** a letter needs at least **5 px height** and **3–4 px width** (pixel font). About **5 letters** fit across the width at once. Longer text (e.g. "KOCHAM CIĘ", a name) should be a **horizontal scroller**, moving slowly (~**1 pixel every 3–4 frames**) so it is readable from the floor. Check text on the preview from section 1.
- **Saturated colours.** Pure colours work best: red, green, blue, yellow, cyan, pink, white, orange. Very dark shades (channel values below ~**40/255**) look switched off or "dirty" on the floor; pastels and subtle gradients flatten out.
- **Black = tile off.** Black is a good background and gives contrast.
- **Colours on the floor differ from a monitor** – purples and browns in particular come out differently. If a specific shade matters, send a test frame early and they will check it live.
- **Don't overdo full white on the whole floor** – 37 m² of white light is blinding in a dark room. A short flash is OK; a dozen seconds or more is not.
- **No fast full-floor flashing** (strobe faster than ~**3 times per second**) – it strains the eyes and can trigger epileptic seizures in some people.
- **Smooth transitions** (fade in / fade out) work, but will be slightly stepped in dark tones.

## 3. Orientation

The file is landscape: 28 wide, 16 high. Tell them **which side the viewer will stand on**, or which direction text should read – they will rotate the image accordingly. If it matters, send **one test frame with an "UP" arrow** before the final file; they will show how it looks on the floor.

## 4. Music (optional)

The room has speakers. If there should be a soundtrack:

- a separate **MP3 or WAV** file, the **same length** as the animation,
- music starts together with the first frame – note it if there should be an offset.

## 5. Tools

- **Piskel** (free, in-browser: piskelapp.com) or **Aseprite** – set canvas to 28 × 16, draw frame by frame, export to PNG/GIF.
- **After Effects / Blender / Premiere** – 28 × 16 composition (or 280 × 160 with 10 × 10 blocks), 25 fps, export as PNG sequence; disable anti-aliasing and motion blur.
- **Code** (Python, Processing, p5.js) – generate 1500 images of 28 × 16.

## 6. Deadline

They need the file **at least a few days before the visit** – to upload it, test it on the floor and possibly ask for fixes. Provide the **date and time of the visit** so the room is free.

## TL;DR

- ZIP with **1500 PNG files, 28 × 16 px, 25 fps** + **MP4 preview** (nearest-neighbour upscale) + (optional) **MP3 music**
- Info on **which side the viewer stands / looks from**.
