import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { zipSync } from 'fflate';
import { PNG } from 'pngjs';
import { compile, lint, readPackage, toRGBA, unzipPackage, type AudioTrack, type Image, type PackageFiles } from '../core/index.ts';

const PREVIEW_SCALE = 20;
const TILE_GAP = 2;

function readDir(root: string): PackageFiles {
  const files: PackageFiles = new Map();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.set(relative(root, full).split('\\').join('/'), readFileSync(full));
    }
  };
  walk(root);
  return files;
}

function encodePng(img: Image): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(toRGBA(img));
  return PNG.sync.write(png, { colorType: 2 });
}

/**
 * The school starts the music with the first frame, so the delivered file is cut to
 * exactly the animation's length: trimmed, delayed by `offset`, faded, padded with silence.
 */
function renderAudio(source: string, target: string, audio: AudioTrack, duration: number) {
  const { start = 0, offset = 0, fadeIn = 0, fadeOut = 0 } = audio;
  const filters = [`adelay=${Math.round(offset * 1000)}:all=1`, 'apad'];
  if (fadeIn > 0) filters.push(`afade=t=in:st=${offset}:d=${fadeIn}`);
  if (fadeOut > 0) filters.push(`afade=t=out:st=${Math.max(0, duration - fadeOut)}:d=${fadeOut}`);
  const args = ['-y', '-loglevel', 'error', '-ss', String(start), '-i', source];
  args.push('-af', filters.join(','), '-t', String(duration), '-c:a', 'libmp3lame', '-b:a', '192k', target);
  const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`ffmpeg failed to render ${basename(target)}`);
}

function hasFfmpeg(): boolean {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', default: 'out' },
      'no-preview': { type: 'boolean', default: false },
    },
  });
  if (positionals.length !== 1) {
    console.error('Usage: npm run build -- <package dir or .zip> [--out out] [--no-preview]');
    process.exit(2);
  }

  return build(resolve(positionals[0]), resolve(values.out), !values['no-preview']);
}

async function build(input: string, outRoot: string, preview: boolean) {
  const isZip = statSync(input).isFile();
  const name = basename(input, isZip ? extname(input) : '');
  const files = isZip ? unzipPackage(readFileSync(input)) : readDir(input);

  const pkg = await readPackage(files, async (bytes) => {
    const png = PNG.sync.read(Buffer.from(bytes));
    return { width: png.width, height: png.height, rgba: png.data };
  });
  const anim = compile(pkg.animation, pkg.images);

  const outDir = join(outRoot, name);
  const framesDir = join(outDir, 'klatki');
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  const zipEntries: Record<string, Uint8Array> = {};
  for (let f = 0; f < anim.frameCount; f++) {
    const fileName = `klatka_${String(f + 1).padStart(4, '0')}.png`;
    const png = encodePng(anim.renderFrame(f));
    writeFileSync(join(framesDir, fileName), png);
    zipEntries[fileName] = png;
  }
  writeFileSync(join(outDir, `${name}.zip`), zipSync(zipEntries, { level: 0 }));

  const duration = anim.frameCount / anim.fps;
  const ffmpeg = hasFfmpeg();
  let audioPath: string | undefined;
  if (pkg.audio) {
    const source = join(outDir, `source-${basename(pkg.audio.path)}`);
    writeFileSync(source, pkg.audio.bytes);
    if (ffmpeg) {
      audioPath = join(outDir, `${basename(pkg.audio.path, extname(pkg.audio.path))}.mp3`);
      renderAudio(source, audioPath, pkg.animation.audio!, duration);
      rmSync(source);
    } else {
      audioPath = source;
      console.warn('  ⚠ ffmpeg not found – music copied as is, not trimmed to the animation (brew install ffmpeg)');
    }
  }

  console.log(`${name}: ${anim.frameCount} frames = ${duration.toFixed(2)} s @ ${anim.fps} fps`);
  for (const w of lint(anim)) console.warn(`  ⚠ ${w.kind}: ${w.message}`);

  if (!preview) return;
  if (!ffmpeg) {
    console.warn('  ⚠ ffmpeg not found – skipping preview.mp4 (brew install ffmpeg)');
    return;
  }
  const w = anim.width * PREVIEW_SCALE;
  const h = anim.height * PREVIEW_SCALE;
  const scale = `scale=${w}:${h}:flags=neighbor`;
  // drawgrid only draws each cell's top/left edge, so pad to close the right/bottom border.
  const tileGaps = `drawgrid=w=${PREVIEW_SCALE}:h=${PREVIEW_SCALE}:t=${TILE_GAP}:c=black,pad=${w + TILE_GAP}:${h + TILE_GAP}:0:0:black`;
  renderPreview(join(outDir, 'preview.mp4'), scale);
  renderPreview(join(outDir, 'preview-floor.mp4'), `${scale},${tileGaps}`);

  function renderPreview(file: string, filters: string) {
    const args = ['-y', '-loglevel', 'error', '-framerate', String(anim.fps), '-i', join(framesDir, 'klatka_%04d.png')];
    if (audioPath) args.push('-i', audioPath, '-shortest');
    args.push('-vf', filters, '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', file);
    const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`ffmpeg failed to render ${basename(file)}`);
  }
}

main()?.catch((e: Error) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
