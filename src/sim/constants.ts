/**
 * Every tunable simulation number lives here.
 * Units: metres, seconds, radians unless stated.
 * See docs/FLIGHT_MODEL.md for what each term does.
 */

import { DEG } from '@/utils/math';

// ---------------------------------------------------------------------------
// Fixed-step loop
// ---------------------------------------------------------------------------

/** Simulation step. 120 Hz keeps the pitch dynamics stable and smooth. */
export const FIXED_DT = 1 / 120;

/** Largest wall-clock delta accepted per frame. Prevents catch-up bursts after a tab switch. */
export const MAX_FRAME_DT = 0.25;

// ---------------------------------------------------------------------------
// Starting conditions
// ---------------------------------------------------------------------------

export const START_ALTITUDE = 80;

// ---------------------------------------------------------------------------
// Flight model
// ---------------------------------------------------------------------------

export const PHYSICS = {
  gravity: 9.81,
  mass: 1.0,

  /** Stands in for 0.5 * rho0 * wing area. */
  kAero: 0.045,
  /** Air density falls linearly to `minDensity` at this altitude: a soft ceiling. */
  ceilingAltitude: 400,
  minDensity: 0.35,

  /** Lift curve slope per radian. */
  clAlpha: 5.0,
  /** Angle of attack where lift collapses. 17 degrees. */
  alphaStall: 0.3,
  /** Lift coefficient once fully stalled. */
  clStalled: 0.35,
  clMax: 1.5,
  clMaxNegative: 0.8,
  /** Width of the stall blend around alphaStall. */
  stallBlendBelow: 0.04,
  stallBlendAbove: 0.08,

  cd0: 0.06,
  kInduced: 0.1,
  /** Above this airspeed drag rises sharply and flutter starts. */
  vMax: 30,
  overspeedDragK: 0.002,

  /** Arcade energy source: constant forward push, scaled by density. Tuned so trim flight is level. */
  breezeForce: 1.9,

  /** Reference airspeed for control authority scaling. Also the start speed. */
  vRef: 18,
  /** Below this airspeed the wing stalls regardless of angle. */
  vStall: 10,

  // Pitch moments (rad/s^2 at vRef)
  /**
   * Nose-up authority is deliberately modest so a held climb develops over a
   * few seconds and stalls because speed bleeds off, not because the nose
   * snaps past the stall angle. Nose-down is stronger: a dart dives readily.
   */
  controlAuthorityUp: 1.0,
  controlAuthorityDown: 1.5,
  /** Trim restoring stiffness; scales with (V / vRef)^2. */
  stabilityK: 8.0,
  /** Angle of attack the stability moment pulls toward. */
  alphaTrim: 0.16,
  /** Pitch rate damping; scales with 0.5 + 0.5 * (V / vRef) so fast flight does not wobble. */
  pitchDamping: 3.5,
  stallNoseDrop: 3.0,
  turbPitchK: 1.2,
  crossPitchK: 0.08,
  overspeedFlutter: 2.0,
  /** Vertical acceleration noise from turbulence, m/s^2 at full turbulence. */
  turbKick: 2.5,

  maxPitchRate: 2.5,
  pitchLimit: 80 * DEG,

  /** Hysteresis so the stall flag does not flicker. */
  stallExitAlphaMargin: 0.06,
  stallExitSpeedMargin: 2,

  /** Width of the HUD stall-margin ramp, radians below alphaStall. */
  stallMarginWidth: 0.12,

  // Roll and turning
  /** Roll moment per unit stick at vRef, rad/s^2. */
  rollAuthority: 3.0,
  /** Dihedral: moment returning bank to level, per radian of bank. */
  rollStability: 4.0,
  rollDamping: 3.0,
  /** Random wing drop while stalled, rad/s^2. */
  stallWingDrop: 1.2,
  maxRollRate: 2.5,
  bankLimit: 70 * DEG,
  /** Coordinated turn: yaw rate = turnGain * g * tan(bank) / V. */
  turnGain: 1.0,
  /** Airspeed floor in the turn-rate formula so a slow plane does not spin. */
  turnSpeedFloor: 6,
  /** How much of the cross wind carries the plane sideways over the ground. */
  crossDrift: 1.0,
} as const;

// ---------------------------------------------------------------------------
// Wind
// ---------------------------------------------------------------------------

export const WIND = {
  /** Noise frequencies (Hz) for the slow base channels. */
  baseFreq: 0.05,
  draftFreq: 0.08,
  crossFreq: 0.06,
  turbFreq: 0.7,
  /** Noise frequencies for the per-step pitch and kick disturbances. */
  turbPitchFreq: 3,
  turbKickFreq: 5,
  flutterFreq: 7,

  gustAttack: [0.3, 0.6] as const,
  gustHold: [0.4, 1.0] as const,
  gustDecay: [1.0, 2.0] as const,
  /** Vertical component of a gust as a fraction of its magnitude. */
  gustVerticalFraction: 0.3,
  /** Gusts never come closer together than this, seconds. */
  gustMinInterval: 2,
  /** First gust of a run arrives in this window, seconds. */
  firstGustWindow: [5, 12] as const,
  /** P(headwind) = base + gain * progress. */
  headwindBiasBase: 0.5,
  headwindBiasGain: 0.3,
  /** Gust magnitude that maps to gust strength 1.0 for HUD, audio and camera. */
  gustReference: 10,
} as const;

// ---------------------------------------------------------------------------
// Launch: the boy on the hill
// ---------------------------------------------------------------------------

export const LAUNCH = {
  /** Height of the hand above the hilltop at release, so the flight starts at START_ALTITUDE. */
  handHeight: 12,
  /** Seconds of wind-up before the throw starts. */
  windupSeconds: 0.5,
  /** Seconds the throw sweep takes; release happens at windup + throw. */
  throwSeconds: 0.25,
  /** Initial speed along the heading and vertical, m/s. */
  throwSpeed: 17,
  throwClimb: 3,
  /** Initial pitch, radians. A touch above trim so the plane arcs up then settles. */
  throwPitch: 0.26,
} as const;

/**
 * The launch hill: a flat-topped dome at the world origin. Collidable.
 * Kept steep and narrow so a plane that sinks a little after the throw still
 * clears it; a plane that dives or circles straight away does not.
 */
export const HILL = {
  height: START_ALTITUDE - 12,
  radius: 170,
  topRadius: 22,
} as const;

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------

export const OBSTACLES = {
  /** Pool sizes. Rendering allocates exactly these. */
  maxBalloons: 10,
  maxTurbines: 8,
  maxRings: 8,
  /** No obstacles until this far into the flight. */
  startDistance: 250,
  /** Metres of flight between spawns at progress 0 and 1. */
  spawnInterval: [230, 130] as const,
  /** Spawn window ahead of the plane along its heading, metres. */
  ahead: [380, 680] as const,
  lateral: 170,
  /** Chance a balloon or ring is placed in the plane's corridor. */
  corridorChance: 0.4,
  corridorWidth: 30,
  /** Despawn when this far behind or this far away. */
  behind: 160,
  maxRange: 1300,
  /** Nothing spawns within this radius of the hill. */
  hillClearance: 340,

  balloonRadius: 9,
  balloonAltitude: [28, 230] as const,
  balloonDrift: 0.6,

  turbineTowerRadius: 2.4,
  turbineHubHeight: [60, 110] as const,
  turbineHubRadius: 4.5,
  /** Blade disc collision radius (visual blades are a little longer). */
  turbineDiscRadius: 14,
  turbineDiscThickness: 1.6,
  /** Turbines are pointless when the plane is above this altitude. */
  turbineMaxPlaneAltitude: 150,

  ringRadius: 9,
  ringThickness: 2.2,
  ringAltitudeSpread: 28,
  ringMinAltitude: 22,
  /** Distance bonus for flying through a ring, metres. */
  ringBonus: 100,

  /** Plane collision radius. */
  planeRadius: 1.2,
  /** Spawn weights: balloon, turbine, ring. */
  weights: [0.45, 0.3, 0.25] as const,
} as const;

// ---------------------------------------------------------------------------
// Difficulty curve (interpolated from progress 0 to 1)
// ---------------------------------------------------------------------------

export const DIFFICULTY = {
  /** Distance at which difficulty reaches its maximum. */
  fullDistance: 5000,
  /** progress^ease: slow start. */
  ease: 1.3,
  baseAmp: [1.5, 8] as const,
  /** Up/downdrafts are the main hands-off killer late on; raised from 3.5 in M3 balancing. */
  draftAmp: [0.8, 4.5] as const,
  crossAmp: [0.5, 5] as const,
  gustRate: [1 / 25, 1 / 5] as const,
  gustMag: [2.5, 10] as const,
  /** Turbulence fades in from this progress to 1. */
  turbStart: 0.25,
} as const;
