import type { CompiledAnimation } from './render.ts';
import type { Image } from './types.ts';

export interface LintWarning {
  kind: 'dark' | 'white' | 'strobe' | 'size';
  message: string;
  frame?: number;
}

const DARK_LIMIT = 40;
const DARK_MIN_SECONDS = 1;
const WHITE_MIN_CHANNEL = 200;
const WHITE_FLOOR_SHARE = 0.5;
const WHITE_MAX_SECONDS = 3;
const FLASH_LUMINANCE_DELTA = 0.2;
const MAX_FLASHES_PER_SECOND = 3;

function stats(img: Image) {
  const pixels = img.width * img.height;
  /** The pixel's packed colour when it's lit but too dark, else −1. */
  const dark = new Int32Array(pixels).fill(-1);
  let white = 0;
  let luminance = 0;
  for (let i = 0; i < img.data.length; i += 3) {
    const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
    const max = Math.max(r, g, b);
    if (max > 0 && max < DARK_LIMIT) dark[i / 3] = (r << 16) | (g << 8) | b;
    if (Math.min(r, g, b) >= WHITE_MIN_CHANNEL) white++;
    luminance += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  return { dark, whiteShare: white / pixels, luminance: luminance / pixels };
}

/** Light↔dark swings of at least FLASH_LUMINANCE_DELTA, as frame indices. */
function luminanceSwings(levels: number[]): number[] {
  const swings: number[] = [];
  let ref = levels[0];
  let dir = 0;
  for (let i = 1; i < levels.length; i++) {
    const d = levels[i] - ref;
    if (dir !== 0 && Math.sign(d) === dir) ref = levels[i];
    else if (Math.abs(d) >= FLASH_LUMINANCE_DELTA) {
      dir = Math.sign(d);
      ref = levels[i];
      swings.push(i);
    }
  }
  return swings;
}

export function lint(anim: CompiledAnimation): LintWarning[] {
  const warnings: LintWarning[] = [];
  const { fps, frameCount } = anim;
  const time = (frame: number) => `${(frame / fps).toFixed(2)} s (frame ${frame + 1})`;

  if (anim.width !== 28 || anim.height !== 16 || anim.fps !== 25) {
    warnings.push({ kind: 'size', message: `Canvas is ${anim.width}×${anim.height} @ ${anim.fps} fps; the floor expects 28×16 @ 25 fps` });
  }

  const levels: number[] = [];
  // Fades pass through dark levels, which the spec accepts, changing colour every frame or two;
  // only flag a pixel that holds the same too-dark colour.
  const darkRun = new Uint16Array(anim.width * anim.height);
  let previousDark = new Int32Array(anim.width * anim.height).fill(-1);
  const darkMinFrames = Math.round(fps * DARK_MIN_SECONDS);
  let firstDark = -1;
  let whiteRun = 0;
  let whiteReported = false;

  for (let f = 0; f < frameCount; f++) {
    const s = stats(anim.renderFrame(f));
    levels.push(s.luminance);
    for (let p = 0; p < darkRun.length; p++) {
      darkRun[p] = s.dark[p] < 0 ? 0 : s.dark[p] === previousDark[p] ? darkRun[p] + 1 : 1;
      if (firstDark < 0 && darkRun[p] >= darkMinFrames) firstDark = f - darkMinFrames + 1;
    }
    previousDark = s.dark;
    whiteRun = s.whiteShare >= WHITE_FLOOR_SHARE ? whiteRun + 1 : 0;
    if (!whiteReported && whiteRun > WHITE_MAX_SECONDS * fps) {
      whiteReported = true;
      warnings.push({
        kind: 'white',
        frame: f - whiteRun + 1,
        message: `Over half the floor is near-white for more than ${WHITE_MAX_SECONDS} s from ${time(f - whiteRun + 1)} – blinding in a dark room`,
      });
    }
  }

  if (firstDark >= 0) {
    warnings.push({
      kind: 'dark',
      frame: firstDark,
      message: `Lit pixels stay darker than ${DARK_LIMIT}/255 for over ${DARK_MIN_SECONDS} s from ${time(firstDark)} – they look off or dirty on the floor`,
    });
  }

  const swings = luminanceSwings(levels);
  for (let i = 0; i < swings.length; i++) {
    let j = i;
    while (j + 1 < swings.length && swings[j + 1] - swings[i] < fps) j++;
    if (j - i + 1 > MAX_FLASHES_PER_SECOND * 2) {
      warnings.push({
        kind: 'strobe',
        frame: swings[i],
        message: `More than ${MAX_FLASHES_PER_SECOND} light/dark flashes within a second at ${time(swings[i])} – strobing can trigger seizures`,
      });
      break;
    }
  }

  return warnings;
}
