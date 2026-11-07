import { drawTextBlock, textHeight, textWidth } from './font.ts';
import { createImage, parseColor } from './image.ts';
import type { Animation, Easing, Image, Layer, LayerProps, LayersScene, RGB } from './types.ts';

/** Pixel art with transparency; `originY` is how far the drawing starts above the layer's y. */
interface Bitmap {
  width: number;
  height: number;
  bodyHeight: number;
  originY: number;
  pixels: (RGB | null)[];
}

interface Resolved {
  x: number;
  y: number;
  opacity: number;
  color: RGB;
  sprite?: string;
  text?: string;
}

const NUMERIC = ['x', 'y', 'opacity'] as const;
const DISCRETE = ['sprite', 'text'] as const;
const DEFAULTS = { x: 0, y: 0, opacity: 1, color: '#ffffff' };
const ACCENT_ROWS = 2;
const OGONEK_ROWS = 1;

function ease(kind: Easing, p: number): number {
  switch (kind) {
    case 'linear':
      return p;
    case 'in':
      return p * p;
    case 'out':
      return 1 - (1 - p) * (1 - p);
    case 'in-out':
      return p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
    case 'step':
      return 0;
  }
}

interface Point<T> {
  t: number;
  v: T;
  ease?: Easing;
}

/** The layer's own value counts as a keyframe at t = 0. */
function track<K extends keyof LayerProps>(layer: Layer, key: K): Point<NonNullable<LayerProps[K]>>[] {
  const points: Point<NonNullable<LayerProps[K]>>[] = [];
  if (layer[key] !== undefined) points.push({ t: 0, v: layer[key]! });
  for (const kf of layer.keyframes ?? []) {
    if (kf[key] !== undefined) points.push({ t: kf.t, v: kf[key]!, ease: kf.ease });
  }
  return points.sort((a, b) => a.t - b.t);
}

function sample<T>(points: Point<T>[], t: number, lerp?: (a: T, b: T, p: number) => T): T | undefined {
  if (points.length === 0) return undefined;
  let i = points.length - 1;
  while (i > 0 && points[i].t > t) i--;
  const prev = points[i];
  if (prev.t > t) return prev.v;
  const next = points[i + 1];
  if (!next || !lerp) return prev.v;
  const p = (t - prev.t) / (next.t - prev.t);
  return lerp(prev.v, next.v, ease(next.ease ?? 'linear', p));
}

const lerpNumber = (a: number, b: number, p: number) => a + (b - a) * p;
const lerpColor = (a: string, b: string, p: number) => {
  const [ca, cb] = [parseColor(a), parseColor(b)];
  return '#' + ca.map((c, i) => Math.round(lerpNumber(c, cb[i], p)).toString(16).padStart(2, '0')).join('');
};

function resolver(layer: Layer): (t: number) => Resolved {
  const numeric = NUMERIC.map((key) => [key, track(layer, key)] as const);
  const discrete = DISCRETE.map((key) => [key, track(layer, key)] as const);
  const color = track(layer, 'color');
  return (t) => {
    const r: Resolved = { ...DEFAULTS, color: parseColor(sample(color, t, lerpColor) ?? DEFAULTS.color) };
    for (const [key, points] of numeric) r[key] = sample(points, t, lerpNumber) ?? DEFAULTS[key];
    for (const [key, points] of discrete) r[key] = sample(points, t);
    return r;
  };
}

function spriteBitmap(rows: string[], palette: Record<string, string>): Bitmap {
  const colors = Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, parseColor(v)]));
  const width = Math.max(...rows.map((r) => [...r].length));
  const pixels = rows.flatMap((row) => {
    const chars = [...row];
    return Array.from({ length: width }, (_, x) => (chars[x] && chars[x] !== '.' && chars[x] !== ' ' ? colors[chars[x]] : null));
  });
  return { width, height: rows.length, bodyHeight: rows.length, originY: 0, pixels };
}

function textBitmap(text: string, color: RGB): Bitmap {
  const width = textWidth(text);
  const bodyHeight = textHeight(text);
  const height = ACCENT_ROWS + bodyHeight + OGONEK_ROWS;
  const img = createImage(width, height);
  drawTextBlock(img, text, 0, ACCENT_ROWS, [255, 255, 255]);
  const pixels = Array.from({ length: width * height }, (_, i) => (img.data[i * 3] ? color : null));
  return { width, height, bodyHeight, originY: ACCENT_ROWS, pixels };
}

function rectBitmap([width, height]: [number, number], color: RGB): Bitmap {
  return { width, height, bodyHeight: height, originY: 0, pixels: Array(width * height).fill(color) };
}

function draw(target: Image, bmp: Bitmap, left: number, top: number, opacity: number): void {
  for (let by = 0; by < bmp.height; by++) {
    const y = top + by;
    if (y < 0 || y >= target.height) continue;
    for (let bx = 0; bx < bmp.width; bx++) {
      const x = left + bx;
      const c = bmp.pixels[by * bmp.width + bx];
      if (!c || x < 0 || x >= target.width) continue;
      const i = (y * target.width + x) * 3;
      for (let k = 0; k < 3; k++) target.data[i + k] = Math.round(target.data[i + k] * (1 - opacity) + c[k] * opacity);
    }
  }
}

export function layersRenderer(scene: LayersScene, anim: Animation, label: string): (local: number) => Image {
  const background = parseColor(scene.background ?? anim.background);
  const sprites = new Map<string, Bitmap>();
  const texts = new Map<string, Bitmap>();

  const spriteNamed = (name: string) => {
    if (!sprites.has(name)) {
      const def = anim.sprites[name];
      if (!def) throw new Error(`${label}: unknown sprite "${name}"`);
      sprites.set(name, spriteBitmap(def.rows, def.palette));
    }
    return sprites.get(name)!;
  };
  const textOf = (text: string, color: RGB) => {
    const key = `${color.join(',')}|${text}`;
    if (!texts.has(key)) texts.set(key, textBitmap(text, color));
    return texts.get(key)!;
  };

  for (const layer of scene.layers) {
    for (const name of track(layer, 'sprite').map((p) => p.v)) spriteNamed(name);
  }

  const layers = scene.layers.map((layer) => ({ layer, at: resolver(layer) }));

  return (local) => {
    const t = local / anim.fps;
    const img = createImage(anim.width, anim.height, background);
    for (const { layer, at } of layers) {
      if (t < (layer.from ?? 0) || t >= (layer.to ?? Infinity)) continue;
      const p = at(t);
      if (p.opacity <= 0) continue;
      const bmp = layer.rect
        ? rectBitmap(layer.rect, p.color)
        : p.sprite !== undefined
          ? spriteNamed(p.sprite)
          : p.text !== undefined
            ? textOf(p.text, p.color)
            : undefined;
      if (!bmp) continue;
      const centred = layer.anchor === 'center';
      const left = Math.round(centred ? p.x - bmp.width / 2 : p.x);
      const top = Math.round(centred ? p.y - bmp.bodyHeight / 2 : p.y);
      draw(img, bmp, left, top - bmp.originY, Math.min(1, p.opacity));
    }
    return img;
  };
}
