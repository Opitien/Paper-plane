import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HILL } from '@/sim/constants';
import { hillProfile } from '@/sim/terrain';
import { renderState } from '@/state/live';
import { currentSky } from './skyPalette';

const GRASS = new THREE.Color('#9fbf8a');
const SEGMENTS = 56;
const PROFILE_STEPS = 40;

/** The launch hill, built from the same profile the simulation collides with. */
export function Hill() {
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    // Lathe normals face outward only when the profile runs bottom to top,
    // so start on the plain and climb to the summit.
    const points: THREE.Vector2[] = [new THREE.Vector2(HILL.radius + 40, 0)];
    for (let i = PROFILE_STEPS; i >= 0; i--) {
      // Denser sampling near the top where the curve bends.
      const t = i / PROFILE_STEPS;
      const r = HILL.radius * t * t;
      points.push(new THREE.Vector2(r, hillProfile(r)));
    }
    return new THREE.LatheGeometry(points, SEGMENTS);
  }, []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: GRASS.clone(), roughness: 1, metalness: 0, flatShading: false }),
    [],
  );

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    // World origin in render space, given the floating origin.
    m.position.set(-renderState.posX, 0, renderState.posZ);
    material.color.copy(GRASS).lerp(currentSky.ground, 0.75);
  });

  return <mesh ref={mesh} geometry={geometry} material={material} />;
}
