import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../gameStore';
import { simulation } from '../live';
import { FIXED_DT, START_ALTITUDE } from '@/sim/constants';
import { NEUTRAL_INTENT } from '@/input/intent';

/** Runs the sim as the frame driver would while playing. */
function fly(seconds: number, pitchAxis = 0) {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) simulation.step(FIXED_DT, { ...NEUTRAL_INTENT, pitchAxis });
}

describe('game state machine', () => {
  beforeEach(() => {
    useGameStore.setState({ phase: 'menu', best: null, lastResult: null, isNewBest: false });
  });

  it('starts in the menu, winds up on start, and flies once released', () => {
    const s = useGameStore.getState();
    expect(s.phase).toBe('menu');
    s.startFlight();
    expect(useGameStore.getState().phase).toBe('launching');
    expect(simulation.state.time).toBe(0);
    // Pausing during the throw is ignored; the throw is under a second.
    s.pause();
    expect(useGameStore.getState().phase).toBe('launching');
    s.release();
    expect(useGameStore.getState().phase).toBe('playing');
    expect(simulation.state.altitude).toBe(START_ALTITUDE);
    expect(simulation.state.vy).toBeGreaterThan(0);
    // Release is one-shot.
    s.release();
    expect(useGameStore.getState().phase).toBe('playing');
  });

  it('pauses and resumes only from the right phases', () => {
    const s = useGameStore.getState();
    s.pause();
    expect(useGameStore.getState().phase).toBe('menu');
    s.startFlight();
    s.release();
    s.pause();
    expect(useGameStore.getState().phase).toBe('paused');
    s.pause();
    expect(useGameStore.getState().phase).toBe('paused');
    s.resume();
    expect(useGameStore.getState().phase).toBe('playing');
    s.resume();
    expect(useGameStore.getState().phase).toBe('playing');
  });

  it('runs crash -> gameover with a result, and records a new best', () => {
    const s = useGameStore.getState();
    s.startFlight();
    s.release();
    fly(30, -1);
    expect(simulation.state.crashed).toBe(true);
    s.crash();
    expect(useGameStore.getState().phase).toBe('crashed');
    s.finish();
    const after = useGameStore.getState();
    expect(after.phase).toBe('gameover');
    expect(after.lastResult?.distance).toBeCloseTo(simulation.state.distance);
    expect(after.lastResult?.cause).toBe('ground');
    expect(after.isNewBest).toBe(true);
    expect(after.best?.distance).toBeCloseTo(simulation.state.distance);
  });

  it('keeps the old best when a later flight is shorter', () => {
    const s = useGameStore.getState();
    useGameStore.setState({ best: { distance: 99999, time: 1, maxAltitude: 1, performance: 1, rings: 0, cause: null, date: '' } });
    s.startFlight();
    s.release();
    fly(30, -1);
    s.crash();
    s.finish();
    const after = useGameStore.getState();
    expect(after.isNewBest).toBe(false);
    expect(after.best?.distance).toBe(99999);
  });

  it('restarts from gameover with a fresh flight and can quit to the menu', () => {
    const s = useGameStore.getState();
    s.startFlight();
    s.release();
    fly(30, -1);
    s.crash();
    s.finish();
    s.startFlight();
    expect(useGameStore.getState().phase).toBe('launching');
    expect(simulation.state.crashed).toBe(false);
    expect(simulation.state.distance).toBe(0);
    s.release();
    s.pause();
    s.quitToMenu();
    expect(useGameStore.getState().phase).toBe('menu');
  });

  it('ignores crash and finish outside their phases', () => {
    const s = useGameStore.getState();
    s.crash();
    expect(useGameStore.getState().phase).toBe('menu');
    s.finish();
    expect(useGameStore.getState().phase).toBe('menu');
  });

  it('only lets the probe change quality while on auto', () => {
    const s = useGameStore.getState();
    s.setQualityChoice('high');
    s.applyProbe('down');
    expect(useGameStore.getState().qualityTier).toBe('high');
    s.setQualityChoice('auto');
    const before = useGameStore.getState().qualityTier;
    s.applyProbe('down');
    expect(useGameStore.getState().qualityTier).not.toBe('high');
    expect(['low', 'medium']).toContain(useGameStore.getState().qualityTier);
    expect(before).not.toBe('low');
  });
});
