export type QualityTier = 'high' | 'medium' | 'low';

export interface TierSettings {
  dprCap: number;
  /** Multiplier on the baseline cloud and particle counts. */
  cloudScale: number;
  antialias: boolean;
}

export const TIER_SETTINGS: Record<QualityTier, TierSettings> = {
  high: { dprCap: 2, cloudScale: 1.7, antialias: true },
  medium: { dprCap: 1.5, cloudScale: 1, antialias: true },
  low: { dprCap: 1, cloudScale: 0.45, antialias: false },
};

const TIERS: QualityTier[] = ['low', 'medium', 'high'];

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Cheap launch-time heuristic. The frame-time probe (`FrameProbe`) can then
 * step the tier up or down once the scene is actually rendering.
 */
export function detectQualityTier(): QualityTier {
  if (typeof navigator === 'undefined') return 'medium';
  const mobile = isMobileDevice();
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (mobile && (cores <= 4 || memory <= 4)) return 'low';
  return 'medium';
}

export type ProbeVerdict = 'up' | 'down' | 'keep';

export function stepTier(tier: QualityTier, verdict: ProbeVerdict): QualityTier {
  const i = TIERS.indexOf(tier);
  if (verdict === 'down') return TIERS[Math.max(0, i - 1)];
  if (verdict === 'up') return TIERS[Math.min(TIERS.length - 1, i + 1)];
  return tier;
}

/**
 * Measures the average frame time over a window after a warm-up and returns
 * a verdict once. Pure, so it is unit tested; the scene feeds it frame deltas.
 */
export class FrameProbe {
  private elapsed = 0;
  private sampled = 0;
  private frames = 0;
  done = false;

  constructor(
    private readonly warmupSeconds = 1,
    private readonly windowSeconds = 2,
    /** Average frame time above this steps the tier down. */
    private readonly slowThreshold = 0.02,
    /** Average frame time below this steps the tier up. */
    private readonly fastThreshold = 0.009,
  ) {}

  /** Returns a verdict exactly once, when the window completes; otherwise null. */
  add(dt: number): ProbeVerdict | null {
    if (this.done) return null;
    this.elapsed += dt;
    if (this.elapsed < this.warmupSeconds) return null;
    this.sampled += dt;
    this.frames += 1;
    if (this.elapsed < this.warmupSeconds + this.windowSeconds) return null;
    this.done = true;
    const avg = this.sampled / Math.max(1, this.frames);
    if (avg > this.slowThreshold) return 'down';
    if (avg < this.fastThreshold) return 'up';
    return 'keep';
  }
}
