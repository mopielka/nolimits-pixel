// A short example of `layers` scenes built in code: `node examples/layers/generate.ts`
// writes index.json next to this file. Copy it as a starting point for animations
// with movement – the helpers are the useful part.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Animation, Keyframe, Layer, LayersScene, SpriteDef } from '../../src/core/types.ts';

const PINK = '#ff4fa3';
const CYAN = '#33e6ff';
const RED = '#ff1a2e';

const fadeIn = (at: number, length = 0.5): Keyframe[] => [
  { t: at, opacity: 0 },
  { t: at + length, opacity: 1 },
];
const fadeOut = (at: number, length = 0.5): Keyframe[] => [
  { t: at, opacity: 1 },
  { t: at + length, opacity: 0 },
];

/** Alternates two sprites to make a walk cycle. */
function walk(start: number, end: number, frames: [string, string], every = 0.2): Keyframe[] {
  const keys: Keyframe[] = [];
  for (let t = start, i = 0; t < end; t += every, i++) keys.push({ t, sprite: frames[i % 2] });
  return keys;
}

const flip = (rows: string[]) => rows.map((r) => [...r].reverse().join(''));

/** A tricolour cat seen from the side, facing right; legs differ between the two frames. */
const CAT_PALETTE = { w: '#ffffff', o: '#ff8c1a', k: '#5a5a5a', e: '#7dff4f', n: '#ff8fb8' };
const CAT_BODY = ['k...o.k', 'kowwwew', '.wkkwwn'];

const sprites: Record<string, SpriteDef> = {
  pink: { palette: { o: PINK }, rows: ['oo', 'oo'] },
  cyan: { palette: { o: CYAN }, rows: ['oo', 'oo'] },
  'heart-s': { palette: { r: RED }, rows: ['rr.rr', 'rrrrr', '.rrr.', '..r..'] },
  'heart-m': { palette: { r: RED }, rows: ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'] },
  'cat-a': { palette: CAT_PALETTE, rows: flip([...CAT_BODY, '.w..w..']) },
  'cat-b': { palette: CAT_PALETTE, rows: flip([...CAT_BODY, '..ww...']) },
};

/** Two dots meet in the middle, a heart grows and beats, a cat strolls past under a greeting. */
const scene: LayersScene = {
  type: 'layers',
  name: 'dots, heart, cat',
  duration: 10,
  layers: [
    { name: 'pink dot', sprite: 'pink', x: 1, y: 1, to: 3.2, keyframes: [...fadeIn(0), { t: 0.8, x: 1, y: 1 }, { t: 3, x: 12, y: 7, ease: 'in-out' }] },
    { name: 'cyan dot', sprite: 'cyan', x: 25, y: 13, to: 3.2, keyframes: [...fadeIn(0), { t: 0.8, x: 25, y: 13 }, { t: 3, x: 14, y: 7, ease: 'in-out' }] },
    {
      name: 'heart',
      sprite: 'heart-s',
      anchor: 'center',
      x: 14,
      y: 4,
      from: 3,
      keyframes: [
        { t: 3, y: 8 },
        { t: 4, y: 4, ease: 'out' },
        // Swapping sprites is how sizes change: pixel art doesn't scale smoothly.
        ...[4.2, 4.8, 5.4, 6, 6.6, 7.2, 7.8, 8.4].map((t, i): Keyframe => ({ t, sprite: i % 2 ? 'heart-s' : 'heart-m' })),
        ...fadeOut(9.3, 0.6),
      ],
    },
    { name: 'greeting', text: 'CZEŚĆ', color: CYAN, anchor: 'center', x: 14, y: 9.5, from: 4.5, keyframes: [...fadeIn(4.5), ...fadeOut(9.3, 0.6)] },
    {
      name: 'cat',
      sprite: 'cat-a',
      x: 29,
      y: 12,
      from: 5,
      keyframes: [{ t: 5, x: 29 }, { t: 9.5, x: -8 }, ...walk(5, 9.5, ['cat-a', 'cat-b'])],
    },
  ] satisfies Layer[],
};

const animation: Omit<Animation, 'width' | 'height' | 'fps' | 'background'> = {
  version: 1,
  title: 'Layers example',
  sprites,
  scenes: [scene],
};

writeFileSync(join(import.meta.dirname, 'index.json'), JSON.stringify(animation, null, 2) + '\n');
