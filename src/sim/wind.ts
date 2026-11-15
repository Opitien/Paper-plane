import { WIND } from './constants';
import type { WindParams } from './difficulty';
import { noise1 } from './noise';
import type { Rng } from './rng';
import type { WindState } from './types';
import { smoothstep } from '@/utils/math';

/**
 * Dynamic wind: slow noise-driven base channels, discrete gust events with a
 * smooth envelope, and a turbulence amplitude. Deterministic for a seed.
 */
export class WindSystem {
  private seedH = 1;
  private seedV = 2;
  private seedC = 3;
  private seedT = 4;

  private gustActive = false;
  private gustStart = 0;
  private gustAttack = 0;
  private gustHold = 0;
  private gustDecay = 0;
  private gustMagH = 0;
  private gustMagV = 0;
  private nextGustAt = 0;

  reset(rng: Rng): void {
    this.seedH = Math.floor(rng.next() * 1e6);
    this.seedV = Math.floor(rng.next() * 1e6);
    this.seedC = Math.floor(rng.next() * 1e6);
    this.seedT = Math.floor(rng.next() * 1e6);
    this.gustActive = false;
    this.nextGustAt = rng.range(WIND.firstGustWindow[0], WIND.firstGustWindow[1]);
  }

  /** Current gust envelope, 0..1. */
  get gustEnvelope(): number {
    return this.envelopeAt(this.lastTime);
  }
  private lastTime = 0;

  update(t: number, params: WindParams, rng: Rng, out: WindState): void {
    this.lastTime = t;
    out.horizontal = params.baseAmp * noise1(t * WIND.baseFreq, this.seedH);
    out.vertical = params.draftAmp * noise1(t * WIND.draftFreq, this.seedV);
    out.cross = params.crossAmp * noise1(t * WIND.crossFreq, this.seedC);
    out.turbulence = params.turbAmp * (0.5 + 0.5 * noise1(t * WIND.turbFreq, this.seedT));

    if (!this.gustActive && t >= this.nextGustAt && params.gustRate > 0) {
      this.startGust(t, params, rng);
    }

    let env = 0;
    if (this.gustActive) {
      env = this.envelopeAt(t);
      if (t - this.gustStart >= this.gustAttack + this.gustHold + this.gustDecay) {
        this.gustActive = false;
        env = 0;
        // Poisson gap, never shorter than the minimum interval.
        const gap = -Math.log(1 - rng.next()) / params.gustRate;
        this.nextGustAt = t + Math.max(WIND.gustMinInterval, gap);
      }
    }

    out.horizontal += this.gustMagH * env;
    out.vertical += this.gustMagV * env;
    out.gust = (env * Math.abs(this.gustMagH)) / WIND.gustReference;
  }

  private startGust(t: number, params: WindParams, rng: Rng): void {
    const magnitude = params.gustMag * (0.6 + 0.4 * rng.next());
    const headwind = rng.next() < params.headwindBias;
    this.gustMagH = headwind ? -magnitude : magnitude;
    this.gustMagV = magnitude * WIND.gustVerticalFraction * (rng.next() < 0.5 ? -1 : 1);
    this.gustAttack = rng.range(WIND.gustAttack[0], WIND.gustAttack[1]);
    this.gustHold = rng.range(WIND.gustHold[0], WIND.gustHold[1]);
    this.gustDecay = rng.range(WIND.gustDecay[0], WIND.gustDecay[1]);
    this.gustStart = t;
    this.gustActive = true;
  }

  private envelopeAt(t: number): number {
    if (!this.gustActive) return 0;
    const tau = t - this.gustStart;
    if (tau < this.gustAttack) return smoothstep(0, this.gustAttack, tau);
    if (tau < this.gustAttack + this.gustHold) return 1;
    return 1 - smoothstep(0, this.gustDecay, tau - this.gustAttack - this.gustHold);
  }
}
