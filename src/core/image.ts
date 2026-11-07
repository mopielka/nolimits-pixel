import type { Image, RGB } from './types.ts';

export function createImage(width: number, height: number, fill: RGB = [0, 0, 0]): Image {
  const data = new Uint8ClampedArray(width * height * 3);
  if (fill.some((c) => c !== 0)) {
    for (let i = 0; i < data.length; i += 3) data.set(fill, i);
  }
  return { width, height, data };
}

export function setPixel(img: Image, x: number, y: number, color: RGB): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  img.data.set(color, (y * img.width + x) * 3);
}

export function parseColor(value: string): RGB {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) throw new Error(`Invalid colour "${value}" – use #rgb or #rrggbb`);
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
}

/** Composites RGBA onto black, matching how the floor treats transparency. */
export function fromRGBA(width: number, height: number, rgba: ArrayLike<number>): Image {
  const img = createImage(width, height);
  for (let p = 0; p < width * height; p++) {
    const a = rgba[p * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) img.data[p * 3 + c] = Math.round(rgba[p * 4 + c] * a);
  }
  return img;
}

export function toRGBA(img: Image): Uint8ClampedArray {
  const out = new Uint8ClampedArray(img.width * img.height * 4);
  for (let p = 0; p < img.width * img.height; p++) {
    out.set(img.data.subarray(p * 3, p * 3 + 3), p * 4);
    out[p * 4 + 3] = 255;
  }
  return out;
}

/**
 * Accepts an image at the target size or an exact integer multiple of it
 * (uniform blocks, e.g. 280 × 160), sampling each block's centre pixel.
 */
export function fitToCanvas(img: Image, width: number, height: number, label: string): Image {
  if (img.width === width && img.height === height) return img;
  const scale = img.width / width;
  if (!Number.isInteger(scale) || img.height !== height * scale) {
    throw new Error(
      `${label}: image is ${img.width}×${img.height}, expected ${width}×${height} or an exact multiple`,
    );
  }
  const out = createImage(width, height);
  const half = Math.floor(scale / 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = ((y * scale + half) * img.width + x * scale + half) * 3;
      out.data.set(img.data.subarray(src, src + 3), (y * width + x) * 3);
    }
  }
  return out;
}
