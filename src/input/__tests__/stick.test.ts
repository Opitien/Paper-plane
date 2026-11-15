import { describe, expect, it } from 'vitest';
import { stickAxes } from '../stick';

describe('virtual stick', () => {
  it('ignores movement inside the deadzone', () => {
    const a = stickAxes(5, -5, 60, 10);
    expect(a.roll).toBe(0);
    expect(a.pitch).toBe(0);
  });

  it('maps drag up to climb and drag right to roll right, saturating at the radius', () => {
    const up = stickAxes(0, -60, 60, 10);
    expect(up.pitch).toBeCloseTo(1);
    expect(up.roll).toBeCloseTo(0);
    const right = stickAxes(200, 0, 60, 10);
    expect(right.roll).toBeCloseTo(1);
    expect(right.nubX).toBe(60);
  });

  it('scales smoothly between deadzone and radius', () => {
    const half = stickAxes(35, 0, 60, 10);
    expect(half.roll).toBeCloseTo(0.5);
  });
});
