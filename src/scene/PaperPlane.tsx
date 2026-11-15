import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createPaperPlaneParts } from './planeGeometry';
import { createPaperTextures } from './textures';
import { launch, renderState } from '@/state/live';
import { PHYSICS } from '@/sim/constants';
import { noise1 } from '@/sim/noise';
import { clamp, damp, lerp, smoothstep } from '@/utils/math';

const PLANE_FX = {
  /** Rest height after a crash so the plane sits on the ground, not in it. */
  groundRest: 0.3,
  /** Wing flex (radians) per unit of load factor above 1 g, per rad/s of pitch rate, and from turbulence. */
  flexPerLoad: 0.1,
  flexPerPitchRate: 0.04,
  flexTurbulence: 0.05,
  flexLimit: 0.22,
  flexResponse: 12,
  /** Crash pose: nose down, tipped onto a wing, with a short bounce. */
  crashPitch: -0.3,
  crashBank: 0.85,
  crashSettleSeconds: 0.9,
  crashBounceHeight: 0.35,
} as const;

export function PaperPlane() {
  const group = useRef<THREE.Group>(null);
  const leftWing = useRef<THREE.Mesh>(null);
  const rightWing = useRef<THREE.Mesh>(null);
  const flex = useRef(0);
  const crashTime = useRef(0);

  const parts = useMemo(() => createPaperPlaneParts(), []);
  const material = useMemo(() => {
    const { map, bumpMap } = createPaperTextures();
    return new THREE.MeshStandardMaterial({
      map,
      bumpMap,
      bumpScale: 0.0025,
      color: '#ffffff',
      roughness: 0.88,
      metalness: 0,
      side: THREE.DoubleSide,
      flatShading: true,
      vertexColors: true,
    });
  }, []);

  useFrame((state, rawDt) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(rawDt, 0.1);
    const r = renderState;
    const t = state.clock.elapsedTime;

    // In the thrower's hand (menu and launch): follow the hand pose written by <Boy />.
    if (launch.active && launch.handValid) {
      g.position.set(launch.handX, launch.handY, launch.handZ);
      g.quaternion.set(launch.handQx, launch.handQy, launch.handQz, launch.handQw);
      flex.current = 0;
      if (leftWing.current) leftWing.current.rotation.z = 0;
      if (rightWing.current) rightWing.current.rotation.z = 0;
      return;
    }

    // Crash pose blends in over the crash beat; resets when a new flight starts.
    crashTime.current = r.crashed ? crashTime.current + dt : 0;
    const k = smoothstep(0, PLANE_FX.crashSettleSeconds, crashTime.current);
    const bounce =
      r.crashed ? Math.abs(Math.sin(crashTime.current * 10)) * Math.exp(-crashTime.current * 4) * PLANE_FX.crashBounceHeight : 0;

    const pitch = lerp(r.pitch, PLANE_FX.crashPitch, k);
    const bank = lerp(r.bank, PLANE_FX.crashBank, k);
    const y = Math.max(r.altitude, PLANE_FX.groundRest) + bounce;

    // Floating origin: the plane stays at the ground origin and the world moves past it.
    // Render space is world-aligned: yaw by heading, then pitch, then roll.
    // Heading right and bank right are both negative rotations in three.js's frame.
    g.position.set(0, y, 0);
    g.rotation.set(pitch, -r.heading, -bank, 'YXZ');

    // Wing flex: bends up under g, twitches with pitch rate and turbulence.
    const load = r.lift / (PHYSICS.mass * PHYSICS.gravity) - 1;
    const target = clamp(
      load * PLANE_FX.flexPerLoad +
        r.pitchRate * PLANE_FX.flexPerPitchRate +
        r.wind.turbulence * PLANE_FX.flexTurbulence * noise1(t * 9, 77),
      -PLANE_FX.flexLimit,
      PLANE_FX.flexLimit,
    );
    flex.current = damp(flex.current, target, PLANE_FX.flexResponse, dt);
    if (leftWing.current) leftWing.current.rotation.z = -flex.current;
    if (rightWing.current) rightWing.current.rotation.z = flex.current;
  });

  return (
    <group ref={group}>
      <mesh ref={leftWing} geometry={parts.leftWing} material={material} />
      <mesh ref={rightWing} geometry={parts.rightWing} material={material} />
      <mesh geometry={parts.keel} material={material} />
    </group>
  );
}
