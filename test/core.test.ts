import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zipSync } from 'fflate';
import {
  compile,
  createImage,
  lint,
  parseAnimation,
  readPackage,
  textWidth,
  unzipPackage,
  type Image,
} from '../src/core/index.ts';

const pixel = (img: Image, x: number, y: number) => [...img.data.subarray((y * img.width + x) * 3, (y * img.width + x) * 3 + 3)];

const anim = (scenes: unknown[], extra: object = {}) => parseAnimation({ version: 1, scenes, ...extra });

test('scene durations become frame ranges at 25 fps', () => {
  const c = compile(anim([
    { type: 'color', color: '#ff0000', duration: 2 },
    { type: 'color', color: '#00ff00', frames: 7 },
  ]));
  assert.equal(c.frameCount, 57);
  assert.deepEqual(pixel(c.renderFrame(49), 0, 0), [255, 0, 0]);
  assert.deepEqual(pixel(c.renderFrame(50), 0, 0), [0, 255, 0]);
});

test('fade blends from the background into the first scene', () => {
  const c = compile(anim([{ type: 'color', color: '#ffffff', duration: 1, transition: { type: 'fade', duration: 0.12 } }]));
  const levels = [0, 1, 2, 3].map((f) => pixel(c.renderFrame(f), 0, 0)[0]);
  assert.deepEqual(levels, [64, 128, 191, 255]);
});

test('slide-left pushes the old scene out to the left', () => {
  const c = compile(anim([
    { type: 'color', color: '#ff0000', frames: 1 },
    { type: 'color', color: '#0000ff', frames: 10, transition: { type: 'slide-left', duration: 0.12 } },
  ]));
  const mid = c.renderFrame(2);
  assert.deepEqual(pixel(mid, 0, 0), [255, 0, 0]);
  assert.deepEqual(pixel(mid, 27, 0), [0, 0, 255]);
});

test('scrolling text enters at the right edge and ends at the left edge', () => {
  const c = compile(anim([{ type: 'text', text: 'HI', framesPerPixel: 3 }]));
  assert.equal(c.frameCount, (28 + textWidth('HI') - 1) * 3);
  const first = c.renderFrame(0);
  const last = c.renderFrame(c.frameCount - 1);
  assert.deepEqual(pixel(first, 27, 5), [255, 255, 255], "H's left column at the right edge");
  assert.deepEqual(pixel(first, 26, 5), [0, 0, 0]);
  assert.deepEqual(pixel(last, 0, 5), [255, 255, 255], "I's right column at the left edge");
  assert.deepEqual(pixel(last, 1, 5), [0, 0, 0]);
});

test('sequence loops its frames to fill the duration', () => {
  const red = createImage(28, 16, [255, 0, 0]);
  const blue = createImage(56, 32, [0, 0, 255]);
  const c = compile(
    anim([{ type: 'sequence', src: ['a.png', 'b.png'], frameFrames: 2, frames: 6 }]),
    new Map([['a.png', red], ['b.png', blue]]),
  );
  const colours = [0, 1, 2, 3, 4, 5].map((f) => pixel(c.renderFrame(f), 3, 3)[0]);
  assert.deepEqual(colours, [255, 255, 0, 0, 255, 255]);
});

test('images that are not a multiple of 28×16 are rejected', () => {
  assert.throws(
    () => compile(anim([{ type: 'image', src: 'x.png', frames: 1 }]), new Map([['x.png', createImage(30, 16)]])),
    /expected 28×16/,
  );
});

test('invalid index.json reports the offending path', () => {
  assert.throws(() => anim([{ type: 'color', color: 'red', frames: 1 }]), /scenes\[0\]\.color/);
  assert.throws(() => anim([{ type: 'text', text: 'ŻÓŁW~' }]), /unsupported character "~"/);
});

test('lint flags strobing, long white and too-dark pixels', () => {
  const strobe = Array.from({ length: 10 }, (_, i) => ({ type: 'color', color: i % 2 ? '#000' : '#fff', frames: 2 }));
  const kinds = (scenes: unknown[]) => lint(compile(anim(scenes))).map((w) => w.kind);
  assert.deepEqual(kinds(strobe), ['strobe']);
  assert.deepEqual(kinds([{ type: 'color', color: '#ffffff', duration: 4 }]), ['white']);
  assert.deepEqual(kinds([{ type: 'color', color: '#202020', duration: 1 }]), ['dark']);
  assert.deepEqual(kinds([{ type: 'color', color: '#ff0000', duration: 4 }]), []);
});

test('packages zipped inside a folder are read from that folder', async () => {
  const index = new TextEncoder().encode(JSON.stringify({ version: 1, scenes: [{ type: 'color', color: '#f00', frames: 1 }] }));
  const files = unzipPackage(zipSync({ 'my-anim/index.json': index }));
  const pkg = await readPackage(files, async () => assert.fail('no images to decode'));
  assert.equal(pkg.animation.scenes.length, 1);
});

test('multi-line text centres each line and the block', () => {
  const c = compile(anim([{ type: 'text', text: 'KOCHAM\nCIĘ', scroll: false, frames: 1 }]));
  const img = c.renderFrame(0);
  assert.deepEqual(pixel(img, 1, 1), [255, 255, 255], 'K starts at x=1, y=1');
  assert.deepEqual(pixel(img, 8, 10), [255, 255, 255], 'C of the second line starts at x=8, y=9');
  assert.deepEqual(pixel(img, 18, 14), [255, 255, 255], 'Ę ogonek below the second line');
});

test('layer keyframes interpolate position with easing and switch sprites', () => {
  const c = compile(
    anim(
      [
        {
          type: 'layers',
          duration: 2,
          layers: [
            {
              sprite: 'dot',
              x: 0,
              y: 0,
              keyframes: [
                { t: 1, x: 20, ease: 'linear' },
                { t: 1.5, sprite: 'big' },
              ],
            },
          ],
        },
      ],
      { sprites: { dot: { palette: { o: '#ff0000' }, rows: ['o'] }, big: { palette: { o: '#00ff00' }, rows: ['oo', 'oo'] } } },
    ),
  );
  assert.deepEqual(pixel(c.renderFrame(0), 0, 0), [255, 0, 0]);
  assert.deepEqual(pixel(c.renderFrame(12), 10, 0), [255, 0, 0], 'halfway at t=0.48 s → x≈10');
  assert.deepEqual(pixel(c.renderFrame(30), 20, 0), [255, 0, 0], 'holds after the last x keyframe');
  assert.deepEqual(pixel(c.renderFrame(40), 21, 1), [0, 255, 0], 'sprite switched at t=1.5 s');
});

test('centred layers with opacity blend over what is below', () => {
  const c = compile(
    anim([
      {
        type: 'layers',
        frames: 1,
        background: '#000000',
        layers: [
          { rect: [28, 16], color: '#0000ff' },
          { rect: [2, 2], color: '#ff0000', x: 14, y: 8, anchor: 'center', opacity: 0.5 },
        ],
      },
    ]),
  );
  const img = c.renderFrame(0);
  assert.deepEqual(pixel(img, 13, 7), [128, 0, 128]);
  assert.deepEqual(pixel(img, 12, 7), [0, 0, 255]);
});

test('layers reject unknown sprites', () => {
  assert.throws(
    () => compile(anim([{ type: 'layers', frames: 1, layers: [{ sprite: 'nope' }] }])),
    /unknown sprite "nope"/,
  );
});
