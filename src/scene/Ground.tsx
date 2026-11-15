import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createGroundTexture } from './textures';
import { currentSky } from './skyPalette';
import { renderState } from '@/state/live';

const GROUND_SIZE = 7000;
/** World metres covered by one texture tile. */
const TILE_METRES = 180;

export function Ground() {
  const texture = useMemo(() => {
    const t = createGroundTexture();
    t.repeat.set(GROUND_SIZE / TILE_METRES, GROUND_SIZE / TILE_METRES);
    return t;
  }, []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: texture,
        color: currentSky.ground,
        roughness: 1,
        metalness: 0,
      }),
    [texture],
  );
  const mesh = useRef<THREE.Mesh>(null);

  // Floating origin: the ground stays under the plane; the texture scrolls by
  // the plane's world position so motion and turning are visible.
  useFrame(() => {
    texture.offset.x = renderState.posX / TILE_METRES;
    texture.offset.y = renderState.posZ / TILE_METRES;
    material.color.copy(currentSky.ground);
  });

  return (
    <mesh ref={mesh} material={material} rotation-x={-Math.PI / 2} position-y={0} receiveShadow={false}>
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE, 1, 1]} />
    </mesh>
  );
}
