/**
 * The live, mutable simulation shared between the frame loop, the scene and
 * the HUD publisher. Nothing here is React state.
 */

import { Simulation } from '@/sim/simulation';
import { createFlightState, type FlightState } from '@/sim/types';
import { lerp } from '@/utils/math';

export const simulation = new Simulation();

/**
 * Interpolated copy of the sim state for rendering. Only the fields the scene
 * reads smoothly are interpolated; the rest mirror the current state.
 */
export const renderState: FlightState = createFlightState();

export function interpolateRender(alpha: number): void {
  const cur = simulation.state;
  const prev = simulation.previous;
  const r = renderState;

  r.distance = lerp(prev.distance, cur.distance, alpha);
  r.altitude = lerp(prev.altitude, cur.altitude, alpha);
  r.posX = lerp(prev.posX, cur.posX, alpha);
  r.posZ = lerp(prev.posZ, cur.posZ, alpha);
  r.heading = lerp(prev.heading, cur.heading, alpha);
  r.pitch = lerp(prev.pitch, cur.pitch, alpha);
  r.bank = lerp(prev.bank, cur.bank, alpha);

  r.vx = cur.vx;
  r.vy = cur.vy;
  r.pitchRate = cur.pitchRate;
  r.rollRate = cur.rollRate;
  r.airspeed = cur.airspeed;
  r.angleOfAttack = cur.angleOfAttack;
  r.liftCoefficient = cur.liftCoefficient;
  r.lift = cur.lift;
  r.drag = cur.drag;
  r.stability = cur.stability;
  r.stallMargin = cur.stallMargin;
  r.stalled = cur.stalled;
  r.overspeed = cur.overspeed;
  r.wind.horizontal = cur.wind.horizontal;
  r.wind.vertical = cur.wind.vertical;
  r.wind.cross = cur.wind.cross;
  r.wind.gust = cur.wind.gust;
  r.wind.turbulence = cur.wind.turbulence;
  r.time = cur.time;
  r.maxAltitude = cur.maxAltitude;
  r.stabilityIntegral = cur.stabilityIntegral;
  r.crashed = cur.crashed;
  r.crashCause = cur.crashCause;
  r.ringsCollected = cur.ringsCollected;
  r.lastRingAt = cur.lastRingAt;
  r.bonusDistance = cur.bonusDistance;
  r.progress = cur.progress;
}

/** Frame timing and renderer counters shared with the dev readout. */
export const frameStats = { fps: 0, drawCalls: 0, triangles: 0 };

/**
 * Launch sequence shared between the driver, the boy and the plane.
 * `t` is seconds since the throw began. The boy writes the hand pose (render
 * space) every frame while active; the plane follows it; the driver turns it
 * into the sim's launch point on release.
 */
export const launch = {
  /** True in the menu (idle pose) and while launching. */
  active: true,
  t: 0,
  /** Set by input to jump straight to the throw. */
  skip: false,
  /** Dev only: hold the throw at the current `t` for screenshots. */
  frozen: false,
  handValid: false,
  handX: 0,
  handY: START_ALTITUDE_FOR_LAUNCH(),
  handZ: 0,
  handQx: 0,
  handQy: 0,
  handQz: 0,
  handQw: 1,
};

function START_ALTITUDE_FOR_LAUNCH(): number {
  return simulation.state.altitude;
}

/** Starts a fresh flight with a new seed. */
export function resetFlight(seed: number = Date.now() >>> 0): void {
  simulation.reset(seed);
  interpolateRender(0);
}
