import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { FrameProbe } from '@/utils/quality';
import { useGameStore } from '@/state/gameStore';

/**
 * Measures real frame times once the scene is up and lets the store step the
 * quality tier down (or up on desktop) when the player left quality on auto.
 */
export function QualityProbe() {
  const probe = useRef(new FrameProbe());

  useFrame((_, dt) => {
    const verdict = probe.current.add(Math.min(dt, 0.25));
    if (verdict) useGameStore.getState().applyProbe(verdict);
  });

  return null;
}
