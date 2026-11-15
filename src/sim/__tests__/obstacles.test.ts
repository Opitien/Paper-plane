import { describe, expect, it } from 'vitest';
import { Simulation } from '../simulation';
import { FIXED_DT, HILL, OBSTACLES, START_ALTITUDE } from '../constants';
import { terrainHeight } from '../terrain';
import type { InputIntent } from '../types';

const neutral: InputIntent = { pitchAxis: 0, rollAxis: 0, pausePressed: false, confirmPressed: false };

function run(sim: Simulation, seconds: number, each?: () => boolean | void, input: InputIntent = neutral): void {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    sim.step(FIXED_DT, input);
    if (each && each() === true) return;
  }
}

describe('terrain', () => {
  it('is a flat-topped hill at the origin and flat elsewhere', () => {
    expect(terrainHeight(0, 0)).toBe(HILL.height);
    expect(terrainHeight(HILL.topRadius - 1, 0)).toBe(HILL.height);
    const mid = terrainHeight((HILL.topRadius + HILL.radius) / 2, 0);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(HILL.height);
    expect(terrainHeight(HILL.radius + 1, 0)).toBe(0);
    expect(terrainHeight(5000, -3000)).toBe(0);
  });

  it('crashes the plane into the hill when flying into it below the top', () => {
    const sim = new Simulation();
    sim.reset(1);
    sim.windMode = 'off';
    sim.launchFrom({ x: 0, y: HILL.height - 10, z: -400, heading: 0 });
    run(sim, 40, () => sim.state.crashed);
    expect(sim.state.crashed).toBe(true);
    expect(sim.state.crashCause).toBe('ground');
    // Hit the dome, not the plain: still inside the hill radius with height above zero.
    expect(Math.hypot(sim.state.posX, sim.state.posZ)).toBeLessThan(HILL.radius);
    expect(sim.state.altitude).toBeGreaterThan(0);
  });
});

describe('obstacle field', () => {
  it('spawns ahead of the plane, never on the hill, and recycles what falls behind', () => {
    const sim = new Simulation();
    sim.reset(3);
    sim.windMode = 'off';
    let sawActive = false;
    run(sim, 120, () => {
      const s = sim.state;
      for (const pool of [sim.obstacles.balloons, sim.obstacles.turbines, sim.obstacles.rings]) {
        for (const o of pool) {
          if (!o.active) continue;
          sawActive = true;
          expect(Math.hypot(o.x, o.z)).toBeGreaterThanOrEqual(OBSTACLES.hillClearance);
          const ahead = (o.x - s.posX) * Math.sin(s.heading) + (o.z - s.posZ) * Math.cos(s.heading);
          expect(ahead).toBeGreaterThan(-OBSTACLES.behind - 1);
          expect(ahead).toBeLessThan(OBSTACLES.ahead[1] + 1);
        }
      }
      return s.crashed;
    });
    expect(sawActive).toBe(true);
  });

  it('crashes into a balloon placed in the path and reports the cause', () => {
    const sim = new Simulation();
    sim.reset(1);
    sim.windMode = 'off';
    const b = sim.obstacles.balloons[0];
    b.active = true;
    b.x = 0;
    b.z = 120;
    b.y = START_ALTITUDE;
    run(sim, 15, () => sim.state.crashed);
    expect(sim.state.crashed).toBe(true);
    expect(sim.state.crashCause).toBe('balloon');
    expect(sim.state.posZ).toBeLessThan(120);
  });

  it('collects a ring in the path, adds the bonus, and never crashes on it', () => {
    const sim = new Simulation();
    sim.reset(1);
    sim.windMode = 'off';
    const r = sim.obstacles.rings[0];
    r.active = true;
    r.x = 0;
    r.z = 120;
    r.y = START_ALTITUDE;
    r.facing = 0;
    let rings = 0;
    run(sim, 10, () => {
      rings += sim.ringsThisStep;
    });
    expect(rings).toBe(1);
    expect(sim.state.ringsCollected).toBe(1);
    expect(sim.state.bonusDistance).toBe(OBSTACLES.ringBonus);
    expect(sim.state.crashed).toBe(false);
    expect(r.collected).toBe(true);
  });

  it('ignores collisions when disabled', () => {
    const sim = new Simulation();
    sim.reset(1);
    sim.windMode = 'off';
    sim.collisions = false;
    const b = sim.obstacles.balloons[0];
    b.active = true;
    b.x = 0;
    b.z = 120;
    b.y = START_ALTITUDE;
    run(sim, 15);
    expect(sim.state.crashed).toBe(false);
  });

  it('is deterministic per seed including obstacle placement', () => {
    const a = new Simulation();
    const b = new Simulation();
    a.reset(11);
    b.reset(11);
    run(a, 60);
    run(b, 60);
    expect(a.state.distance).toBe(b.state.distance);
    expect(a.obstacles.balloons.map((o) => [o.active, o.x, o.z])).toEqual(
      b.obstacles.balloons.map((o) => [o.active, o.x, o.z]),
    );
  });

  it('starts the flight from a launch point', () => {
    const sim = new Simulation();
    sim.reset(1);
    sim.launchFrom({ x: -2, y: 79, z: 1.5, heading: 0 });
    expect(sim.state.posX).toBe(-2);
    expect(sim.state.altitude).toBe(79);
    expect(sim.state.vy).toBeGreaterThan(0);
    run(sim, 5);
    expect(sim.state.crashed).toBe(false);
  });
});
