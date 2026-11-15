import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { launch, renderState } from '@/state/live';
import { useGameStore } from '@/state/gameStore';
import { clamp, damp } from '@/utils/math';
import { HILL, PHYSICS, START_ALTITUDE } from '@/sim/constants';
import { noise1 } from '@/sim/noise';

const CAMERA = {
  /** Offset from the plane in its unpitched frame: up and behind. */
  back: 6.4,
  up: 1.6,
  /** How much of the plane's pitch the camera rig follows. */
  pitchFollow: 0.35,
  /** Sideways slide per radian of bank, toward the outside of the turn. */
  bankSlide: -1.2,
  /** Fraction of the plane's bank the camera rolls with. */
  bankRoll: 0.3,
  /** Exponential damping rates. Lower = more lag. */
  positionDamp: 3.2,
  targetDamp: 5.5,
  /**
   * Look-at point ahead of the plane. With the rig above, these put the
   * horizon a little above mid-frame and the plane in the lower middle.
   */
  lookAhead: 8,
  lookUp: 0.75,
  baseFov: 56,
  fovPerSpeed: 0.45,
  minFov: 50,
  maxFov: 72,
  /** Shake amplitude (metres) at full turbulence, full gust, and in overspeed. */
  shakeTurbulence: 0.09,
  shakeGust: 0.12,
  shakeOverspeed: 0.07,
  /** Roll jitter as a fraction of the positional shake. */
  shakeRoll: 0.2,
  /** Menu: slow orbit around the boy, framed to the left of the menu card. */
  orbitRadius: 36,
  orbitHeight: 15,
  orbitRate: 0.1,
  orbitLookHeight: 6,
  /** Sideways shift of the look target so the boy sits beside the card, not behind it. */
  orbitSideShift: 11,
  /** Launch shot: back and to the right of the thrower, wide enough to see the whole throw. */
  launchOffset: [14, 13, 19] as const,
} as const;

const scratch = {
  desired: new THREE.Vector3(),
  target: new THREE.Vector3(),
  planePos: new THREE.Vector3(),
  forward: new THREE.Vector3(),
  right: new THREE.Vector3(),
  up: new THREE.Vector3(0, 1, 0),
};

export function ChaseCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const smoothedTarget = useRef(new THREE.Vector3(0, START_ALTITUDE, -CAMERA.lookAhead));
  const smoothedPos = useRef(new THREE.Vector3());
  const initialised = useRef(false);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const r = renderState;
    const t = state.clock.elapsedTime;
    const { desired, target, planePos, forward, right, up } = scratch;

    planePos.set(0, r.altitude, 0);

    // World-aligned render space: heading 0 flies toward -Z, heading right turns toward +X.
    const sinH = Math.sin(r.heading);
    const cosH = Math.cos(r.heading);
    forward.set(sinH, 0, -cosH);
    right.set(cosH, 0, sinH);

    // Rig offset rotated partially with pitch in the plane's vertical plane.
    const a = r.pitch * CAMERA.pitchFollow;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const backDist = CAMERA.up * sin + CAMERA.back * cos;
    const upDist = CAMERA.up * cos - CAMERA.back * sin;
    desired
      .copy(planePos)
      .addScaledVector(forward, -backDist)
      .addScaledVector(right, r.bank * CAMERA.bankSlide)
      .setY(planePos.y + upDist);

    const aheadDist = CAMERA.lookAhead * cos - CAMERA.lookUp * sin;
    const lookUpDist = CAMERA.lookUp * cos + CAMERA.lookAhead * sin;
    target.copy(planePos).addScaledVector(forward, aheadDist).setY(planePos.y + lookUpDist);

    // Menu and launch: frame the boy on the hilltop instead of the chase rig.
    const phase = useGameStore.getState().phase;
    if (phase === 'menu') {
      const a = t * CAMERA.orbitRate;
      desired.set(Math.sin(a) * CAMERA.orbitRadius - r.posX, HILL.height + CAMERA.orbitHeight, Math.cos(a) * CAMERA.orbitRadius + r.posZ);
      // Camera right vector for a camera at angle `a` looking at the origin.
      target.set(
        -r.posX + Math.cos(a) * CAMERA.orbitSideShift,
        HILL.height + CAMERA.orbitLookHeight,
        r.posZ - Math.sin(a) * CAMERA.orbitSideShift,
      );
    } else if (phase === 'launching') {
      desired.set(CAMERA.launchOffset[0] - r.posX, HILL.height + CAMERA.launchOffset[1], CAMERA.launchOffset[2] + r.posZ);
      target.set(launch.handX, launch.handY - 1, launch.handZ - 2);
    }

    if (!initialised.current) {
      smoothedPos.current.copy(desired);
      smoothedTarget.current.copy(target);
      initialised.current = true;
    } else {
      smoothedPos.current.lerp(desired, 1 - Math.exp(-CAMERA.positionDamp * dt));
      smoothedTarget.current.lerp(target, 1 - Math.exp(-CAMERA.targetDamp * dt));
    }

    // Shake is added on top of the smoothed rig so it never feeds back into the lag.
    const shakeAmp =
      r.wind.turbulence * CAMERA.shakeTurbulence +
      r.wind.gust * CAMERA.shakeGust +
      (r.overspeed ? CAMERA.shakeOverspeed : 0);
    camera.position
      .copy(smoothedPos.current)
      .addScaledVector(right, noise1(t * 11, 101) * shakeAmp)
      .addScaledVector(up, noise1(t * 13, 102) * shakeAmp);

    camera.up.set(0, 1, 0);
    camera.lookAt(smoothedTarget.current);
    // Roll the view a little with the plane so turns feel committed, plus shake jitter.
    const bankRoll = launch.active ? 0 : r.bank;
    camera.rotateZ(-bankRoll * CAMERA.bankRoll + noise1(t * 9, 103) * shakeAmp * CAMERA.shakeRoll);

    const fovTarget = clamp(
      CAMERA.baseFov + (r.airspeed - PHYSICS.vRef) * CAMERA.fovPerSpeed,
      CAMERA.minFov,
      CAMERA.maxFov,
    );
    const fov = damp(camera.fov, fovTarget, 2, dt);
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
