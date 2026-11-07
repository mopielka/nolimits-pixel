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

export type Scene = ColorScene | ImageScene | SequenceScene | PixelsScene | TextScene;

export interface Animation {
  version: 1;
  title?: string;
  width: number;
  height: number;
  fps: number;
  background: string;
  audio?: { src: string; offset?: number };
  scenes: Scene[];
}
