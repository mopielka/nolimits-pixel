import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Image } from '../../src/core/index.ts';
import { HumanVisionShader } from './human-vision.ts';

const COLS = 28;
const ROWS = 16;
const TILE_M = 0.3;
const FLOOR_W = COLS * TILE_M;
const FLOOR_D = ROWS * TILE_M;
const FLOOR_Y = 0.05;
const ROOM = { w: 13, d: 9, h: 3.4 };

const TEX_TILE = 16;
const TEX_GAP = 1;
const UNLIT_TILE = '#0d0d11';
const GAP_COLOR = '#020203';

export const VIEWS = {
  top: 'Z góry · poziomo',
  'top-portrait': 'Z góry · pionowo',
  side: 'Z dłuższego boku (dół obrazu)',
  'side-far': 'Z dłuższego boku (góra obrazu)',
  'entrance-left': 'Od wejścia (lewy krótki bok)',
  'entrance-right': 'Od wejścia (prawy krótki bok)',
  free: 'Swobodnie (myszka)',
} as const;
export type ViewId = keyof typeof VIEWS;

export const FRAMINGS = {
  fill: 'Wypełnij obszar',
  human: 'Jak ludzki wzrok (owal, ostry środek)',
} as const;
export type Framing = keyof typeof FRAMINGS;

const FILL_VERTICAL_FOV = 55;
/**
 * Binocular vision spans ~200° × 135°; a flat screen can't show that without a fisheye, so the
 * human framing renders 120° across at about the field's proportions and lets the vision pass
 * shape, blur and fade it.
 */
const HUMAN = { aspect: 1.5, horizontalFov: 120 };

/** How far the head can turn from the view's resting direction, in radians. */
const HEAD = { yaw: THREE.MathUtils.degToRad(70), pitchUp: THREE.MathUtils.degToRad(35), pitchDown: THREE.MathUtils.degToRad(45) };

/**
 * Glow around lit tiles. three.js's bloom thresholds on perceived luminance, which weighs green
 * at 72 % and red at 21 %, so a full red tile never glowed while cyan and white did. Real LED
 * tiles in a dark room halo whenever a channel is driven hard, whatever its hue, so the threshold
 * is on the strongest channel (in linear light); white still glows most as all three add up.
 */
const BLOOM = { strength: 0.18, radius: 0.35, threshold: 0.35, softness: 0.4 };

const MAX_CHANNEL_HIGH_PASS = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec3 defaultColor;
  uniform float defaultOpacity;
  uniform float luminosityThreshold;
  uniform float smoothWidth;
  varying vec2 vUv;

  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    float drive = max(texel.r, max(texel.g, texel.b));
    float alpha = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, drive);
    gl_FragColor = mix(vec4(defaultColor, defaultOpacity), texel, alpha);
  }
`;

export interface ViewOptions {
  /** Viewer's eye height above the floor, metres. */
  eyeHeight: number;
  /** How far from the floor's edge the viewer stands, metres. */
  distance: number;
}

function noiseTexture(base: [number, number, number], spread: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = (Math.random() - 0.5) * spread;
    for (let c = 0; c < 3; c++) img.data[i * 4 + c] = base[c] + n;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Image rows map to depth: row 0 is the far side (−z) as seen from the "side" view. */
export class FloorScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly perspective = new THREE.PerspectiveCamera(FILL_VERTICAL_FOV, 1, 0.05, 50);
  private readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  private camera: THREE.Camera = this.perspective;
  private readonly controls: OrbitControls;
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloom: UnrealBloomPass;
  private readonly vision: ShaderPass;
  /** The view's resting direction (from placePerspective) and the head's turn away from it. */
  private readonly restLook = new THREE.Vector3();
  private readonly head = { yaw: 0, pitch: 0 };
  private readonly floorCtx: CanvasRenderingContext2D;
  private readonly floorTex: THREE.CanvasTexture;
  private readonly spill: THREE.RectAreaLight;
  private view: ViewId = 'side';
  private framing: Framing = 'fill';
  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    RectAreaLightUniformsLib.init();
    this.scene.background = new THREE.Color('#050507');

    const canvas = document.createElement('canvas');
    canvas.width = COLS * TEX_TILE;
    canvas.height = ROWS * TEX_TILE;
    this.floorCtx = canvas.getContext('2d')!;
    this.floorTex = new THREE.CanvasTexture(canvas);
    this.floorTex.colorSpace = THREE.SRGBColorSpace;
    this.floorTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.spill = new THREE.RectAreaLight('#000000', 0, FLOOR_W, FLOOR_D);
    this.spill.position.set(0, FLOOR_Y + 0.01, 0);
    this.spill.lookAt(0, 10, 0);
    this.scene.add(this.spill, new THREE.HemisphereLight('#3a3f55', '#0a0a0a', 0.6));

    this.buildRoom();

    this.controls = new OrbitControls(this.perspective, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.enabled = false;

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    // A tile glows according to how hard its LEDs are driven, not how bright the colour looks to the eye.
    this.bloom.materialHighPassFilter.uniforms.smoothWidth.value = BLOOM.softness;
    this.bloom.materialHighPassFilter.fragmentShader = MAX_CHANNEL_HIGH_PASS;
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.vision = new ShaderPass(HumanVisionShader);
    this.vision.enabled = false;
    this.composer.addPass(this.vision);
    this.composer.addPass(new OutputPass());

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  private buildRoom(): void {
    const wall = new THREE.MeshStandardMaterial({ map: noiseTexture([46, 47, 58], 12), roughness: 0.95 });
    wall.map!.repeat.set(4, 1.5);
    const ceiling = new THREE.MeshStandardMaterial({ color: '#0e0e12', roughness: 1 });
    const ground = new THREE.MeshStandardMaterial({ map: noiseTexture([22, 20, 19], 8), roughness: 0.7 });
    ground.map!.repeat.set(6, 4);
    const room = new THREE.Mesh(new THREE.BoxGeometry(ROOM.w, ROOM.h, ROOM.d), [wall, wall, ceiling, ground, wall, wall]);
    room.material.forEach((m) => (m.side = THREE.BackSide));
    room.position.y = ROOM.h / 2;
    this.scene.add(room);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(FLOOR_W + 0.1, FLOOR_Y, FLOOR_D + 0.1),
      new THREE.MeshStandardMaterial({ color: '#0b0b0d', roughness: 0.5, metalness: 0.6 }),
    );
    frame.position.y = FLOOR_Y / 2;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(FLOOR_W, FLOOR_D),
      new THREE.MeshBasicMaterial({ map: this.floorTex, toneMapped: false }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y + 0.001;
    this.scene.add(frame, floor);

    // A ballet barre along the far long wall.
    const wood = new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.55 });
    const barre = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, ROOM.w - 2, 16), wood);
    barre.rotation.z = Math.PI / 2;
    barre.position.set(0, 1.0, -ROOM.d / 2 + 0.15);
    this.scene.add(barre);
    for (let x = -ROOM.w / 2 + 1.2; x <= ROOM.w / 2 - 1.2; x += 2.6) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.15), new THREE.MeshStandardMaterial({ color: '#3a3a3a', metalness: 0.8 }));
      bracket.position.set(x, 1.0, -ROOM.d / 2 + 0.075);
      this.scene.add(bracket);
    }

    // The entrance on the left short wall, with an exit sign above it.
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.1), new THREE.MeshStandardMaterial({ color: '#25252c', roughness: 0.6 }));
    door.rotation.y = Math.PI / 2;
    door.position.set(-ROOM.w / 2 + 0.01, 1.05, 0);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.35), new THREE.MeshBasicMaterial({ color: '#1fbf4a' }));
    sign.position.set(-ROOM.w / 2 + 0.02, 2.35, 0);
    this.scene.add(door, sign);
  }

  setFrame(img: Image): void {
    const ctx = this.floorCtx;
    ctx.fillStyle = GAP_COLOR;
    ctx.fillRect(0, 0, COLS * TEX_TILE, ROWS * TEX_TILE);
    let r = 0;
    let g = 0;
    let b = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = (y * img.width + x) * 3;
        const [cr, cg, cb] = [img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0];
        r += cr;
        g += cg;
        b += cb;
        ctx.fillStyle = cr || cg || cb ? `rgb(${cr},${cg},${cb})` : UNLIT_TILE;
        ctx.fillRect(x * TEX_TILE + TEX_GAP, y * TEX_TILE + TEX_GAP, TEX_TILE - 2 * TEX_GAP, TEX_TILE - 2 * TEX_GAP);
      }
    }
    this.floorTex.needsUpdate = true;

    const n = COLS * ROWS * 255;
    const avg = new THREE.Color(r / n, g / n, b / n);
    const level = Math.max(avg.r, avg.g, avg.b);
    this.spill.color.copy(level > 0 ? avg.multiplyScalar(1 / level) : avg);
    this.spill.intensity = level * 14;
  }

  setFraming(framing: Framing): void {
    this.framing = framing;
    this.resize();
  }

  /**
   * Turns the head, each axis −1…1 as a fraction of a comfortable turn: x right, y down
   * (like screen coordinates, so a joystick or drag maps straight on).
   */
  setHead(x: number, y: number): void {
    x = THREE.MathUtils.clamp(x, -1, 1);
    y = THREE.MathUtils.clamp(y, -1, 1);
    this.head.yaw = -x * HEAD.yaw;
    this.head.pitch = -y * (y > 0 ? HEAD.pitchDown : HEAD.pitchUp);
    if (this.headTurns) this.aim();
  }

  get headTurns(): boolean {
    return this.view !== 'free' && !this.view.startsWith('top');
  }

  setBloom(enabled: boolean): void {
    this.bloom.enabled = enabled;
  }

  setView(view: ViewId, opts: ViewOptions): void {
    const leavingTop = this.view.startsWith('top');
    this.view = view;
    this.controls.enabled = view === 'free';
    if (view === 'top' || view === 'top-portrait') {
      this.ortho.position.set(0, 12, 0);
      // Portrait puts the right short side at the top, as seen from the left entrance.
      if (view === 'top') this.ortho.up.set(0, 0, -1);
      else this.ortho.up.set(1, 0, 0);
      this.ortho.lookAt(0, 0, 0);
      this.useCamera(this.ortho);
    } else {
      if (view !== 'free' || leavingTop) this.placePerspective(view === 'free' ? 'side' : view, opts);
      this.useCamera(this.perspective);
    }
    this.resize();
  }

  private placePerspective(view: ViewId, { eyeHeight, distance }: ViewOptions): void {
    const y = FLOOR_Y + eyeHeight;
    const c = this.perspective;
    c.up.set(0, 1, 0);
    const look = new THREE.Vector3();
    switch (view) {
      case 'side-far':
        c.position.set(0, y, -(FLOOR_D / 2 + distance));
        look.set(0, 0, 0.4);
        break;
      case 'entrance-left':
        c.position.set(-(FLOOR_W / 2 + distance), y, 0);
        look.set(1.2, 0, 0);
        break;
      case 'entrance-right':
        c.position.set(FLOOR_W / 2 + distance, y, 0);
        look.set(-1.2, 0, 0);
        break;
      default:
        c.position.set(0, y, FLOOR_D / 2 + distance);
        look.set(0, 0, -0.4);
    }
    this.restLook.copy(look);
    this.controls.target.copy(look);
    this.aim();
  }

  /** Points the camera along the resting direction turned by the head's yaw and pitch. */
  private aim(): void {
    const c = this.perspective;
    const dir = this.restLook.clone().sub(c.position).normalize();
    const pitch = Math.asin(dir.y) + this.head.pitch;
    const yaw = Math.atan2(dir.x, dir.z) + this.head.yaw;
    const clamped = THREE.MathUtils.clamp(pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    const turned = new THREE.Vector3(Math.sin(yaw) * Math.cos(clamped), Math.sin(clamped), Math.cos(yaw) * Math.cos(clamped));
    c.lookAt(c.position.clone().add(turned));
  }

  private useCamera(camera: THREE.Camera): void {
    this.camera = camera;
    this.renderPass.camera = camera;
  }

  private resize(): void {
    let { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    const human = this.framing === 'human' && !this.view.startsWith('top');
    if (human) {
      // Letterbox to the human proportions instead of stretching to the panel.
      [w, h] = w / h > HUMAN.aspect ? [h * HUMAN.aspect, h] : [w, w / HUMAN.aspect];
      [w, h] = [Math.floor(w), Math.floor(h)];
    }
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const aspect = w / h;
    this.perspective.aspect = aspect;
    this.perspective.fov = human
      ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(HUMAN.horizontalFov / 2)) / aspect))
      : FILL_VERTICAL_FOV;
    this.perspective.updateProjectionMatrix();
    this.vision.enabled = human;
    this.vision.uniforms.resolution.value.set(w, h);

    const margin = 0.5;
    const [fw, fd] = this.view === 'top-portrait' ? [FLOOR_D, FLOOR_W] : [FLOOR_W, FLOOR_D];
    const halfW = Math.max(fw / 2 + margin, (fd / 2 + margin) * aspect);
    const halfH = halfW / aspect;
    Object.assign(this.ortho, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    this.ortho.updateProjectionMatrix();
  }

  render(): void {
    if (this.controls.enabled) this.controls.update();
    this.composer.render();
  }
}
