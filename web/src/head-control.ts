/**
 * Turning the viewer's head: drag on the stage with the mouse, or use the on-screen joystick
 * on touch devices. Either way the head drifts back to looking straight ahead when released.
 */

/** Seconds for the head to come most of the way back to centre after letting go. */
const RETURN_SECONDS = 1.5;
/** Drag distance, as a fraction of the stage width, for a full turn. */
const DRAG_FULL_TURN = 0.6;

export interface HeadControl {
  /** Advances the return-to-centre and reports the current turn, −1…1 each axis (x right, y down). */
  update(dt: number): { x: number; y: number };
  setEnabled(enabled: boolean): void;
}

export function createHeadControl(stage: HTMLElement, joystick: HTMLElement): HeadControl {
  const knob = joystick.querySelector<HTMLElement>('.knob')!;
  let enabled = false;
  let x = 0;
  let y = 0;
  let held = false;

  const clamp = (v: number) => Math.max(-1, Math.min(1, v));

  // Mouse: hold and drag on the stage, like turning your head.
  let dragFrom: { px: number; py: number; x: number; y: number } | undefined;
  stage.addEventListener('pointerdown', (e) => {
    if (!enabled || e.pointerType !== 'mouse' || e.button !== 0) return;
    dragFrom = { px: e.clientX, py: e.clientY, x, y };
    held = true;
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('looking');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragFrom) return;
    const scale = stage.clientWidth * DRAG_FULL_TURN;
    x = clamp(dragFrom.x + (e.clientX - dragFrom.px) / scale);
    y = clamp(dragFrom.y + (e.clientY - dragFrom.py) / scale);
  });
  const endDrag = () => {
    dragFrom = undefined;
    held = false;
    stage.classList.remove('looking');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // Touch: a joystick knob within a ring.
  joystick.addEventListener('pointerdown', (e) => {
    if (!enabled) return;
    held = true;
    joystick.setPointerCapture(e.pointerId);
    moveKnob(e);
  });
  joystick.addEventListener('pointermove', (e) => held && moveKnob(e));
  const release = () => {
    held = false;
  };
  joystick.addEventListener('pointerup', release);
  joystick.addEventListener('pointercancel', release);

  function moveKnob(e: PointerEvent) {
    const r = joystick.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) [dx, dy] = [dx / len, dy / len];
    [x, y] = [dx, dy];
  }

  return {
    update(dt) {
      if (!held) {
        const keep = Math.exp(-dt / (RETURN_SECONDS / 3));
        x = Math.abs(x * keep) < 1e-3 ? 0 : x * keep;
        y = Math.abs(y * keep) < 1e-3 ? 0 : y * keep;
      }
      const radius = joystick.clientWidth / 2 - knob.clientWidth / 2;
      knob.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
      return { x, y };
    },
    setEnabled(on) {
      enabled = on;
      stage.classList.toggle('can-look', on);
      joystick.hidden = !on;
      if (!on) {
        endDrag();
        held = false;
        x = y = 0;
      }
    },
  };
}
