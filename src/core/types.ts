export type RGB = [number, number, number];

/** Row-major RGB pixels, 3 bytes per pixel. */
export interface Image {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export const TRANSITION_TYPES = [
  'cut',
  'fade',
  'slide-left',
  'slide-right',
  'slide-up',
  'slide-down',
  'wipe-left',
  'wipe-right',
  'wipe-up',
  'wipe-down',
] as const;

export type TransitionType = (typeof TRANSITION_TYPES)[number];

export interface Transition {
  type: TransitionType;
  duration: number;
}

interface SceneBase {
  name?: string;
  duration?: number;
  frames?: number;
  transition?: Transition;
}

export interface ColorScene extends SceneBase {
  type: 'color';
  color: string;
}

export interface ImageScene extends SceneBase {
  type: 'image';
  src: string;
}

export interface SequenceScene extends SceneBase {
  type: 'sequence';
  src: string[];
  frameDuration?: number;
  frameFrames?: number;
}

export interface PixelsScene extends SceneBase {
  type: 'pixels';
  palette: Record<string, string>;
  rows: string[];
}

export interface TextScene extends SceneBase {
  type: 'text';
  text: string;
  color?: string;
  background?: string;
  y?: number;
  scroll?: boolean;
  framesPerPixel?: number;
}

export const EASINGS = ['linear', 'in', 'out', 'in-out', 'step'] as const;
export type Easing = (typeof EASINGS)[number];

/** Layer properties that keyframes can change; numbers and colours interpolate, the rest switch. */
export interface LayerProps {
  x?: number;
  y?: number;
  opacity?: number;
  color?: string;
  sprite?: string;
  text?: string;
}

export interface Keyframe extends LayerProps {
  /** Seconds from the start of the scene. */
  t: number;
  /** How the change from the previous keyframe to this one is paced. */
  ease?: Easing;
}

export interface Layer extends LayerProps {
  name?: string;
  rect?: [number, number];
  anchor?: 'top-left' | 'center';
  /** Seconds from the start of the scene when the layer appears / disappears. */
  from?: number;
  to?: number;
  keyframes?: Keyframe[];
}

export interface LayersScene extends SceneBase {
  type: 'layers';
  background?: string;
  layers: Layer[];
}

export interface SpriteDef {
  palette: Record<string, string>;
  rows: string[];
}

export type Scene = ColorScene | ImageScene | SequenceScene | PixelsScene | TextScene | LayersScene;

export interface Animation {
  version: 1;
  title?: string;
  width: number;
  height: number;
  fps: number;
  background: string;
  audio?: { src: string; offset?: number };
  /** Reusable pixel art for `layers` scenes, keyed by name. */
  sprites: Record<string, SpriteDef>;
  scenes: Scene[];
}
