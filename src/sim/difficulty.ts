import { DIFFICULTY, WIND } from './constants';
import { clamp, lerp, smoothstep } from '@/utils/math';

export interface WindParams {
  baseAmp: number;
  draftAmp: number;
  crossAmp: number;
  /** Gusts per second. */
  gustRate: number;
  gustMag: number;
  /** 0..1 */
  turbAmp: number;
  /** Probability that a gust is a headwind. */
  headwindBias: number;
}

export function createWindParams(): WindParams {
  return { baseAmp: 0, draftAmp: 0, crossAmp: 0, gustRate: 0, gustMag: 0, turbAmp: 0, headwindBias: 0.5 };
}

export function progressFromDistance(distance: number): number {
  return clamp(distance / DIFFICULTY.fullDistance, 0, 1);
}

/** Fills `out` with the wind parameters for a progress value in [0, 1]. */
export function difficultyParams(progress: number, out: WindParams): WindParams {
  const p = clamp(progress, 0, 1);
  const ease = Math.pow(p, DIFFICULTY.ease);
  out.baseAmp = lerp(DIFFICULTY.baseAmp[0], DIFFICULTY.baseAmp[1], ease);
  out.draftAmp = lerp(DIFFICULTY.draftAmp[0], DIFFICULTY.draftAmp[1], ease);
  out.crossAmp = lerp(DIFFICULTY.crossAmp[0], DIFFICULTY.crossAmp[1], ease);
  out.gustRate = lerp(DIFFICULTY.gustRate[0], DIFFICULTY.gustRate[1], ease);
  out.gustMag = lerp(DIFFICULTY.gustMag[0], DIFFICULTY.gustMag[1], ease);
  out.turbAmp = smoothstep(DIFFICULTY.turbStart, 1, p);
  out.headwindBias = WIND.headwindBiasBase + WIND.headwindBiasGain * p;
  return out;
}
