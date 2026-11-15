import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HILL, LAUNCH } from '@/sim/constants';
import { launch, renderState } from '@/state/live';
import { useGameStore } from '@/state/gameStore';
import { lerp, smoothstep } from '@/utils/math';

/**
 * A low-poly boy standing on the hilltop who throws the plane. Built from
 * primitives in metre-ish units and scaled up to match the oversized plane.
 * Writes the throwing hand's pose into `launch` every frame while the launch
 * is active so the plane can sit in it.
 */

const BOY = {
  scale: 7.6,
  /** Arm angles (radians about the shoulder X axis): 0 hangs down, pi/2 points forward, pi points up. */
  armIdle: 1.25,
  armBack: 3.65,
  armRelease: 1.85,
  armRest: 1.05,
  /** Where the boy stands relative to the world origin, in render units. */
  offsetX: -2.1,
  offsetZ: 3.6,
} as const;

const COLORS = {
  skin: '#f1c27d',
  shirt: '#e63946',
  shorts: '#2a4d8f',
  shoes: '#2b2b2b',
  hair: '#3b2a1a',
};

const scratchPos = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();

/** Shoulder angle for a launch time. The menu holds `t = 0`. */
export function armAngle(t: number): number {
  const windupEnd = LAUNCH.windupSeconds;
  const releaseAt = windupEnd + LAUNCH.throwSeconds;
  if (t <= 0) return BOY.armIdle;
  if (t < windupEnd) return lerp(BOY.armIdle, BOY.armBack, smoothstep(0, windupEnd, t));
  if (t < releaseAt) {
    const k = (t - windupEnd) / LAUNCH.throwSeconds;
    return lerp(BOY.armBack, BOY.armRelease, 1 - (1 - k) * (1 - k)); // ease-out: fast start, settles at release
  }
  return lerp(BOY.armRelease, BOY.armRest, smoothstep(releaseAt, releaseAt + 0.8, t));
}

export function Boy() {
  const group = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const anchor = useRef<THREE.Object3D>(null);

  const materials = useMemo(
    () => ({
      skin: new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.9 }),
      shirt: new THREE.MeshStandardMaterial({ color: COLORS.shirt, roughness: 0.95 }),
      shorts: new THREE.MeshStandardMaterial({ color: COLORS.shorts, roughness: 0.95 }),
      shoes: new THREE.MeshStandardMaterial({ color: COLORS.shoes, roughness: 1 }),
      hair: new THREE.MeshStandardMaterial({ color: COLORS.hair, roughness: 1 }),
    }),
    [],
  );

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    // The boy stands at the world origin; render space moves with the plane.
    g.position.set(BOY.offsetX - renderState.posX, HILL.height, BOY.offsetZ + renderState.posZ);

    const phase = useGameStore.getState().phase;
    const t = phase === 'menu' ? 0 : launch.t;
    if (arm.current) arm.current.rotation.x = armAngle(t);

    if (launch.active && anchor.current) {
      g.updateMatrixWorld(true);
      anchor.current.getWorldPosition(scratchPos);
      anchor.current.getWorldQuaternion(scratchQuat);
      launch.handX = scratchPos.x;
      launch.handY = scratchPos.y;
      launch.handZ = scratchPos.z;
      launch.handQx = scratchQuat.x;
      launch.handQy = scratchQuat.y;
      launch.handQz = scratchQuat.z;
      launch.handQw = scratchQuat.w;
      launch.handValid = true;
    }
  }, -3);

  const s = BOY.scale;
  return (
    <group ref={group} scale={[s, s, s]}>
      {/* legs */}
      <mesh position={[-0.12, 0.38, 0]} material={materials.skin}>
        <cylinderGeometry args={[0.08, 0.09, 0.76, 10]} />
      </mesh>
      <mesh position={[0.12, 0.38, 0.04]} material={materials.skin}>
        <cylinderGeometry args={[0.08, 0.09, 0.76, 10]} />
      </mesh>
      <mesh position={[-0.12, 0.04, 0.03]} material={materials.shoes}>
        <boxGeometry args={[0.16, 0.08, 0.28]} />
      </mesh>
      <mesh position={[0.12, 0.04, 0.07]} material={materials.shoes}>
        <boxGeometry args={[0.16, 0.08, 0.28]} />
      </mesh>
      {/* shorts and torso */}
      <mesh position={[0, 0.84, 0]} material={materials.shorts}>
        <boxGeometry args={[0.38, 0.3, 0.24]} />
      </mesh>
      <mesh position={[0, 1.22, 0]} material={materials.shirt}>
        <boxGeometry args={[0.44, 0.5, 0.26]} />
      </mesh>
      {/* head */}
      <mesh position={[0, 1.66, 0]} material={materials.skin}>
        <sphereGeometry args={[0.16, 16, 12]} />
      </mesh>
      <mesh position={[0, 1.73, -0.02]} material={materials.hair}>
        <sphereGeometry args={[0.165, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
      </mesh>
      {/* left arm, relaxed */}
      <group position={[-0.28, 1.42, 0]} rotation={[0.25, 0, 0.15]}>
        <mesh position={[0, -0.3, 0]} material={materials.skin}>
          <cylinderGeometry args={[0.055, 0.05, 0.6, 10]} />
        </mesh>
      </group>
      {/* right (throwing) arm: pivot at the shoulder, hand at the end */}
      <group ref={arm} position={[0.28, 1.42, 0]} rotation={[BOY.armIdle, 0, -0.1]}>
        <mesh position={[0, -0.3, 0]} material={materials.skin}>
          <cylinderGeometry args={[0.055, 0.05, 0.6, 10]} />
        </mesh>
        <mesh position={[0, -0.62, 0]} material={materials.skin}>
          <sphereGeometry args={[0.07, 10, 8]} />
        </mesh>
        {/* Plane anchor: nose along the arm, keel perpendicular. Unscaled so the plane keeps its size. */}
        <object3D ref={anchor} position={[0, -0.7, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1 / s, 1 / s, 1 / s]} />
      </group>
    </group>
  );
}
