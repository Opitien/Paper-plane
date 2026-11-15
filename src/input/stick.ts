/**
 * Virtual stick maths, pure so it can be tested.
 * Screen space: x right, y down. Dragging up means climb.
 */
export interface StickAxes {
  roll: number;
  pitch: number;
  /** Clamped visual offset of the nub, pixels. */
  nubX: number;
  nubY: number;
}

export function stickAxes(dx: number, dy: number, radius: number, deadzone: number): StickAxes {
  const r = Math.hypot(dx, dy);
  if (r <= deadzone || radius <= deadzone) return { roll: 0, pitch: 0, nubX: dx, nubY: dy };
  const scaled = Math.min(1, (r - deadzone) / (radius - deadzone));
  const ux = dx / r;
  const uy = dy / r;
  const clampedR = Math.min(r, radius);
  return {
    roll: ux * scaled,
    pitch: -uy * scaled,
    nubX: ux * clampedR,
    nubY: uy * clampedR,
  };
}
