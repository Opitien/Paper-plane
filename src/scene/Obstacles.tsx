import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { OBSTACLES as O } from '@/sim/constants';
import type { Obstacle } from '@/sim/obstacles';
import { renderState, simulation } from '@/state/live';
import { smoothstep } from '@/utils/math';

/**
 * Instanced rendering of the simulation's obstacle pools. Positions come
 * straight from the sim each frame; inactive slots collapse to zero scale.
 */

/** Bright, light colours: saturated darks read as black blobs against the sky. */
const BALLOON_COLORS = ['#ff6b6b', '#ffa94d', '#69db7c', '#ffd43b', '#b197fc', '#ff8fab', '#74c0fc'].map(
  (c) => new THREE.Color(c),
);
const BLADE_LENGTH = 16;
const BLADE_SPIN_RATE = 1.6;

const dummy = new THREE.Object3D();
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
const euler = new THREE.Euler();

function toRender(o: Obstacle, out: THREE.Vector3): THREE.Vector3 {
  return out.set(o.x - renderState.posX, o.y, -(o.z - renderState.posZ));
}

export function Obstacles() {
  const geo = useMemo(() => {
    const tower = new THREE.CylinderGeometry(1.3, 2.4, 1, 12);
    tower.translate(0, 0.5, 0);
    const blade = new THREE.BoxGeometry(1.1, BLADE_LENGTH, 0.35);
    blade.translate(0, BLADE_LENGTH / 2, 0);
    return {
      envelope: new THREE.SphereGeometry(O.balloonRadius, 18, 14),
      basket: new THREE.BoxGeometry(2.4, 1.8, 2.4),
      tower,
      nacelle: new THREE.BoxGeometry(2.6, 2.6, 6.5),
      blade,
      ring: new THREE.TorusGeometry(O.ringRadius, 0.75, 10, 36),
    };
  }, []);

  const mat = useMemo(
    () => ({
      envelope: new THREE.MeshStandardMaterial({ roughness: 0.8, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.12 }),
      basket: new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 1 }),
      tower: new THREE.MeshStandardMaterial({ color: '#e8ecef', roughness: 0.7 }),
      blade: new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.6 }),
      ring: new THREE.MeshStandardMaterial({
        color: '#ffd166',
        emissive: new THREE.Color('#ffb703'),
        emissiveIntensity: 1.2,
        roughness: 0.4,
      }),
    }),
    [],
  );

  const meshes = useMemo(() => {
    const envelope = new THREE.InstancedMesh(geo.envelope, mat.envelope, O.maxBalloons);
    const basket = new THREE.InstancedMesh(geo.basket, mat.basket, O.maxBalloons);
    const tower = new THREE.InstancedMesh(geo.tower, mat.tower, O.maxTurbines);
    const nacelle = new THREE.InstancedMesh(geo.nacelle, mat.tower, O.maxTurbines);
    const blades = new THREE.InstancedMesh(geo.blade, mat.blade, O.maxTurbines * 3);
    const ring = new THREE.InstancedMesh(geo.ring, mat.ring, O.maxRings);
    for (const m of [envelope, basket, tower, nacelle, blades, ring]) {
      m.frustumCulled = false;
      for (let i = 0; i < m.count; i++) m.setMatrixAt(i, hidden);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    for (let i = 0; i < O.maxBalloons; i++) envelope.setColorAt(i, BALLOON_COLORS[i % BALLOON_COLORS.length]);
    return { envelope, basket, tower, nacelle, blades, ring };
  }, [geo, mat]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pos = dummy.position;
    const field = simulation.obstacles;

    // Balloons
    field.balloons.forEach((b, i) => {
      if (!b.active) {
        meshes.envelope.setMatrixAt(i, hidden);
        meshes.basket.setMatrixAt(i, hidden);
        return;
      }
      toRender(b, pos);
      const bob = Math.sin(t * 0.8 + b.seed * 10) * 0.6;
      dummy.position.y += bob;
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1.15, 1);
      dummy.updateMatrix();
      meshes.envelope.setMatrixAt(i, dummy.matrix);
      meshes.envelope.setColorAt(i, BALLOON_COLORS[Math.floor(b.seed * BALLOON_COLORS.length)]);
      dummy.position.y -= O.balloonRadius * 1.15 + 3.2;
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      meshes.basket.setMatrixAt(i, dummy.matrix);
    });

    // Turbines
    field.turbines.forEach((tb, i) => {
      if (!tb.active) {
        meshes.tower.setMatrixAt(i, hidden);
        meshes.nacelle.setMatrixAt(i, hidden);
        for (let k = 0; k < 3; k++) meshes.blades.setMatrixAt(i * 3 + k, hidden);
        return;
      }
      const yaw = Math.PI - tb.facing;
      toRender(tb, pos);
      const hubY = pos.y;
      // Tower from the ground to the hub.
      dummy.position.set(pos.x, 0, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, hubY, 1);
      dummy.updateMatrix();
      meshes.tower.setMatrixAt(i, dummy.matrix);
      // Nacelle at the hub facing the turbine's heading.
      dummy.position.set(pos.x, hubY, pos.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      meshes.nacelle.setMatrixAt(i, dummy.matrix);
      // Three blades spinning in the disc.
      const spin = t * BLADE_SPIN_RATE * (0.7 + 0.6 * Math.abs(renderState.wind.horizontal) / 8) + tb.seed * 6;
      for (let k = 0; k < 3; k++) {
        euler.set(0, yaw, spin + (k * Math.PI * 2) / 3, 'YXZ');
        dummy.position.set(pos.x, hubY, pos.z - 0);
        dummy.quaternion.setFromEuler(euler);
        dummy.updateMatrix();
        meshes.blades.setMatrixAt(i * 3 + k, dummy.matrix);
      }
      dummy.rotation.set(0, 0, 0);
    });

    // Rings
    field.rings.forEach((r, i) => {
      if (!r.active) {
        meshes.ring.setMatrixAt(i, hidden);
        return;
      }
      const shrink = r.collected ? 1 - smoothstep(0, 0.35, renderState.time - r.collectedAt) : 1;
      if (shrink <= 0) {
        meshes.ring.setMatrixAt(i, hidden);
        return;
      }
      toRender(r, pos);
      euler.set(0, Math.PI - r.facing, t * 0.6 + r.seed * 4, 'YXZ');
      dummy.quaternion.setFromEuler(euler);
      const pulse = 1 + Math.sin(t * 3 + r.seed * 8) * 0.03;
      dummy.scale.set(shrink * pulse, shrink * pulse, shrink * pulse);
      dummy.updateMatrix();
      meshes.ring.setMatrixAt(i, dummy.matrix);
    });
    dummy.quaternion.identity();

    for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true;
    if (meshes.envelope.instanceColor) meshes.envelope.instanceColor.needsUpdate = true;
    mat.ring.emissiveIntensity = 1.0 + Math.sin(t * 4) * 0.3;
  });

  return (
    <>
      <primitive object={meshes.envelope} />
      <primitive object={meshes.basket} />
      <primitive object={meshes.tower} />
      <primitive object={meshes.nacelle} />
      <primitive object={meshes.blades} />
      <primitive object={meshes.ring} />
    </>
  );
}
