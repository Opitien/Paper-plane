/**
 * Owns the flight state and advances it in fixed steps.
 * Pure TypeScript: no React, no Three.js, no DOM.
 */

import { LAUNCH, OBSTACLES, PHYSICS, START_ALTITUDE } from './constants';
import { createWindParams, difficultyParams, progressFromDistance, type WindParams } from './difficulty';
import { flightStep, type DisturbanceSeeds } from './flight';
import { ObstacleField } from './obstacles';
import { Rng } from './rng';
import { copyFlightState, createFlightState, type FlightState, type InputIntent } from './types';
import { WindSystem } from './wind';

export type WindMode = 'auto' | 'off' | 'manual';

export interface LaunchPoint {
  x: number;
  y: number;
  z: number;
  heading: number;
}

export class Simulation {
  /** Current state. Read by the renderer, written only here. */
  readonly state: FlightState = createFlightState();
  /** State before the most recent step, for render interpolation. */
  readonly previous: FlightState = createFlightState();
  rng = new Rng(1);

  readonly wind = new WindSystem();
  readonly obstacles = new ObstacleField();
  /** Debug and test hooks. `auto` in normal play. */
  windMode: WindMode = 'auto';
  /** Used when `windMode` is `manual`. */
  readonly manualWind = { horizontal: 0, vertical: 0, cross: 0, turbulence: 0 };
  /** Debug and test hook: forces progress instead of deriving it from distance. */
  difficultyOverride: number | null = null;
  /** Obstacles still spawn and move when false, but never crash the plane (menu background). */
  collisions = true;

  /** Rings collected during the most recent step; the driver uses it for feedback. */
  ringsThisStep = 0;

  private readonly params: WindParams = createWindParams();
  private seeds: DisturbanceSeeds = { turbPitch: 1, cross: 2, kick: 3, flutter: 4 };

  constructor() {
    this.reset(1);
  }

  reset(seed: number): void {
    this.rng = new Rng(seed);
    this.wind.reset(this.rng);
    this.obstacles.reset();
    this.seeds = {
      turbPitch: Math.floor(this.rng.next() * 1e6),
      cross: Math.floor(this.rng.next() * 1e6),
      kick: Math.floor(this.rng.next() * 1e6),
      flutter: Math.floor(this.rng.next() * 1e6),
    };

    const s = this.state;
    s.distance = 0;
    s.altitude = START_ALTITUDE;
    s.posX = 0;
    s.posZ = 0;
    s.heading = 0;
    s.vx = PHYSICS.vRef;
    s.vy = 0;
    s.pitch = PHYSICS.alphaTrim;
    s.pitchRate = 0;
    s.bank = 0;
    s.rollRate = 0;
    s.airspeed = PHYSICS.vRef;
    s.angleOfAttack = PHYSICS.alphaTrim;
    s.liftCoefficient = 0;
    s.lift = 0;
    s.drag = 0;
    s.stability = 1;
    s.stallMargin = 1;
    s.stalled = false;
    s.overspeed = false;
    s.wind.horizontal = 0;
    s.wind.vertical = 0;
    s.wind.cross = 0;
    s.wind.gust = 0;
    s.wind.turbulence = 0;
    s.time = 0;
    s.maxAltitude = START_ALTITUDE;
    s.stabilityIntegral = 0;
    s.crashed = false;
    s.crashCause = null;
    s.progress = 0;
    s.ringsCollected = 0;
    s.lastRingAt = -Infinity;
    s.bonusDistance = 0;
    this.ringsThisStep = 0;
    copyFlightState(s, this.previous);
  }

  /** Starts the flight from the thrower's hand instead of the default start pose. */
  launchFrom(point: LaunchPoint): void {
    const s = this.state;
    s.posX = point.x;
    s.posZ = point.z;
    s.altitude = point.y;
    s.maxAltitude = point.y;
    s.heading = point.heading;
    s.vx = LAUNCH.throwSpeed;
    s.vy = LAUNCH.throwClimb;
    s.pitch = LAUNCH.throwPitch;
    s.airspeed = Math.hypot(s.vx, s.vy);
    copyFlightState(s, this.previous);
  }

  /** Advance by exactly `dt` seconds. Callers must pass the fixed step. Frozen after a crash. */
  step(dt: number, input: InputIntent): void {
    const s = this.state;
    this.ringsThisStep = 0;
    if (s.crashed) return;
    copyFlightState(s, this.previous);

    s.progress = this.difficultyOverride ?? progressFromDistance(s.distance);
    difficultyParams(s.progress, this.params);

    switch (this.windMode) {
      case 'auto':
        this.wind.update(s.time, this.params, this.rng, s.wind);
        break;
      case 'off':
        s.wind.horizontal = 0;
        s.wind.vertical = 0;
        s.wind.cross = 0;
        s.wind.gust = 0;
        s.wind.turbulence = 0;
        break;
      case 'manual':
        s.wind.horizontal = this.manualWind.horizontal;
        s.wind.vertical = this.manualWind.vertical;
        s.wind.cross = this.manualWind.cross;
        s.wind.gust = 0;
        s.wind.turbulence = this.manualWind.turbulence;
        break;
    }

    flightStep(s, dt, input.pitchAxis, input.rollAxis, this.seeds);

    const events = this.obstacles.update(s, dt, this.rng, this.collisions);
    if (events.ringsCollected > 0) {
      this.ringsThisStep = events.ringsCollected;
      s.ringsCollected += events.ringsCollected;
      s.lastRingAt = s.time;
      const bonus = events.ringsCollected * OBSTACLES.ringBonus;
      s.bonusDistance += bonus;
      s.distance += bonus;
    }
  }
}
