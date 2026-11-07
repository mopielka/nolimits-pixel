import { FRAMINGS, FloorScene, VIEWS, type Framing, type ViewId } from './floor-scene.ts';
import { bundled, fromFile, type PlaybackSource } from './sources.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  source: $<HTMLSelectElement>('source'),
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
  scrub: $<HTMLInputElement>('scrub'),
  time: $('time'),
  scene: $('scene'),
  speed: $<HTMLSelectElement>('speed'),
  loop: $<HTMLInputElement>('loop'),
  drop: $('drop'),
};

const floor = new FloorScene($('stage'));

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

ui.play.onclick = () => setPlaying(!playing);
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

async function use(load: () => Promise<PlaybackSource>, label: string, keepTime = false) {
  setStatus(`Wczytuję ${label}…`);
  try {
    const next = await load();
    audio?.pause();
    if (source?.audio) URL.revokeObjectURL(source.audio.url);
    source = next;
    audio = next.audio ? new Audio(next.audio.url) : undefined;
    lastFrame = -1;
    ui.scrub.max = String(next.frameCount - 1);
    seek(keepTime ? (saved.time ?? 0) : 0);
    setStatus(`${next.title} · ${next.frameCount} klatek${next.audio ? ' · z muzyką' : ''}`);
    showWarnings(next);
  } catch (e) {
    setStatus((e as Error).message, true);
  }
}

for (const pkg of bundled) ui.source.append(new Option(pkg.id, pkg.id));
ui.source.append(new Option('— plik z dysku —', '', false, false));
ui.source.lastElementChild!.setAttribute('disabled', '');

ui.source.onchange = () => {
  const pkg = bundled.find((p) => p.id === ui.source.value);
  if (!pkg) return;
  save({ source: pkg.id, time: 0 });
  use(pkg.load, pkg.id);
};

async function openFile(file: File) {
  ui.source.value = '';
  await use(() => fromFile(file), file.name);
}
ui.file.onchange = () => ui.file.files?.[0] && openFile(ui.file.files[0]);

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
  const file = e.dataTransfer?.files[0];
  if (file) openFile(file);
});

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).matches('input[type=text], select')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    setPlaying(!playing);
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    setPlaying(false);
    seek((frameIndex() + (e.key === 'ArrowRight' ? 1 : -1)) / fps());
  } else if (/^[1-7]$/.test(e.key)) {
    setView(viewButtons[Number(e.key) - 1][0]);
  }
});

const initial = bundled.find((p) => p.id === saved.source) ?? bundled.find((p) => p.id === 'examples/layers') ?? bundled[0];
for (const [id, label] of Object.entries(FRAMINGS)) ui.framing.append(new Option(label, id));
ui.framing.value = saved.framing && saved.framing in FRAMINGS ? saved.framing : 'fill';
floor.setFraming(ui.framing.value as Framing);
onViewerChange();
setView(view);
if (initial) {
  ui.source.value = initial.id;
  save({ source: initial.id });
  use(initial.load, initial.id, true);
}
requestAnimationFrame(tick);
