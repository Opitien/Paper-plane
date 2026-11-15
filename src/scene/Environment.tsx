import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { blendSky, currentSky, skyFx } from './skyPalette';
import { renderState } from '@/state/live';
import { useGameStore } from '@/state/gameStore';
import { audio } from '@/audio/engine';
import { smoothstep } from '@/utils/math';

const LIGHTNING = {
  /** Flashes start fading in at this progress and are full strength at the end. */
  startProgress: 0.78,
  fullProgress: 0.95,
  /** Seconds between flashes. */
  minGap: 5,
  maxGap: 14,
  /** Exponential decay rate of a flash. */
  decay: 9,
  /** Thunder arrives this long after the flash. */
  thunderDelay: [0.4, 1.6] as const,
  /** Linear brightness the flash adds at the horizon; matches the sky shader's horizon term. */
  horizonBoost: 0.8,
} as const;

/**
 * Blends the sky palette for the current progress, keeps the scene fog in
 * step, and runs the storm lightning. Runs after the sim driver and before
 * everything that reads `currentSky` and `skyFx`.
 */
export function Environment() {
  const scene = useThree((s) => s.scene);
  const nextFlash = useRef(8);
  const flash = useRef(0);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const t = state.clock.elapsedTime;
    blendSky(renderState.progress, currentSky);

    // Lightning only when the sky is actually running (not paused) and stormy enough.
    const phase = useGameStore.getState().phase;
    const stormy = smoothstep(LIGHTNING.startProgress, LIGHTNING.fullProgress, renderState.progress);
    if ((phase === 'playing' || phase === 'menu') && stormy > 0 && t >= nextFlash.current) {
      flash.current = 1;
      nextFlash.current = t + LIGHTNING.minGap + Math.random() * (LIGHTNING.maxGap - LIGHTNING.minGap);
      audio.thunder(LIGHTNING.thunderDelay[0] + Math.random() * (LIGHTNING.thunderDelay[1] - LIGHTNING.thunderDelay[0]));
    }
    if (t >= nextFlash.current && stormy === 0) nextFlash.current = t + LIGHTNING.minGap;
    flash.current *= Math.exp(-LIGHTNING.decay * dt);
    skyFx.flash = flash.current * stormy;

    // Fog colour must track the dome's horizon, including the flash, or the
    // fogged ground splits from the sky along a hard line during lightning.
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(currentSky.horizon).addScalar(skyFx.flash * LIGHTNING.horizonBoost);
      fog.near = currentSky.fogNear;
      fog.far = currentSky.fogFar;
    }
  }, -5);

  return <fog attach="fog" args={[currentSky.horizon.getHex(), currentSky.fogNear, currentSky.fogFar]} />;
}
