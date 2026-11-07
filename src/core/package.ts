import { unzipSync } from 'fflate';
import { fromRGBA } from './image.ts';
import { imagePaths, parseAnimation } from './parse.ts';
import type { ImageMap } from './render.ts';
import type { Animation } from './types.ts';

/** Package contents keyed by path relative to the package root. */
export type PackageFiles = Map<string, Uint8Array>;

export type PngDecoder = (bytes: Uint8Array) => Promise<{ width: number; height: number; rgba: ArrayLike<number> }>;

export interface LoadedPackage {
  animation: Animation;
  images: ImageMap;
  audio?: { path: string; bytes: Uint8Array };
}

export function unzipPackage(zip: Uint8Array): PackageFiles {
  const files: PackageFiles = new Map();
  for (const [path, bytes] of Object.entries(unzipSync(zip))) {
    if (!path.endsWith('/') && !path.startsWith('__MACOSX/')) files.set(path, bytes);
  }
  return files;
}

/** Strips a single wrapping folder when index.json isn't at the root. */
function rooted(files: PackageFiles): PackageFiles {
  if (files.has('index.json')) return files;
  const nested = [...files.keys()].filter((p) => /^[^/]+\/index\.json$/.test(p));
  if (nested.length !== 1) throw new Error('Package has no index.json at its root');
  const prefix = nested[0].slice(0, -'index.json'.length);
  return new Map(
    [...files].filter(([p]) => p.startsWith(prefix)).map(([p, bytes]) => [p.slice(prefix.length), bytes]),
  );
}

export async function readPackage(input: PackageFiles, decodePng: PngDecoder): Promise<LoadedPackage> {
  const files = rooted(input);
  const animation = parseAnimation(JSON.parse(new TextDecoder().decode(files.get('index.json'))));

  const images: ImageMap = new Map();
  for (const path of imagePaths(animation)) {
    const bytes = files.get(path);
    if (!bytes) throw new Error(`index.json references "${path}" but the package doesn't contain it`);
    const png = await decodePng(bytes);
    images.set(path, fromRGBA(png.width, png.height, png.rgba));
  }

  let audio: LoadedPackage['audio'];
  if (animation.audio) {
    const bytes = files.get(animation.audio.src);
    if (!bytes) throw new Error(`index.json references audio "${animation.audio.src}" but the package doesn't contain it`);
    audio = { path: animation.audio.src, bytes };
  }

  return { animation, images, audio };
}
