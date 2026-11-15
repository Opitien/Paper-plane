import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { currentSky, skyFx } from './skyPalette';

const SUN_DISTANCE = 100;

export function Lighting() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);

  useFrame(() => {
    const s = currentSky;
    const d = sun.current;
    if (d) {
      d.position.copy(s.sunDirection).multiplyScalar(SUN_DISTANCE);
      d.intensity = s.sunIntensity;
      d.color.copy(s.sun);
    }
    const h = hemi.current;
    if (h) {
      h.color.copy(s.horizon);
      h.groundColor.copy(s.ground);
      h.intensity = s.hemiIntensity + skyFx.flash * 2.5;
    }
  });

  return (
    <>
      <directionalLight ref={sun} intensity={currentSky.sunIntensity} />
      <hemisphereLight ref={hemi} intensity={currentSky.hemiIntensity} />
    </>
  );
}
