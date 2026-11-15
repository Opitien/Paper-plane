import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { FixedStepper } from '@/sim/loop';
import { LAUNCH } from '@/sim/constants';
import { intent, updateIntent } from '@/input/intent';
import { frameStats, interpolateRender, launch, simulation } from '@/state/live';
import { useGameStore } from '@/state/gameStore';
import { publishHud } from '@/state/hudStore';
import { audio } from '@/audio/engine';

/** Seconds the crash is shown before the score card. */
const CRASH_BEAT = 1.2;
/** The boy's follow-through keeps animating this long after release. */
const FOLLOW_THROUGH_SECONDS = 1.5;

/**
 * Drives the fixed-step simulation from the render loop according to the
 * game phase. Runs before every other useFrame subscriber (negative priority)
 * so the scene reads a freshly interpolated state.
 */
export function SimDriver() {
  const stepper = useRef(new FixedStepper());
  const fpsWindow = useRef({ time: 0, frames: 0 });
  const crashedAt = useRef(0);

  useFrame((state, rawDt) => {
    const store = useGameStore.getState();
    const now = state.clock.elapsedTime;
    const dt = Math.min(rawDt, 0.1);
    let alpha = stepper.current.accumulator;

    switch (store.phase) {
      case 'menu':
        launch.t = 0;
        break;
      case 'launching': {
        if (launch.frozen) break;
        if (launch.skip && launch.t < LAUNCH.windupSeconds) launch.t = LAUNCH.windupSeconds;
        launch.t += dt;
        if (launch.t >= LAUNCH.windupSeconds + LAUNCH.throwSeconds) {
          stepper.current.reset();
          store.release();
        }
        break;
      }
      case 'playing':
        if (launch.t < LAUNCH.windupSeconds + LAUNCH.throwSeconds + FOLLOW_THROUGH_SECONDS) launch.t += dt;
        alpha = stepper.current.advance(rawDt, (stepDt) => {
          updateIntent(stepDt);
          simulation.step(stepDt, intent);
          if (simulation.ringsThisStep > 0) audio.blip('ring');
        });
        if (simulation.state.crashed) {
          store.crash();
          crashedAt.current = now;
        }
        break;
      case 'crashed':
        if (now - crashedAt.current >= CRASH_BEAT) store.finish();
        break;
      case 'paused':
      case 'gameover':
        break;
    }

    interpolateRender(alpha);

    const w = fpsWindow.current;
    w.time += rawDt;
    w.frames += 1;
    if (w.time >= 0.5) {
      frameStats.fps = w.frames / w.time;
      frameStats.drawCalls = state.gl.info.render.calls;
      frameStats.triangles = state.gl.info.render.triangles;
      w.time = 0;
      w.frames = 0;
    }

    publishHud(now);
    audio.update(simulation.state, store.phase, dt);
  }, -10);

  return null;
}
