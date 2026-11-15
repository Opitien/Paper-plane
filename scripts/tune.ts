/**
 * Flight model tuning harness. Runs the checklist scenarios from
 * docs/FLIGHT_MODEL.md section 11 headlessly and prints what happened.
 *
 *   npm run tune
 */

import { Simulation } from '../src/sim/simulation';
import { FIXED_DT, PHYSICS } from '../src/sim/constants';
import type { InputIntent } from '../src/sim/types';

const RAD = 180 / Math.PI;

function intent(axis: number, roll = 0): InputIntent {
  return { pitchAxis: axis, rollAxis: roll, pausePressed: false, confirmPressed: false };
}

interface Trace {
  minAlt: number;
  maxAlt: number;
  minV: number;
  maxV: number;
  maxAlpha: number;
  minAlpha: number;
  firstStall: number | null;
  firstOverspeed: number | null;
  crashAt: number | null;
  stallEnd: number | null;
}

function run(
  sim: Simulation,
  seconds: number,
  axisAt: (t: number) => number,
  trace: Trace = {
    minAlt: Infinity,
    maxAlt: -Infinity,
    minV: Infinity,
    maxV: -Infinity,
    maxAlpha: -Infinity,
    minAlpha: Infinity,
    firstStall: null,
    firstOverspeed: null,
    crashAt: null,
    stallEnd: null,
  },
  roll = 0,
): Trace {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    const s = sim.state;
    sim.step(FIXED_DT, intent(axisAt(s.time), roll));
    trace.minAlt = Math.min(trace.minAlt, s.altitude);
    trace.maxAlt = Math.max(trace.maxAlt, s.altitude);
    trace.minV = Math.min(trace.minV, s.airspeed);
    trace.maxV = Math.max(trace.maxV, s.airspeed);
    trace.maxAlpha = Math.max(trace.maxAlpha, s.angleOfAttack);
    trace.minAlpha = Math.min(trace.minAlpha, s.angleOfAttack);
    if (s.stalled && trace.firstStall === null) trace.firstStall = s.time;
    if (!s.stalled && trace.firstStall !== null && trace.stallEnd === null) trace.stallEnd = s.time;
    if (s.overspeed && trace.firstOverspeed === null) trace.firstOverspeed = s.time;
    if (s.crashed && trace.crashAt === null) trace.crashAt = s.time;
    if (s.crashed) break;
  }
  return trace;
}

function fmt(n: number | null, d = 1): string {
  return n === null ? '-' : n.toFixed(d);
}

function report(name: string, sim: Simulation, t: Trace): void {
  const s = sim.state;
  console.log(
    `${name.padEnd(34)} alt[${fmt(t.minAlt)},${fmt(t.maxAlt)}] V[${fmt(t.minV)},${fmt(t.maxV)}] ` +
      `a[${fmt(t.minAlpha * RAD, 0)},${fmt(t.maxAlpha * RAD, 0)}]deg ` +
      `stall@${fmt(t.firstStall)} unstall@${fmt(t.stallEnd)} over@${fmt(t.firstOverspeed)} crash@${fmt(t.crashAt)} ` +
      `| end alt ${fmt(s.altitude)} V ${fmt(s.airspeed)} pitch ${fmt(s.pitch * RAD, 0)} dist ${fmt(s.distance, 0)}`,
  );
}

function fresh(seed = 1, windMode: 'auto' | 'off' | 'manual' = 'off'): Simulation {
  const sim = new Simulation();
  sim.reset(seed);
  sim.windMode = windMode;
  return sim;
}

console.log(`breeze ${PHYSICS.breezeForce} trim ${(PHYSICS.alphaTrim * RAD).toFixed(1)}deg vRef ${PHYSICS.vRef}\n`);

{
  const sim = fresh();
  report('1 neutral, wind off, 30s', sim, run(sim, 30, () => 0));
}
{
  const sim = fresh();
  const t = run(sim, 12, () => 1);
  report('2a hold up 12s', sim, t);
  const sim2 = fresh();
  let stallT: number | null = null;
  const t2 = run(sim2, 40, (time) => {
    if (sim2.state.stalled && stallT === null) stallT = time;
    return stallT === null ? 1 : 0;
  });
  report('2b hold up until stall, release', sim2, t2);
}
{
  const sim = fresh();
  report('3 hold down', sim, run(sim, 30, () => -1));
}
{
  const sim = fresh();
  report('4 tap up 0.3s then neutral', sim, run(sim, 8, (time) => (time < 0.3 ? 1 : 0)));
}
{
  const sim = fresh();
  const t = run(sim, 20, (time) => (time >= 2 && time < 4 ? 1 : 0));
  report('4b hold up 2s then neutral', sim, t);
}
for (const gust of [-8, 8, -10, 10]) {
  const sim = fresh(1, 'manual');
  const t = run(sim, 20, (time) => {
    const inGust = time >= 3 && time < 5;
    sim.manualWind.horizontal = inGust ? gust : 0;
    return 0;
  });
  report(`5 gust ${gust > 0 ? 'tail' : 'head'}wind ${Math.abs(gust)} for 2s`, sim, t);
}
{
  const sim = fresh(1, 'manual');
  sim.manualWind.vertical = 3;
  report('6 updraft 3 m/s', sim, run(sim, 20, () => 0));
  const sim2 = fresh(1, 'manual');
  sim2.manualWind.vertical = -3;
  report('6 downdraft 3 m/s', sim2, run(sim2, 20, () => 0));
}
{
  const sim = fresh(1, 'manual');
  sim.manualWind.turbulence = 1;
  report('7 full turbulence, no input', sim, run(sim, 60, () => 0));
}
for (const seed of [1, 2, 3]) {
  const sim = fresh(seed, 'auto');
  sim.difficultyOverride = 1;
  report(`8 full difficulty, no input, s${seed}`, sim, run(sim, 90, () => 0));
}
for (const seed of [1, 2, 3]) {
  const sim = fresh(seed, 'auto');
  sim.difficultyOverride = 0;
  report(`9 progress 0, no input, s${seed}`, sim, run(sim, 120, () => 0));
}
{
  for (const roll of [1, -1]) {
    const sim = fresh();
    const t = run(sim, 20, () => 0, undefined, roll);
    const s = sim.state;
    report(`11 hold ${roll > 0 ? 'right' : 'left'} roll 20s`, sim, t);
    console.log(
      `    bank ${(s.bank * RAD).toFixed(0)}deg heading ${(s.heading * RAD).toFixed(0)}deg ` +
        `pos (${s.posX.toFixed(0)}, ${s.posZ.toFixed(0)})`,
    );
  }
  const sim = fresh();
  const t = run(sim, 20, () => 0.35, undefined, 1);
  report('11b hold right + 35% up 20s', sim, t);
  console.log(`    bank ${(sim.state.bank * RAD).toFixed(0)}deg heading ${(sim.state.heading * RAD).toFixed(0)}deg`);
}
{
  // Crude autopilot: hold altitude near 80 m with proportional pitch input.
  for (const seed of [1, 2]) {
    const sim = fresh(seed, 'auto');
    sim.difficultyOverride = 1;
    const t = run(sim, 120, () => {
      const s = sim.state;
      if (s.stalled) return -0.6;
      const err = 80 - s.altitude;
      const cmd = err * 0.08 - s.vy * 0.15;
      return Math.max(-1, Math.min(1, cmd));
    });
    report(`10 full difficulty, autopilot, s${seed}`, sim, t);
  }
}
