export type Phase = 'menu' | 'launching' | 'playing' | 'paused' | 'crashed' | 'gameover';

export type CrashCause = 'ground' | 'balloon' | 'turbine' | null;

export interface WindState {
  /** m/s along the track. Positive = tailwind, negative = headwind. */
  horizontal: number;
  /** m/s vertical. Positive = updraft. */
  vertical: number;
  /** m/s across the track. Cosmetic bank and stability penalty. */
  cross: number;
  /** 0..1 strength of the current gust envelope. */
  gust: number;
  /** 0..1 turbulence amplitude. */
  turbulence: number;
}

export interface FlightState {
  // Kinematics (metres, seconds, radians)
  /** Path length flown along the ground track. The score. */
  distance: number;
  altitude: number;
  /** World ground position. X = right at heading 0, Z = forward at heading 0. */
  posX: number;
  posZ: number;
  /** Heading, radians. 0 = initial direction, positive = turned right. */
  heading: number;
  /** Ground speed along the heading. */
  vx: number;
  vy: number;
  pitch: number;
  pitchRate: number;
  /** Bank, radians. Positive = right wing down = turning right. */
  bank: number;
  rollRate: number;

  // Derived per step
  airspeed: number;
  angleOfAttack: number;
  liftCoefficient: number;
  lift: number;
  drag: number;
  /** 0..1 combined health indicator for the HUD. */
  stability: number;
  /** 0..1, 1 = far from stall angle, 0 = at it. */
  stallMargin: number;
  stalled: boolean;
  overspeed: boolean;

  wind: WindState;

  // Bookkeeping
  time: number;
  maxAltitude: number;
  /** Integral of `stability` over time; divided by time gives flight performance. */
  stabilityIntegral: number;
  crashed: boolean;
  crashCause: CrashCause;
  progress: number;
  /** Rings flown through this flight, and the sim time of the last one (HUD pop). */
  ringsCollected: number;
  lastRingAt: number;
  /** Distance awarded by rings; already included in `distance`. */
  bonusDistance: number;
}

export interface InputIntent {
  /** Smoothed pitch command in [-1, 1]. Positive = climb. */
  pitchAxis: number;
  /** Smoothed roll command in [-1, 1]. Positive = roll right. */
  rollAxis: number;
  pausePressed: boolean;
  confirmPressed: boolean;
}

export function createFlightState(): FlightState {
  return {
    distance: 0,
    altitude: 0,
    posX: 0,
    posZ: 0,
    heading: 0,
    vx: 0,
    vy: 0,
    pitch: 0,
    pitchRate: 0,
    bank: 0,
    rollRate: 0,
    airspeed: 0,
    angleOfAttack: 0,
    liftCoefficient: 0,
    lift: 0,
    drag: 0,
    stability: 1,
    stallMargin: 1,
    stalled: false,
    overspeed: false,
    wind: { horizontal: 0, vertical: 0, cross: 0, gust: 0, turbulence: 0 },
    time: 0,
    maxAltitude: 0,
    stabilityIntegral: 0,
    crashed: false,
    crashCause: null,
    progress: 0,
    ringsCollected: 0,
    lastRingAt: -Infinity,
    bonusDistance: 0,
  };
}

/** Copies every field of `from` into `to` without allocating. */
export function copyFlightState(from: FlightState, to: FlightState): void {
  to.distance = from.distance;
  to.altitude = from.altitude;
  to.posX = from.posX;
  to.posZ = from.posZ;
  to.heading = from.heading;
  to.vx = from.vx;
  to.vy = from.vy;
  to.pitch = from.pitch;
  to.pitchRate = from.pitchRate;
  to.bank = from.bank;
  to.rollRate = from.rollRate;
  to.airspeed = from.airspeed;
  to.angleOfAttack = from.angleOfAttack;
  to.liftCoefficient = from.liftCoefficient;
  to.lift = from.lift;
  to.drag = from.drag;
  to.stability = from.stability;
  to.stallMargin = from.stallMargin;
  to.stalled = from.stalled;
  to.overspeed = from.overspeed;
  to.wind.horizontal = from.wind.horizontal;
  to.wind.vertical = from.wind.vertical;
  to.wind.cross = from.wind.cross;
  to.wind.gust = from.wind.gust;
  to.wind.turbulence = from.wind.turbulence;
  to.time = from.time;
  to.maxAltitude = from.maxAltitude;
  to.stabilityIntegral = from.stabilityIntegral;
  to.crashed = from.crashed;
  to.crashCause = from.crashCause;
  to.progress = from.progress;
  to.ringsCollected = from.ringsCollected;
  to.lastRingAt = from.lastRingAt;
  to.bonusDistance = from.bonusDistance;
}
