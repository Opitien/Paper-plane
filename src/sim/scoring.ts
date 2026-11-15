import type { CrashCause, FlightState } from './types';

export interface FlightResult {
  /** Metres. The primary score, including ring bonuses. */
  distance: number;
  /** Seconds. */
  time: number;
  maxAltitude: number;
  /** 0..1 mean stability over the flight. */
  performance: number;
  rings: number;
  cause: CrashCause;
}

export function summarizeFlight(s: FlightState): FlightResult {
  return {
    distance: s.distance,
    time: s.time,
    maxAltitude: s.maxAltitude,
    performance: s.time > 0 ? Math.min(1, Math.max(0, s.stabilityIntegral / s.time)) : 1,
    rings: s.ringsCollected,
    cause: s.crashCause,
  };
}

/** A result beats the record when it flew further. Ties keep the old record. */
export function isBetter(result: FlightResult, best: FlightResult | null): boolean {
  return best === null || result.distance > best.distance;
}
