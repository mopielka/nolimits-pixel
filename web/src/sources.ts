import {
  compile,
  fromRGBA,
  lint,
  readPackage,
  unzipPackage,
  type Image,
  type LintWarning,
  type PackageFiles,
} from '../../src/core/index.ts';

/** Anything the player can show: a compiled animation package or a delivered frames ZIP. */
export interface PlaybackSource {
  title: string;
  fps: number;
  frameCount: number;
  frameAt(index: number): Image;
  sceneAt(index: number): string | undefined;
  audio?: { url: string; offset: number; start: number; fadeIn: number; fadeOut: number };
  lint?(): LintWarning[];
}

export interface BundledPackage {
  id: string;
  load(): Promise<PlaybackSource>;
}

async function decodePng(bytes: Uint8Array) {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, height: bitmap.height, rgba: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
}

const AUDIO_TYPES: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4' };

export async function fromPackage(files: PackageFiles, title: string): Promise<PlaybackSource> {
  const pkg = await readPackage(files, decodePng);
  const anim = compile(pkg.animation, pkg.images);
  let audio: PlaybackSource['audio'];
  if (pkg.audio) {
    const type = AUDIO_TYPES[pkg.audio.path.split('.').pop()!.toLowerCase()] ?? 'audio/mpeg';
    const { offset = 0, start = 0, fadeIn = 0, fadeOut = 0 } = pkg.animation.audio!;
    audio = { url: URL.createObjectURL(new Blob([pkg.audio.bytes as BlobPart], { type })), offset, start, fadeIn, fadeOut };
  }
  return {
    title: pkg.animation.title ?? title,
    fps: anim.fps,
    frameCount: anim.frameCount,
    frameAt: anim.renderFrame,
    sceneAt: (i) => {
      const s = [...anim.scenes].reverse().find((s) => s.start <= i);
      return s?.scene.name ?? s?.scene.type;
    },
    audio,
    lint: () => lint(anim),
  };
}

const AUDIO_FILE = /\.(mp3|wav|ogg|m4a)$/i;

/**
 * Rendered frames (the ZIP we send to the school) played at 25 fps, with the build's
 * music file if it came along – it's already trimmed and faded to the animation.
 */
async function fromFrames(files: PackageFiles, title: string): Promise<PlaybackSource> {
  const names = [...files.keys()].filter((p) => /\.png$/i.test(p)).sort();
  if (names.length === 0) throw new Error('Brak index.json i klatek PNG – otwórz folder animacji albo jej ZIP');
  const frames = await Promise.all(
    names.map(async (n) => {
      const png = await decodePng(files.get(n)!);
      return fromRGBA(png.width, png.height, png.rgba);
    }),
  );
  const music = [...files.keys()].find((p) => AUDIO_FILE.test(p));
  const type = music && (AUDIO_TYPES[music.split('.').pop()!.toLowerCase()] ?? 'audio/mpeg');
  return {
    title,
    fps: 25,
    frameCount: frames.length,
    frameAt: (i) => frames[i],
    sceneAt: () => `gotowe klatki${music ? '' : ' (bez muzyki – dorzuć plik MP3)'}`,
    audio: music
      ? { url: URL.createObjectURL(new Blob([files.get(music)! as BlobPart], { type })), offset: 0, start: 0, fadeIn: 0, fadeOut: 0 }
      : undefined,
  };
}

/** A file with its path inside whatever folder or selection it came from. */
export interface LocalFile {
  path: string;
  file: File;
}

/**
 * Plays whatever the user hands over: an animation folder, its ZIP, a bare index.json,
 * or rendered frames with or without their music. ZIPs are unpacked alongside loose files.
 */
export async function fromLocalFiles(entries: LocalFile[], title: string): Promise<PlaybackSource> {
  const files: PackageFiles = new Map();
  for (const { path, file } of entries) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(path)) for (const [p, b] of unzipPackage(bytes)) files.set(p, b);
    else if (entries.length === 1 && /\.json$/i.test(path)) files.set('index.json', bytes);
    else files.set(path, bytes);
  }
  const hasIndex = [...files.keys()].some((p) => /^([^/]+\/)?index\.json$/.test(p));
  return hasIndex ? fromPackage(files, title) : fromFrames(files, title);
}

const indexes = import.meta.glob<string>('../../{animations,examples}/*/index.json', { query: '?raw', import: 'default' });
const assets = import.meta.glob<string>('../../{animations,examples}/*/**/*.{png,mp3,wav,ogg,m4a}', {
  query: '?url',
  import: 'default',
});

/** Packages in this repo, refreshed by Vite whenever their files change. */
export const bundled: BundledPackage[] = Object.keys(indexes)
  .sort()
  .map((indexPath) => {
    const dir = indexPath.slice(0, -'index.json'.length);
    const id = dir.split('/').slice(-3, -1).join('/');
    return {
      id,
      async load() {
        const files: PackageFiles = new Map([['index.json', new TextEncoder().encode(await indexes[indexPath]())]]);
        for (const [path, url] of Object.entries(assets)) {
          if (!path.startsWith(dir)) continue;
          const bytes = new Uint8Array(await (await fetch(await url())).arrayBuffer());
          files.set(path.slice(dir.length), bytes);
        }
        return fromPackage(files, id);
      },
    };
  });
