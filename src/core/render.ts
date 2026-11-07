import { drawTextBlock, textHeight, textWidth } from './font.ts';
import { createImage, fitToCanvas, parseColor, setPixel } from './image.ts';
import { layersRenderer } from './layers.ts';
import type { Animation, Image, Scene, TransitionType } from './types.ts';

export interface CompiledScene {
  scene: Scene;
  start: number;
  frames: number;
  transition: TransitionType;
  transitionFrames: number;
  render(local: number): Image;
}

export interface CompiledAnimation {
  animation: Animation;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  scenes: CompiledScene[];
  renderFrame(index: number): Image;
}

/** Decoded package images keyed by their path in index.json. */
export type ImageMap = Map<string, Image>;

interface SceneRenderer {
  naturalFrames?: number;
  render(local: number): Image;
}

function constant(img: Image): SceneRenderer {
  return { render: () => img };
}

function sceneRenderer(scene: Scene, anim: Animation, images: ImageMap, label: string): SceneRenderer {
  const { width: W, height: H, fps } = anim;
  const loadImage = (src: string) => {
    const img = images.get(src);
    if (!img) throw new Error(`${label}: missing image "${src}" in the package`);
    return fitToCanvas(img, W, H, `${label} "${src}"`);
  };

  switch (scene.type) {
    case 'color':
      return constant(createImage(W, H, parseColor(scene.color)));

    case 'image':
      return constant(loadImage(scene.src));

    case 'pixels': {
      if (scene.rows.length !== H) throw new Error(`${label}: "rows" must have ${H} rows, got ${scene.rows.length}`);
      const palette = Object.fromEntries(Object.entries(scene.palette).map(([k, v]) => [k, parseColor(v)]));
      const img = createImage(W, H);
      scene.rows.forEach((row, y) => {
        const chars = [...row];
        if (chars.length !== W) throw new Error(`${label}: row ${y} must be ${W} characters, got ${chars.length}`);
        chars.forEach((ch, x) => {
          if (ch === '.' || ch === ' ') return;
          if (!palette[ch]) throw new Error(`${label}: row ${y} uses "${ch}" which is not in the palette`);
          setPixel(img, x, y, palette[ch]);
        });
      });
      return constant(img);
    }

    case 'sequence': {
      const frames = scene.src.map(loadImage);
      const hold = scene.frameFrames ?? Math.max(1, Math.round((scene.frameDuration ?? 1 / fps) * fps));
      return {
        naturalFrames: frames.length * hold,
        render: (local) => frames[Math.floor(local / hold) % frames.length],
      };
    }

    case 'text': {
      const color = parseColor(scene.color ?? '#ffffff');
      const background = parseColor(scene.background ?? '#000000');
      const y = scene.y ?? Math.floor((H - textHeight(scene.text)) / 2);
      const tw = textWidth(scene.text);
      if (scene.scroll === false) {
        const img = createImage(W, H, background);
        drawTextBlock(img, scene.text, Math.floor((W - tw) / 2), y, color);
        return constant(img);
      }
      const fpp = scene.framesPerPixel ?? 4;
      // From the first column showing at the right edge to the last column at the left edge.
      return {
        naturalFrames: (W + tw - 1) * fpp,
        render: (local) => {
          const img = createImage(W, H, background);
          drawTextBlock(img, scene.text, W - 1 - Math.floor(local / fpp), y, color);
          return img;
        },
      };
    }

    case 'layers':
      return { render: layersRenderer(scene, anim, label) };
  }
}

function blend(type: TransitionType, from: Image, to: Image, p: number): Image {
  const { width: W, height: H } = to;
  const out = createImage(W, H);
  const copy = (src: Image, sx: number, sy: number, dx: number, dy: number) => {
    const s = (sy * W + sx) * 3;
    out.data.set(src.data.subarray(s, s + 3), (dy * W + dx) * 3);
  };
  const dx = Math.round(p * W);
  const dy = Math.round(p * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      switch (type) {
        case 'cut':
          copy(to, x, y, x, y);
          break;
        case 'fade': {
          const i = (y * W + x) * 3;
          for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(from.data[i + c] * (1 - p) + to.data[i + c] * p);
          break;
        }
        case 'slide-left':
          x + dx < W ? copy(from, x + dx, y, x, y) : copy(to, x + dx - W, y, x, y);
          break;
        case 'slide-right':
          x - dx >= 0 ? copy(from, x - dx, y, x, y) : copy(to, x - dx + W, y, x, y);
          break;
        case 'slide-up':
          y + dy < H ? copy(from, x, y + dy, x, y) : copy(to, x, y + dy - H, x, y);
          break;
        case 'slide-down':
          y - dy >= 0 ? copy(from, x, y - dy, x, y) : copy(to, x, y - dy + H, x, y);
          break;
        case 'wipe-left':
          copy(x >= W - dx ? to : from, x, y, x, y);
          break;
        case 'wipe-right':
          copy(x < dx ? to : from, x, y, x, y);
          break;
        case 'wipe-up':
          copy(y >= H - dy ? to : from, x, y, x, y);
          break;
        case 'wipe-down':
          copy(y < dy ? to : from, x, y, x, y);
          break;
      }
    }
  }
  return out;
}

export function compile(animation: Animation, images: ImageMap = new Map()): CompiledAnimation {
  const { width, height, fps } = animation;
  let start = 0;
  const scenes: CompiledScene[] = animation.scenes.map((scene, i) => {
    const label = `scene ${i + 1}${scene.name ? ` (${scene.name})` : ''}`;
    const renderer = sceneRenderer(scene, animation, images, label);
    const frames =
      scene.frames ??
      (scene.duration !== undefined ? Math.max(1, Math.round(scene.duration * fps)) : renderer.naturalFrames!);
    const transition = scene.transition?.type ?? 'cut';
    const transitionFrames = Math.min(frames, Math.round((scene.transition?.duration ?? 0) * fps));
    const compiled = { scene, start, frames, transition, transitionFrames, render: renderer.render };
    start += frames;
    return compiled;
  });

  const background = createImage(width, height, parseColor(animation.background));

  const renderFrame = (index: number): Image => {
    if (index < 0 || index >= start) throw new RangeError(`Frame ${index} is outside 0..${start - 1}`);
    let k = scenes.length - 1;
    while (scenes[k].start > index) k--;
    const current = scenes[k];
    const local = index - current.start;
    const frame = current.render(local);
    if (local >= current.transitionFrames || current.transition === 'cut') return frame;
    const prev = k > 0 ? scenes[k - 1].render(scenes[k - 1].frames - 1) : background;
    return blend(current.transition, prev, frame, (local + 1) / (current.transitionFrames + 1));
  };

  return { animation, width, height, fps, frameCount: start, scenes, renderFrame };
}
