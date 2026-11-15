import { describe, expect, it } from 'vitest';
import { Simulation } from '../simulation';
import { FIXED_DT, PHYSICS, START_ALTITUDE } from '../constants';
import { FixedStepper } from '../loop';
import { createWindParams, difficultyParams } from '../difficulty';
import { terrainHeight } from '../terrain';
import type { InputIntent } from '../types';

const neutral: InputIntent = { pitchAxis: 0, rollAxis: 0, pausePressed: false, confirmPressed: false };
const climb: InputIntent = { pitchAxis: 1, rollAxis: 0, pausePressed: false, confirmPressed: false };
const rollRight: InputIntent = { pitchAxis: 0, rollAxis: 1, pausePressed: false, confirmPressed: false };
const dive: InputIntent = { pitchAxis: -1, rollAxis: 0, pausePressed: false, confirmPressed: false };

/** A sim started well clear of the launch hill, so flight-model tests see flat ground. */
function fresh(seed = 1, windMode: 'auto' | 'off' | 'manual' = 'off'): Simulation {
  const sim = new Simulation();
  sim.reset(seed);
  sim.windMode = windMode;
  sim.collisions = false;
  sim.state.posZ = 1000;
  sim.previous.posZ = 1000;
  return sim;
}

/** Steps for `seconds`, calling `each` after every step; returns early if it returns true. */
function run(sim: Simulation, seconds: number, input: InputIntent, each?: () => boolean | void): void {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    sim.step(FIXED_DT, input);
    if (each && each() === true) return;
  }
}

describe('trim and control', () => {
  it('holds altitude with neutral input and no wind', () => {
    const sim = fresh();
    let min = Infinity;
    let max = -Infinity;
    run(sim, 30, neutral, () => {
      min = Math.min(min, sim.state.altitude);
      max = Math.max(max, sim.state.altitude);
    });
    expect(min).toBeGreaterThan(START_ALTITUDE - 3);
    expect(max).toBeLessThan(START_ALTITUDE + 3);
    expect(sim.state.airspeed).toBeGreaterThan(PHYSICS.vRef - 1);
    expect(sim.state.airspeed).toBeLessThan(PHYSICS.vRef + 2);
    expect(sim.state.stalled).toBe(false);
  });

  it('never changes pitch instantly: one step of full input moves the nose less than a degree', () => {
    const sim = fresh();
    const before = sim.state.pitch;
    sim.step(FIXED_DT, climb);
    expect(Math.abs(sim.state.pitch - before)).toBeLessThan((1 * Math.PI) / 180);
  });

  it('climbs for a while under held up input, then stalls because speed bleeds off', () => {
    const sim = fresh();
    let stallTime: number | null = null;
    let maxAlt = 0;
    let speedAtStall = 0;
    run(sim, 10, climb, () => {
      maxAlt = Math.max(maxAlt, sim.state.altitude);
      if (sim.state.stalled && stallTime === null) {
        stallTime = sim.state.time;
        speedAtStall = sim.state.airspeed;
        return true;
      }
    });
    expect(stallTime).not.toBeNull();
    expect(stallTime!).toBeGreaterThan(1.5);
    expect(stallTime!).toBeLessThan(8);
    expect(maxAlt).toBeGreaterThan(START_ALTITUDE + 3);
    expect(speedAtStall).toBeLessThan(PHYSICS.vRef);
  });

  it('dives, overspeeds and crashes under held down input', () => {
    const sim = new Simulation();
    sim.reset(1);
    sim.windMode = 'off';
    let overspeedAt: number | null = null;
    run(sim, 30, dive, () => {
      if (sim.state.overspeed && overspeedAt === null) overspeedAt = sim.state.time;
      return sim.state.crashed;
    });
    expect(sim.state.crashed).toBe(true);
    // Diving straight from the throw hits the launch hill, so rest on the terrain, not the plain.
    expect(sim.state.altitude).toBeCloseTo(terrainHeight(sim.state.posX, sim.state.posZ), 6);
    expect(sim.state.crashCause).toBe('ground');
    expect(overspeedAt).not.toBeNull();
    expect(sim.state.time).toBeGreaterThan(4);
    expect(sim.state.time).toBeLessThan(12);
  });

  it('recovers from a stall on its own when there is altitude', () => {
    const sim = fresh();
    run(sim, 10, climb, () => sim.state.stalled);
    expect(sim.state.stalled).toBe(true);
    let minAlt = Infinity;
    run(sim, 12, neutral, () => {
      minAlt = Math.min(minAlt, sim.state.altitude);
    });
    expect(sim.state.stalled).toBe(false);
    expect(sim.state.crashed).toBe(false);
    expect(minAlt).toBeGreaterThan(20);
    expect(Math.abs(sim.state.angleOfAttack - PHYSICS.alphaTrim)).toBeLessThan(0.06);
  });

  it('eases back toward trim after a short tap without overshooting into a stall', () => {
    const sim = fresh();
    run(sim, 0.3, climb);
    let stalled = false;
    run(sim, 6, neutral, () => {
      stalled ||= sim.state.stalled;
    });
    expect(stalled).toBe(false);
    expect(Math.abs(sim.state.angleOfAttack - PHYSICS.alphaTrim)).toBeLessThan(0.04);
  });

  it('freezes after a crash', () => {
    const sim = fresh();
    run(sim, 30, dive, () => sim.state.crashed);
    const d = sim.state.distance;
    run(sim, 1, neutral);
    expect(sim.state.distance).toBe(d);
  });
});

describe('wind', () => {
  function gustTest(horizontal: number) {
    const sim = fresh(1, 'manual');
    let minAlt = Infinity;
    let maxAlt = -Infinity;
    run(sim, 20, neutral, () => {
      const t = sim.state.time;
      sim.manualWind.horizontal = t >= 3 && t < 5 ? horizontal : 0;
      minAlt = Math.min(minAlt, sim.state.altitude);
      maxAlt = Math.max(maxAlt, sim.state.altitude);
    });
    return { sim, minAlt, maxAlt };
  }

  it('balloons upward in a headwind gust and settles without crashing', () => {
    const { sim, maxAlt } = gustTest(-8);
    expect(maxAlt).toBeGreaterThan(START_ALTITUDE + 5);
    expect(sim.state.crashed).toBe(false);
    expect(sim.state.stalled).toBe(false);
  });

  it('sinks in a tailwind gust and recovers without crashing', () => {
    const { sim, minAlt } = gustTest(8);
    expect(minAlt).toBeLessThan(START_ALTITUDE - 5);
    expect(minAlt).toBeGreaterThan(30);
    expect(sim.state.crashed).toBe(false);
  });

  it('climbs in an updraft and sinks in a downdraft', () => {
    const up = fresh(1, 'manual');
    up.manualWind.vertical = 3;
    run(up, 15, neutral);
    const down = fresh(1, 'manual');
    down.manualWind.vertical = -3;
    run(down, 15, neutral);
    expect(up.state.altitude).toBeGreaterThan(START_ALTITUDE + 20);
    expect(down.state.altitude).toBeLessThan(START_ALTITUDE - 20);
  });

  it('produces gusts and drifting wind in auto mode, and is deterministic per seed', () => {
    const a = fresh(5, 'auto');
    const b = fresh(5, 'auto');
    a.difficultyOverride = 0.5;
    b.difficultyOverride = 0.5;
    let maxGust = 0;
    let minH = Infinity;
    let maxH = -Infinity;
    run(a, 60, neutral, () => {
      maxGust = Math.max(maxGust, a.state.wind.gust);
      minH = Math.min(minH, a.state.wind.horizontal);
      maxH = Math.max(maxH, a.state.wind.horizontal);
    });
    run(b, 60, neutral);
    expect(maxGust).toBeGreaterThan(0.2);
    expect(maxH - minH).toBeGreaterThan(2);
    expect(a.state.distance).toBe(b.state.distance);
    expect(a.state.altitude).toBe(b.state.altitude);
  });

  it('survives alternating full up and down input without blowing up', () => {
    const sim = fresh(3, 'auto');
    sim.difficultyOverride = 0.5;
    let minAlt = Infinity;
    run(sim, 40, neutral, () => {
      const t = sim.state.time;
      const axis = Math.floor(t / 1.5) % 2 === 0 ? 1 : -1;
      sim.step(FIXED_DT, { ...neutral, pitchAxis: axis });
      minAlt = Math.min(minAlt, sim.state.altitude);
      return sim.state.crashed;
    });
    const s = sim.state;
    for (const v of [s.altitude, s.vx, s.vy, s.pitch, s.airspeed]) expect(Number.isFinite(v)).toBe(true);
    expect(Math.abs(s.pitch)).toBeLessThanOrEqual(PHYSICS.pitchLimit + 1e-9);
  });

  it('handles a strong sustained headwind and tailwind', () => {
    const head = fresh(1, 'manual');
    head.manualWind.horizontal = -8;
    run(head, 30, neutral);
    expect(head.state.crashed).toBe(false);
    expect(head.state.airspeed).toBeGreaterThan(head.state.vx);

    const tail = fresh(1, 'manual');
    tail.manualWind.horizontal = 8;
    let stalledOnce = false;
    run(tail, 30, neutral, () => {
      stalledOnce ||= tail.state.stalled;
    });
    // A tailwind steals airspeed: the plane dips and may stall, but trims out.
    expect(tail.state.crashed).toBe(false);
    expect(tail.state.airspeed).toBeLessThan(tail.state.vx);
    expect(stalledOnce || tail.state.altitude < START_ALTITUDE).toBe(true);
  });

  it('is carried sideways by a cross wind', () => {
    const sim = fresh(1, 'manual');
    sim.manualWind.cross = 4;
    run(sim, 10, neutral);
    expect(sim.state.posX).toBeGreaterThan(30);
    expect(Math.abs(sim.state.heading)).toBeLessThan(0.01);
  });

  it('keeps the state finite under full difficulty with no input', () => {
    for (const seed of [1, 2, 3]) {
      const sim = fresh(seed, 'auto');
      sim.difficultyOverride = 1;
      run(sim, 90, neutral, () => sim.state.crashed);
      const s = sim.state;
      for (const v of [s.altitude, s.vx, s.vy, s.pitch, s.pitchRate, s.airspeed, s.bank]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(Math.abs(s.pitch)).toBeLessThanOrEqual(PHYSICS.pitchLimit + 1e-9);
    }
  });
});

describe('turning', () => {
  it('banks gradually and turns right under held right input, costing some altitude', () => {
    const sim = fresh();
    sim.step(FIXED_DT, rollRight);
    expect(sim.state.bank).toBeLessThan((1 * Math.PI) / 180);
    run(sim, 6, rollRight);
    const s = sim.state;
    expect(s.bank).toBeGreaterThan((25 * Math.PI) / 180);
    expect(s.bank).toBeLessThanOrEqual(PHYSICS.bankLimit);
    expect(s.heading).toBeGreaterThan((60 * Math.PI) / 180);
    expect(s.posX).toBeGreaterThan(10);
    expect(s.altitude).toBeLessThan(START_ALTITUDE);
    expect(s.altitude).toBeGreaterThan(START_ALTITUDE - 40);
    expect(s.crashed).toBe(false);
  });

  it('rolls level and holds heading when the roll input is released', () => {
    const sim = fresh();
    run(sim, 3, rollRight);
    const headingAtRelease = sim.state.heading;
    run(sim, 6, neutral);
    expect(Math.abs(sim.state.bank)).toBeLessThan((3 * Math.PI) / 180);
    // Heading keeps changing briefly while the bank decays, then settles.
    const settled = sim.state.heading;
    run(sim, 3, neutral);
    expect(Math.abs(sim.state.heading - settled)).toBeLessThan(0.02);
    expect(settled).toBeGreaterThan(headingAtRelease);
  });

  it('can fly a full circle and come back near the start line', () => {
    const sim = fresh();
    let maxHeading = 0;
    run(sim, 40, rollRight, () => {
      maxHeading = Math.max(maxHeading, sim.state.heading);
      return sim.state.heading > Math.PI * 2 || sim.state.crashed;
    });
    expect(sim.state.crashed).toBe(false);
    expect(maxHeading).toBeGreaterThan(Math.PI * 2);
    // Path length is still counted even though the plane came back round.
    expect(sim.state.distance).toBeGreaterThan(100);
  });
});

describe('difficulty curve', () => {
  it('stays within the documented ranges at both ends and grows monotonically', () => {
    const p0 = difficultyParams(0, createWindParams());
    const p1 = difficultyParams(1, createWindParams());
    expect(p0.baseAmp).toBeCloseTo(1.5);
    expect(p1.baseAmp).toBeCloseTo(8);
    expect(p0.turbAmp).toBe(0);
    expect(p1.turbAmp).toBe(1);
    expect(p0.gustMag).toBeLessThan(p1.gustMag);
    expect(p0.gustRate).toBeLessThan(p1.gustRate);
    expect(difficultyParams(0.2, createWindParams()).turbAmp).toBe(0);
    let last = -1;
    for (let p = 0; p <= 1.0001; p += 0.1) {
      const d = difficultyParams(p, createWindParams());
      expect(d.gustMag).toBeGreaterThanOrEqual(last);
      last = d.gustMag;
    }
  });
});

describe('fixed step loop', () => {
  it('gives the same trajectory at 30 Hz and 240 Hz frame cadences', () => {
    const makeRun = (frameDt: number) => {
      const sim = fresh(9, 'auto');
      sim.difficultyOverride = 0.6;
      const stepper = new FixedStepper();
      const frames = Math.round(60 / frameDt);
      for (let i = 0; i < frames; i++) {
        stepper.advance(frameDt, (dt) => sim.step(dt, climbOrNeutral(sim.state.time)));
      }
      return sim.state;
    };
    const climbOrNeutral = (t: number) => (Math.floor(t / 4) % 2 === 0 ? neutral : climb);
    const slow = makeRun(1 / 30);
    const fast = makeRun(1 / 240);
    // Floating-point accumulation may leave the runs one fixed step apart.
    expect(Math.abs(slow.distance - fast.distance)).toBeLessThan(PHYSICS.vRef * 2 * FIXED_DT);
    expect(Math.abs(slow.altitude - fast.altitude)).toBeLessThan(0.5);
  });

  it('caps catch-up after a long frame', () => {
    const stepper = new FixedStepper();
    let steps = 0;
    stepper.advance(5, () => {
      steps += 1;
    });
    expect(steps).toBeLessThanOrEqual(Math.ceil(0.25 / FIXED_DT));
  });
});
