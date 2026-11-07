import { isSupported } from './font.ts';
import { parseColor } from './image.ts';
import { TRANSITION_TYPES, type Animation, type Scene, type Transition } from './types.ts';

type Json = Record<string, unknown>;

class FormatError extends Error {
  constructor(path: string, message: string) {
    super(`index.json ${path}: ${message}`);
  }
}

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function optNumber(obj: Json, key: string, path: string, opts: { int?: boolean; min?: number } = {}) {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new FormatError(`${path}.${key}`, 'must be a number');
  if (opts.int && !Number.isInteger(v)) throw new FormatError(`${path}.${key}`, 'must be a whole number');
  if (opts.min !== undefined && v < opts.min) throw new FormatError(`${path}.${key}`, `must be ≥ ${opts.min}`);
  return v;
}

function reqString(obj: Json, key: string, path: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v === '') throw new FormatError(`${path}.${key}`, 'must be a non-empty string');
  return v;
}

function optColor(obj: Json, key: string, path: string): string | undefined {
  if (obj[key] === undefined) return undefined;
  const v = reqString(obj, key, path);
  try {
    parseColor(v);
  } catch (e) {
    throw new FormatError(`${path}.${key}`, (e as Error).message);
  }
  return v;
}

function parseTransition(v: unknown, path: string): Transition | undefined {
  if (v === undefined) return undefined;
  if (!isObject(v)) throw new FormatError(path, 'must be an object');
  const type = v.type;
  if (!TRANSITION_TYPES.includes(type as Transition['type'])) {
    throw new FormatError(`${path}.type`, `must be one of ${TRANSITION_TYPES.join(', ')}`);
  }
  const duration = optNumber(v, 'duration', path, { min: 0 }) ?? 0;
  return { type: type as Transition['type'], duration };
}

function parseScene(v: unknown, path: string): Scene {
  if (!isObject(v)) throw new FormatError(path, 'must be an object');
  const base = {
    name: typeof v.name === 'string' ? v.name : undefined,
    duration: optNumber(v, 'duration', path, { min: 0 }),
    frames: optNumber(v, 'frames', path, { int: true, min: 1 }),
    transition: parseTransition(v.transition, `${path}.transition`),
  };
  if (base.duration !== undefined && base.frames !== undefined) {
    throw new FormatError(path, 'set either "duration" or "frames", not both');
  }
  const needsLength = () => {
    if (base.duration === undefined && base.frames === undefined) {
      throw new FormatError(path, `a "${v.type}" scene needs "duration" or "frames"`);
    }
  };

  switch (v.type) {
    case 'color':
      needsLength();
      return { ...base, type: 'color', color: optColor(v, 'color', path) ?? reqString(v, 'color', path) };
    case 'image':
      needsLength();
      return { ...base, type: 'image', src: reqString(v, 'src', path) };
    case 'sequence': {
      if (!Array.isArray(v.src) || v.src.length === 0 || v.src.some((s) => typeof s !== 'string')) {
        throw new FormatError(`${path}.src`, 'must be a non-empty array of file paths');
      }
      const frameDuration = optNumber(v, 'frameDuration', path, { min: 0 });
      const frameFrames = optNumber(v, 'frameFrames', path, { int: true, min: 1 });
      if (frameDuration !== undefined && frameFrames !== undefined) {
        throw new FormatError(path, 'set either "frameDuration" or "frameFrames", not both');
      }
      return { ...base, type: 'sequence', src: v.src as string[], frameDuration, frameFrames };
    }
    case 'pixels': {
      needsLength();
      if (!isObject(v.palette)) throw new FormatError(`${path}.palette`, 'must be an object');
      const palette: Record<string, string> = {};
      for (const [key, color] of Object.entries(v.palette)) {
        if ([...key].length !== 1) throw new FormatError(`${path}.palette`, `key "${key}" must be one character`);
        palette[key] = optColor(v.palette, key, `${path}.palette`)!;
      }
      if (!Array.isArray(v.rows) || v.rows.some((r) => typeof r !== 'string')) {
        throw new FormatError(`${path}.rows`, 'must be an array of strings');
      }
      return { ...base, type: 'pixels', palette, rows: v.rows as string[] };
    }
    case 'text': {
      const text = reqString(v, 'text', path);
      const bad = [...text].find((c) => !isSupported(c));
      if (bad) throw new FormatError(`${path}.text`, `unsupported character "${bad}"`);
      if (v.scroll !== undefined && typeof v.scroll !== 'boolean') {
        throw new FormatError(`${path}.scroll`, 'must be true or false');
      }
      if (v.scroll === false) needsLength();
      return {
        ...base,
        type: 'text',
        text,
        color: optColor(v, 'color', path),
        background: optColor(v, 'background', path),
        y: optNumber(v, 'y', path, { int: true }),
        scroll: v.scroll as boolean | undefined,
        framesPerPixel: optNumber(v, 'framesPerPixel', path, { int: true, min: 1 }),
      };
    }
    default:
      throw new FormatError(`${path}.type`, 'must be one of color, image, sequence, pixels, text');
  }
}

export function parseAnimation(json: unknown): Animation {
  if (!isObject(json)) throw new FormatError('', 'must be a JSON object');
  if (json.version !== 1) throw new FormatError('.version', 'must be 1');
  if (!Array.isArray(json.scenes) || json.scenes.length === 0) {
    throw new FormatError('.scenes', 'must be a non-empty array');
  }
  let audio: Animation['audio'];
  if (json.audio !== undefined) {
    if (!isObject(json.audio)) throw new FormatError('.audio', 'must be an object');
    audio = { src: reqString(json.audio, 'src', '.audio'), offset: optNumber(json.audio, 'offset', '.audio') };
  }
  return {
    version: 1,
    title: typeof json.title === 'string' ? json.title : undefined,
    width: optNumber(json, 'width', '', { int: true, min: 1 }) ?? 28,
    height: optNumber(json, 'height', '', { int: true, min: 1 }) ?? 16,
    fps: optNumber(json, 'fps', '', { min: 1 }) ?? 25,
    background: optColor(json, 'background', '') ?? '#000000',
    audio,
    scenes: json.scenes.map((s, i) => parseScene(s, `.scenes[${i}]`)),
  };
}

/** Every package file the animation references, for loaders to fetch and decode. */
export function imagePaths(animation: Animation): string[] {
  const paths = animation.scenes.flatMap((s) =>
    s.type === 'image' ? [s.src] : s.type === 'sequence' ? s.src : [],
  );
  return [...new Set(paths)];
}
