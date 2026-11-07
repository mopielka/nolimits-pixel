import { FRAMINGS, FloorScene, VIEWS, type Framing, type ViewId } from './floor-scene.ts';
import { createHeadControl } from './head-control.ts';
import { reloadIfStale } from './fresh.ts';
import {
  canRead,
  canWatchFolders,
  filesFromDirectoryInput,
  filesFromEntry,
  packagesInFiles,
  packagesInHandle,
  rememberFolder,
  rememberedFolder,
  type FolderPackage,
} from './local-folder.ts';
import { bundled, fromLocalFiles, type PlaybackSource } from './sources.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  source: $<HTMLSelectElement>('source'),
  openFolder: $<HTMLButtonElement>('open-folder'),
  folderInput: $<HTMLInputElement>('folder-input'),
  resume: $<HTMLButtonElement>('resume'),
  file: $<HTMLInputElement>('file'),
  status: $('status'),
  views: $('views'),
  eye: $<HTMLInputElement>('eye'),
  eyeOut: $<HTMLOutputElement>('eye-out'),
  dist: $<HTMLInputElement>('dist'),
  distOut: $<HTMLOutputElement>('dist-out'),
  bloom: $<HTMLInputElement>('bloom'),
  framing: $<HTMLSelectElement>('framing'),
  warnings: $('warnings'),
  play: $<HTMLButtonElement>('play'),
  restart: $<HTMLButtonElement>('restart'),
  scrub: $<HTMLInputElement>('scrub'),
  time: $('time'),
  scene: $('scene'),
  speed: $<HTMLSelectElement>('speed'),
  loop: $<HTMLInputElement>('loop'),
  drop: $('drop'),
};

const floor = new FloorScene($('stage'));
const head = createHeadControl($('stage'), $('joystick'));

/** Remembered across reloads so editing an animation keeps your place. */
const saved = (() => {
  try {
    return JSON.parse(sessionStorage.getItem('pixel-player') ?? '{}') as {
      source?: string;
      view?: ViewId;
      framing?: Framing;
      time?: number;
    };
  } catch {
    return {};
  }
})();
function save(patch: Partial<typeof saved>) {
  Object.assign(saved, patch);
  try {
    sessionStorage.setItem('pixel-player', JSON.stringify(saved));
  } catch {
    // Storage unavailable (private mode) – nothing to remember.
  }
}

let source: PlaybackSource | undefined;
let audio: HTMLAudioElement | undefined;
let view: ViewId = saved.view && saved.view in VIEWS ? saved.view : 'side';
let time = 0;
let playing = false;
let lastFrame = -1;

const frameCount = () => source?.frameCount ?? 1;
const fps = () => source?.fps ?? 25;
const frameIndex = () => Math.min(frameCount() - 1, Math.floor(time * fps()));

function setStatus(text: string, error = false) {
  ui.status.textContent = text;
  ui.status.classList.toggle('error', error);
}

// --- views -----------------------------------------------------------------

const viewButtons = (Object.keys(VIEWS) as ViewId[]).map((id, i) => {
  const b = document.createElement('button');
  b.textContent = `${i + 1}. ${VIEWS[id]}`;
  b.onclick = () => setView(id);
  ui.views.append(b);
  return [id, b] as const;
});

function viewOptions() {
  return { eyeHeight: Number(ui.eye.value), distance: Number(ui.dist.value) };
}

function setView(id: ViewId) {
  view = id;
  save({ view });
  for (const [vid, b] of viewButtons) b.setAttribute('aria-pressed', String(vid === id));
  // The mouse drives the free camera and top views have no viewer, so the viewer controls don't apply.
  const viewerFixed = id === 'free' || id.startsWith('top');
  ui.eye.disabled = ui.dist.disabled = viewerFixed;
  ui.framing.disabled = id.startsWith('top');
  floor.setView(id, viewOptions());
  head.setEnabled(floor.headTurns);
}

ui.framing.onchange = () => {
  const framing = ui.framing.value as Framing;
  save({ framing });
  floor.setFraming(framing);
};

function onViewerChange() {
  ui.eyeOut.textContent = `${Number(ui.eye.value).toFixed(2)} m`;
  ui.distOut.textContent = `${Number(ui.dist.value).toFixed(1)} m`;
  if (view !== 'free' && !view.startsWith('top')) floor.setView(view, viewOptions());
}
ui.eye.oninput = ui.dist.oninput = onViewerChange;
ui.bloom.onchange = () => floor.setBloom(ui.bloom.checked);

// --- playback --------------------------------------------------------------

function setPlaying(on: boolean) {
  playing = on;
  ui.play.textContent = on ? '❚❚' : '▶';
  ui.play.setAttribute('aria-label', on ? 'Pauza' : 'Odtwórz');
  if (!on) audio?.pause();
  syncAudio(true);
}

/** Keeps the music on the animation clock, with the same trim and fades the build applies. */
function syncAudio(force = false) {
  if (!audio || !source?.audio) return;
  const { offset, start, fadeIn, fadeOut } = source.audio;
  const end = source.frameCount / source.fps;
  const target = time - offset + start;
  if (!playing || time < offset) {
    if (!audio.paused) audio.pause();
    if (force && time < offset) audio.currentTime = start;
    return;
  }
  const rampIn = fadeIn > 0 ? (time - offset) / fadeIn : 1;
  const rampOut = fadeOut > 0 ? (end - time) / fadeOut : 1;
  audio.volume = Math.max(0, Math.min(1, rampIn, rampOut));
  audio.playbackRate = Number(ui.speed.value);
  if (force || Math.abs(audio.currentTime - target) > 0.15) audio.currentTime = target;
  if (audio.paused) audio.play().catch(() => setStatus('Kliknij ▶, żeby włączyć dźwięk'));
}

function seek(t: number) {
  time = Math.max(0, Math.min(t, (frameCount() - 1) / fps()));
  syncAudio(true);
}

const atEnd = () => frameIndex() >= frameCount() - 1;

function restart() {
  seek(0);
  setPlaying(true);
}

// Play at the last frame starts over instead of stopping straight away.
ui.play.onclick = () => (!playing && atEnd() ? restart() : setPlaying(!playing));
ui.restart.onclick = restart;
ui.scrub.oninput = () => seek(Number(ui.scrub.value) / fps());
ui.speed.onchange = () => syncAudio(true);

function showFrame() {
  if (!source) return;
  const i = frameIndex();
  if (i !== lastFrame) {
    floor.setFrame(source.frameAt(i));
    lastFrame = i;
    ui.scrub.value = String(i);
    ui.time.textContent = `${time.toFixed(2)} s / ${(source.frameCount / source.fps).toFixed(2)} s · klatka ${i + 1}/${source.frameCount}`;
    ui.scene.textContent = source.sceneAt(i) ?? '';
  }
}

let previous = performance.now();
function tick(now: number) {
  const dt = (now - previous) / 1000;
  previous = now;
  if (playing && source) {
    time += dt * Number(ui.speed.value);
    const end = source.frameCount / source.fps;
    if (time >= end) {
      if (ui.loop.checked) seek(0);
      else {
        time = end - 1 / source.fps;
        setPlaying(false);
      }
    }
    syncAudio();
    save({ time });
  }
  showFrame();
  const turn = head.update(dt);
  if (floor.headTurns) floor.setHead(turn.x, turn.y);
  floor.render();
  requestAnimationFrame(tick);
}

// --- loading ---------------------------------------------------------------

function showWarnings(src: PlaybackSource) {
  ui.warnings.replaceChildren();
  if (!src.lint) return;
  setTimeout(() => {
    if (source !== src) return;
    const warnings = src.lint!();
    const items = warnings.length
      ? warnings.map((w) => Object.assign(document.createElement('li'), { textContent: w.message }))
      : [Object.assign(document.createElement('li'), { textContent: 'Brak – kolory, biel i miganie w normie.', className: 'ok' })];
    ui.warnings.replaceChildren(...items);
  }, 50);
}

async function use(load: () => Promise<PlaybackSource>, label: string, at = 0, quiet = false): Promise<boolean> {
  if (!quiet) setStatus(`Wczytuję ${label}…`);
  try {
    const next = await load();
    audio?.pause();
    if (source?.audio) URL.revokeObjectURL(source.audio.url);
    source = next;
    audio = next.audio ? new Audio(next.audio.url) : undefined;
    lastFrame = -1;
    ui.scrub.max = String(next.frameCount - 1);
    seek(at);
    setStatus(`${next.title} · ${next.frameCount} klatek${next.audio ? ' · z muzyką' : ''}${watched ? ' · ● na żywo' : ''}`);
    showWarnings(next);
    return true;
  } catch (e) {
    setStatus((e as Error).message, true);
    return false;
  }
}

// --- local folders -------------------------------------------------------------

const FOLDER = 'folder:';
let folderPackages: FolderPackage[] = [];
/** The open folder animation, re-read whenever its files change. */
let watched: { pkg: FolderPackage; signature: string } | undefined;

const readFolder = (pkg: FolderPackage) => async () => fromLocalFiles(await pkg.read(), pkg.name);

async function openFolderPackage(index: number, at = 0) {
  const pkg = folderPackages[index];
  ui.source.value = FOLDER + index;
  save({ source: FOLDER + pkg.name });
  const signature = await pkg.signature?.();
  watched = signature === undefined ? undefined : { pkg, signature };
  await use(readFolder(pkg), pkg.name, at);
}

async function openFolder(rootName: string, packages: FolderPackage[]) {
  if (packages.length === 0) {
    setStatus(`W folderze „${rootName}” nie ma index.json (ani w jego podfolderach)`, true);
    return;
  }
  folderPackages = packages;
  ui.source.querySelector('optgroup.folder')?.remove();
  const group = Object.assign(document.createElement('optgroup'), { label: `📁 ${rootName}`, className: 'folder' });
  packages.forEach((p, i) => group.append(new Option(p.name, FOLDER + i)));
  ui.source.prepend(group);
  const wanted = saved.source?.startsWith(FOLDER) ? saved.source.slice(FOLDER.length) : undefined;
  const index = Math.max(0, packages.findIndex((p) => p.name === wanted));
  await openFolderPackage(index, packages[index].name === wanted ? (saved.time ?? 0) : 0);
}

async function openFolderHandle(handle: FileSystemDirectoryHandle) {
  rememberFolder(handle);
  ui.resume.hidden = true;
  await openFolder(handle.name, await packagesInHandle(handle));
}

async function openFiles(files: File[]) {
  if (files.length === 0) return;
  watched = undefined;
  ui.source.value = '';
  const title = files[0].name.replace(/\.[^.]+$/, '');
  await use(() => fromLocalFiles(files.map((file) => ({ path: file.name, file })), title), files[0].name);
}

let checking = false;
setInterval(async () => {
  if (!watched?.pkg.signature || checking) return;
  checking = true;
  const current = watched;
  try {
    const signature = await current.pkg.signature!();
    // Only accept the new state once it loads – a half-written index.json is retried next tick.
    if (signature !== current.signature && (await use(readFolder(current.pkg), current.pkg.name, time, true))) {
      current.signature = signature;
    }
  } catch {
    watched = undefined;
    setStatus('Brak dostępu do folderu – otwórz go ponownie', true);
  } finally {
    checking = false;
  }
}, 1000);

ui.openFolder.onclick = async () => {
  if (!canWatchFolders) return ui.folderInput.click();
  try {
    await openFolderHandle(await window.showDirectoryPicker!({ id: 'pixel-animations', mode: 'read' }));
  } catch (e) {
    if ((e as Error).name !== 'AbortError') setStatus((e as Error).message, true);
  }
};
ui.folderInput.onchange = () => {
  if (!ui.folderInput.files?.length) return;
  const { rootName, files } = filesFromDirectoryInput(ui.folderInput.files);
  openFolder(rootName, packagesInFiles(rootName, files));
};
ui.file.onchange = () => openFiles([...(ui.file.files ?? [])]);
if (!canWatchFolders) ui.openFolder.title = 'Podgląd na żywo po zapisaniu plików działa w Chrome i Edge';

// --- bundled packages and the source list ----------------------------------

for (const pkg of bundled) ui.source.append(new Option(pkg.id, pkg.id));

ui.source.onchange = () => {
  const value = ui.source.value;
  if (value.startsWith(FOLDER)) return void openFolderPackage(Number(value.slice(FOLDER.length)));
  const pkg = bundled.find((p) => p.id === value);
  if (!pkg) return;
  watched = undefined;
  save({ source: pkg.id, time: 0 });
  use(pkg.load, pkg.id);
};

// --- drag and drop ---------------------------------------------------------

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  ui.drop.hidden = false;
});
window.addEventListener('dragleave', () => {
  if (--dragDepth === 0) ui.drop.hidden = true;
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  ui.drop.hidden = true;
  // Both APIs only work while the event is being handled, so grab everything up front.
  const items = [...(e.dataTransfer?.items ?? [])].filter((item) => item.kind === 'file');
  const files = [...(e.dataTransfer?.files ?? [])];
  if (items[0]?.getAsFileSystemHandle) {
    const handles = items.map((item) => item.getAsFileSystemHandle!());
    Promise.all(handles).then(async (all) => {
      const dir = all.find((h) => h?.kind === 'directory');
      if (dir) return openFolderHandle(dir as FileSystemDirectoryHandle);
      return openFiles(await Promise.all(all.filter((h) => h?.kind === 'file').map((h) => (h as FileSystemFileHandle).getFile())));
    });
    return;
  }
  const dir = items.map((item) => item.webkitGetAsEntry()).find((entry) => entry?.isDirectory) as FileSystemDirectoryEntry | undefined;
  if (dir) filesFromEntry(dir).then((all) => openFolder(dir.name, packagesInFiles(dir.name, all)));
  else openFiles(files);
});

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).matches('input[type=text], select')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    ui.play.click();
  } else if (e.key === 'Home') {
    e.preventDefault();
    restart();
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    setPlaying(false);
    seek((frameIndex() + (e.key === 'ArrowRight' ? 1 : -1)) / fps());
  } else if (/^[1-7]$/.test(e.key)) {
    setView(viewButtons[Number(e.key) - 1][0]);
  }
});

for (const [id, label] of Object.entries(FRAMINGS)) ui.framing.append(new Option(label, id));
ui.framing.value = saved.framing && saved.framing in FRAMINGS ? saved.framing : 'fill';
floor.setFraming(ui.framing.value as Framing);
onViewerChange();
setView(view);

async function start() {
  const remembered = canWatchFolders ? await rememberedFolder() : undefined;
  if (remembered) {
    ui.resume.textContent = `📁 Wznów: ${remembered.name}`;
    ui.resume.hidden = false;
    ui.resume.onclick = async () => {
      if (await canRead(remembered, true)) await openFolderHandle(remembered);
    };
    if (saved.source?.startsWith(FOLDER) && (await canRead(remembered, false))) return openFolderHandle(remembered);
  }
  const initial = bundled.find((p) => p.id === saved.source) ?? bundled.find((p) => p.id === 'examples/layers') ?? bundled[0];
  if (!initial) return;
  ui.source.value = initial.id;
  const at = saved.source === initial.id ? (saved.time ?? 0) : 0;
  save({ source: initial.id });
  await use(initial.load, initial.id, at);
}
reloadIfStale();
start();
requestAnimationFrame(tick);
