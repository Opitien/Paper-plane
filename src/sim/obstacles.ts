import { OBSTACLES as O } from './constants';
import type { Rng } from './rng';
import type { FlightState } from './types';
import { lerp } from '@/utils/math';

export type ObstacleKind = 'balloon' | 'turbine' | 'ring';

export interface Obstacle {
  kind: ObstacleKind;
  active: boolean;
  /** World position (sim frame). For turbines `y` is the hub height; the tower stands on the ground. */
  x: number;
  y: number;
  z: number;
  /** Heading the obstacle faces, radians. Rings are crossed along it; blades face it. */
  facing: number;
  /** 0..1 random for colour and animation phase. */
  seed: number;
  /** Rings only: collected, and the sim time it happened (for the pop animation). */
  collected: boolean;
  collectedAt: number;
}

function makeObstacle(kind: ObstacleKind): Obstacle {
  return { kind, active: false, x: 0, y: 0, z: 0, facing: 0, seed: 0, collected: false, collectedAt: 0 };
}

export interface ObstacleEvents {
  ringsCollected: number;
}

/**
 * Keeps fixed pools of balloons, turbines and rings alive around the plane.
 * Spawns ahead along the heading as distance accrues, recycles what falls
 * behind, and resolves collisions against the flight state. Deterministic
 * for a seed. Pure TypeScript; the renderer only reads the pools.
 */
export class ObstacleField {
  readonly balloons: Obstacle[] = Array.from({ length: O.maxBalloons }, () => makeObstacle('balloon'));
  readonly turbines: Obstacle[] = Array.from({ length: O.maxTurbines }, () => makeObstacle('turbine'));
  readonly rings: Obstacle[] = Array.from({ length: O.maxRings }, () => makeObstacle('ring'));

  private nextSpawnAt = O.startDistance;
  private readonly events: ObstacleEvents = { ringsCollected: 0 };

  reset(): void {
    for (const pool of [this.balloons, this.turbines, this.rings]) {
      for (const o of pool) {
        o.active = false;
        o.collected = false;
      }
    }
    this.nextSpawnAt = O.startDistance;
  }

  /** Advances spawning, drift and collisions. Returns the events of this step (reused object). */
  update(s: FlightState, dt: number, rng: Rng, collisions: boolean): ObstacleEvents {
    this.events.ringsCollected = 0;
    const sinH = Math.sin(s.heading);
    const cosH = Math.cos(s.heading);

    // Balloons drift gently with the wind in the plane's frame.
    const driftAlong = s.wind.horizontal * O.balloonDrift * dt;
    const driftAcross = s.wind.cross * O.balloonDrift * dt;
    const bdx = driftAlong * sinH + driftAcross * cosH;
    const bdz = driftAlong * cosH - driftAcross * sinH;
    for (const b of this.balloons) {
      if (!b.active) continue;
      b.x += bdx;
      b.z += bdz;
      b.y += s.wind.vertical * O.balloonDrift * 0.5 * dt;
    }

    // Recycle anything well behind or out of range.
    for (const pool of [this.balloons, this.turbines, this.rings]) {
      for (const o of pool) {
        if (!o.active) continue;
        const rx = o.x - s.posX;
        const rz = o.z - s.posZ;
        const ahead = rx * sinH + rz * cosH;
        if (ahead < -O.behind || Math.hypot(rx, rz) > O.maxRange) o.active = false;
      }
    }

    // Spawn by distance flown.
    const interval = lerp(O.spawnInterval[0], O.spawnInterval[1], s.progress);
    let guard = 0;
    while (s.distance >= this.nextSpawnAt && guard++ < 4) {
      this.nextSpawnAt += interval;
      this.spawn(s, rng, sinH, cosH);
    }

    if (collisions && !s.crashed) this.collide(s, sinH, cosH);
    return this.events;
  }

  private spawn(s: FlightState, rng: Rng, sinH: number, cosH: number): void {
    const roll = rng.next();
    let kind: ObstacleKind = roll < O.weights[0] ? 'balloon' : roll < O.weights[0] + O.weights[1] ? 'turbine' : 'ring';
    if (kind === 'turbine' && s.altitude > O.turbineMaxPlaneAltitude) kind = 'balloon';

    const pool = kind === 'balloon' ? this.balloons : kind === 'turbine' ? this.turbines : this.rings;
    const slot = pool.find((o) => !o.active);
    if (!slot) return;

    const ahead = rng.range(O.ahead[0], O.ahead[1]);
    const inCorridor = kind !== 'turbine' && rng.next() < O.corridorChance;
    const lateral = inCorridor ? rng.signed() * O.corridorWidth : rng.signed() * O.lateral;
    const x = s.posX + ahead * sinH + lateral * cosH;
    const z = s.posZ + ahead * cosH - lateral * sinH;
    if (Math.hypot(x, z) < O.hillClearance) return; // keep the launch hill clear

    slot.active = true;
    slot.collected = false;
    slot.x = x;
    slot.z = z;
    slot.facing = s.heading;
    slot.seed = rng.next();
    switch (kind) {
      case 'balloon':
        slot.y = Math.min(O.balloonAltitude[1], Math.max(O.balloonAltitude[0], s.altitude + rng.signed() * 45));
        break;
      case 'turbine':
        slot.y = rng.range(O.turbineHubHeight[0], O.turbineHubHeight[1]);
        break;
      case 'ring':
        slot.y = Math.max(O.ringMinAltitude, s.altitude + rng.signed() * O.ringAltitudeSpread);
        break;
    }
  }

  private collide(s: FlightState, sinH: number, cosH: number): void {
    const px = s.posX;
    const py = s.altitude;
    const pz = s.posZ;
    const pr = O.planeRadius;

    for (const b of this.balloons) {
      if (!b.active) continue;
      const d = Math.hypot(b.x - px, b.y - py, b.z - pz);
      if (d < O.balloonRadius + pr) {
        s.crashed = true;
        s.crashCause = 'balloon';
        return;
      }
    }

    for (const t of this.turbines) {
      if (!t.active) continue;
      const dx = px - t.x;
      const dz = pz - t.z;
      const horizontal = Math.hypot(dx, dz);
      // Tower
      if (horizontal < O.turbineTowerRadius + pr && py < t.y + 2) {
        s.crashed = true;
        s.crashCause = 'turbine';
        return;
      }
      // Hub
      if (Math.hypot(dx, py - t.y, dz) < O.turbineHubRadius + pr) {
        s.crashed = true;
        s.crashCause = 'turbine';
        return;
      }
      // Blade disc: a thin vertical disc facing the turbine's heading.
      const nx = Math.sin(t.facing);
      const nz = Math.cos(t.facing);
      const along = dx * nx + dz * nz;
      const across = dx * nz - dz * nx;
      const radial = Math.hypot(across, py - t.y);
      if (Math.abs(along) < O.turbineDiscThickness + pr && radial < O.turbineDiscRadius) {
        s.crashed = true;
        s.crashCause = 'turbine';
        return;
      }
    }

    for (const r of this.rings) {
      if (!r.active || r.collected) continue;
      const dx = px - r.x;
      const dz = pz - r.z;
      const nx = Math.sin(r.facing);
      const nz = Math.cos(r.facing);
      const along = dx * nx + dz * nz;
      const across = dx * nz - dz * nx;
      const radial = Math.hypot(across, py - r.y);
      if (Math.abs(along) < O.ringThickness && radial < O.ringRadius) {
        r.collected = true;
        r.collectedAt = s.time;
        this.events.ringsCollected += 1;
      }
    }
    void sinH;
    void cosH;
  }
}
