import { FIXED_DT, MAX_FRAME_DT } from './constants';

/**
 * Fixed-step accumulator. Feed it wall-clock frame deltas; it runs `step`
 * exactly as many fixed steps as have elapsed and returns the interpolation
 * factor for rendering. Pure, so the frame-rate independence test can drive
 * it with arbitrary cadences.
 */
export class FixedStepper {
  accumulator = 0;

  reset(): void {
    this.accumulator = 0;
  }

  /** Returns alpha in [0, 1): how far into the next step the render time is. */
  advance(frameDt: number, step: (dt: number) => void): number {
    this.accumulator += Math.min(Math.max(frameDt, 0), MAX_FRAME_DT);
    while (this.accumulator >= FIXED_DT) {
      step(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }
    return this.accumulator / FIXED_DT;
  }
}
