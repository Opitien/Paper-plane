import { describe, expect, it } from 'vitest';
import { FrameProbe, stepTier } from '../quality';

describe('frame probe', () => {
  function feed(dt: number, seconds: number, probe: FrameProbe) {
    let verdict: ReturnType<FrameProbe['add']> = null;
    for (let t = 0; t < seconds; t += dt) {
      const v = probe.add(dt);
      if (v) verdict = v;
    }
    return verdict;
  }

  it('ignores the warm-up and returns a verdict once', () => {
    const probe = new FrameProbe(1, 2);
    expect(feed(1 / 60, 0.9, probe)).toBeNull();
    const probe2 = new FrameProbe(1, 2);
    expect(feed(1 / 60, 4, probe2)).toBe('keep');
    expect(probe2.add(1 / 60)).toBeNull();
  });

  it('steps down when frames are slow and up when very fast', () => {
    expect(feed(1 / 30, 4, new FrameProbe(1, 2))).toBe('down');
    expect(feed(1 / 144, 4, new FrameProbe(1, 2))).toBe('up');
  });

  it('clamps tier steps at the ends', () => {
    expect(stepTier('low', 'down')).toBe('low');
    expect(stepTier('high', 'up')).toBe('high');
    expect(stepTier('medium', 'down')).toBe('low');
    expect(stepTier('medium', 'up')).toBe('high');
    expect(stepTier('medium', 'keep')).toBe('medium');
  });
});
