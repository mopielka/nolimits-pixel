import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { zipSync } from 'fflate';
import { PNG } from 'pngjs';
import { compile, lint, readPackage, toRGBA, unzipPackage, type Image, type PackageFiles } from '../core/index.ts';

const PREVIEW_SCALE = 20;

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

  let audioPath: string | undefined;
  if (pkg.audio) {
    audioPath = join(outDir, basename(pkg.audio.path));
    writeFileSync(audioPath, pkg.audio.bytes);
  }

  console.log(`${name}: ${anim.frameCount} frames = ${(anim.frameCount / anim.fps).toFixed(2)} s @ ${anim.fps} fps`);
  for (const w of lint(anim)) console.warn(`  ⚠ ${w.kind}: ${w.message}`);

  if (!preview) return;
  if (!hasFfmpeg()) {
    console.warn('  ⚠ ffmpeg not found – skipping preview.mp4 (brew install ffmpeg)');
    return;
  }
  const w = anim.width * PREVIEW_SCALE;
  const h = anim.height * PREVIEW_SCALE;
  const args = ['-y', '-loglevel', 'error', '-framerate', String(anim.fps), '-i', join(framesDir, 'klatka_%04d.png')];
  if (audioPath) args.push('-itsoffset', String(pkg.animation.audio?.offset ?? 0), '-i', audioPath, '-shortest');
  args.push(
    '-vf', `scale=${w}:${h}:flags=neighbor`,
    '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p',
    join(outDir, 'preview.mp4'),
  );
  const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('ffmpeg failed to render preview.mp4');
}

main()?.catch((e: Error) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
