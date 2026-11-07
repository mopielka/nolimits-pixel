import { setPixel } from './image.ts';
import type { Image, RGB } from './types.ts';

export const FONT_HEIGHT = 5;
const LETTER_SPACING = 1;
const SPACE_WIDTH = 3;

const GLYPHS: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.###', '#...', '#.##', '#..#', '.##.'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  Ł: ['.#..', '.##.', '##..', '.#..', '.###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.##.', '#..#', '#..#', '#.##', '.###'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#..#', '#..#', '#..#', '#..#', '.##.'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['.#.', '#.#', '#.#', '#.#', '.#.'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '##.', '#.#', '.#.'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['.#.', '#.#', '.#.', '#.#', '.#.'],
  '9': ['.#.', '#.#', '.##', '..#', '##.'],
  '.': ['.', '.', '.', '.', '#'],
  ',': ['.', '.', '.', '#', '#'],
  '!': ['#', '#', '#', '.', '#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  '-': ['...', '...', '###', '...', '...'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  ':': ['.', '#', '.', '#', '.'],
  "'": ['#', '#', '.', '.', '.'],
  '♥': ['.#.#.', '#####', '#####', '.###.', '..#..'],
};

const ACCENTED: Record<string, { base: string; mark: 'acute' | 'dot' | 'ogonek' }> = {
  Ą: { base: 'A', mark: 'ogonek' },
  Ć: { base: 'C', mark: 'acute' },
  Ę: { base: 'E', mark: 'ogonek' },
  Ń: { base: 'N', mark: 'acute' },
  Ó: { base: 'O', mark: 'acute' },
  Ś: { base: 'S', mark: 'acute' },
  Ź: { base: 'Z', mark: 'acute' },
  Ż: { base: 'Z', mark: 'dot' },
};

function normalise(ch: string): string {
  return ch === '❤' ? '♥' : ch.toUpperCase();
}

export function isSupported(ch: string): boolean {
  const c = normalise(ch);
  return c === ' ' || c === '\n' || c in GLYPHS || c in ACCENTED;
}

function glyphWidth(c: string): number {
  if (c === ' ') return SPACE_WIDTH;
  return GLYPHS[ACCENTED[c]?.base ?? c][0].length;
}

/** Leaves room for the next line's accents below the previous line's ogoneks. */
export const LINE_HEIGHT = FONT_HEIGHT + 3;

export function textWidth(text: string): number {
  return Math.max(...text.split('\n').map(lineWidth));
}

function lineWidth(line: string): number {
  const chars = [...line].map(normalise);
  if (chars.length === 0) return 0;
  return chars.reduce((w, c) => w + glyphWidth(c), 0) + LETTER_SPACING * (chars.length - 1);
}

/** Height of the letter bodies of a (possibly multi-line) text, excluding accents. */
export function textHeight(text: string): number {
  return (text.split('\n').length - 1) * LINE_HEIGHT + FONT_HEIGHT;
}

/** Draws text whose block starts at (x, y), centring each line within the widest one. */
export function drawTextBlock(img: Image, text: string, x: number, y: number, color: RGB): void {
  const block = textWidth(text);
  text.split('\n').forEach((line, i) => {
    drawText(img, line, x + Math.floor((block - lineWidth(line)) / 2), y + i * LINE_HEIGHT, color);
  });
}

/**
 * Draws text with its 5 px letter body starting at row `y`. Accents sit two
 * rows above (leaving a 1 px gap so they don't merge into the letter) and
 * ogoneks one row below.
 */
export function drawText(img: Image, text: string, x: number, y: number, color: RGB): void {
  let cx = x;
  for (const raw of text) {
    const c = normalise(raw);
    if (c !== ' ') {
      if (!isSupported(c)) throw new Error(`Unsupported character "${raw}" in text`);
      const accent = ACCENTED[c];
      const rows = GLYPHS[accent?.base ?? c];
      const w = rows[0].length;
      rows.forEach((row, ry) => {
        for (let rx = 0; rx < w; rx++) if (row[rx] === '#') setPixel(img, cx + rx, y + ry, color);
      });
      if (accent?.mark === 'acute') setPixel(img, cx + Math.ceil(w / 2), y - 2, color);
      if (accent?.mark === 'dot') setPixel(img, cx + Math.floor(w / 2), y - 2, color);
      if (accent?.mark === 'ogonek') setPixel(img, cx + w - 1, y + FONT_HEIGHT, color);
    }
    cx += glyphWidth(c) + LETTER_SPACING;
  }
}
