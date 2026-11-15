import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { currentSky } from './skyPalette';
import { renderState } from '@/state/live';
import { useGameStore } from '@/state/gameStore';
import { TIER_SETTINGS } from '@/utils/quality';
import { Rng } from '@/sim/rng';
import { PHYSICS } from '@/sim/constants';
import { clamp } from '@/utils/math';

/**
 * Thin streaks that hang in the air around the plane and rush past it. They
 * show airspeed, wind direction and gusts. Every streak shares one relative
 * velocity (wind minus plane velocity), so the direction is a uniform and
 * only positions live per instance.
 */

const PARTICLES = {
  baseCount: 220,
  /** Spawn box around the plane in its heading frame, metres. */
  ahead: [-15, 70] as const,
  lateral: 32,
  vertical: 16,
  /** Streak length per m/s of relative speed, and its clamps. */
  lengthPerSpeed: 0.05,
  minLength: 0.3,
  maxLength: 3.2,
  width: 0.035,
  /** Visibility: a little always, more in gusts, turbulence and overspeed. */
  baseOpacity: 0.1,
  gustOpacity: 0.45,
  turbulenceOpacity: 0.3,
  overspeedOpacity: 0.25,
} as const;

const vertexShader = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aAlpha;
  uniform vec3 uRelVel;
  uniform float uLength;
  uniform float uWidth;
  varying float vAlpha;
  varying vec2 vQuad;

  void main() {
    vec4 c = modelViewMatrix * vec4(aOffset, 1.0);
    vec3 dv = (modelViewMatrix * vec4(uRelVel, 0.0)).xyz;
    float speed = length(dv);
    dv = speed > 1e-4 ? dv / speed : vec3(0.0, 0.0, 1.0);
    vec3 side = cross(dv, vec3(0.0, 0.0, 1.0));
    float sideLen = length(side);
    side = sideLen > 1e-4 ? side / sideLen : vec3(1.0, 0.0, 0.0);
    vec3 p = c.xyz + dv * (position.y * uLength) + side * (position.x * uWidth);
    vQuad = position.xy * 2.0;
    // Fade streaks that are too close to the camera; they would read as bars.
    vAlpha = aAlpha * smoothstep(1.2, 5.0, length(c.xyz));
    gl_Position = projectionMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  varying vec2 vQuad;

  void main() {
    float across = 1.0 - vQuad.x * vQuad.x;
    float along = 1.0 - vQuad.y * vQuad.y;
    float a = across * along * vAlpha * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

interface Runtime {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  offsets: THREE.InstancedBufferAttribute;
  count: number;
  wx: Float32Array;
  wy: Float32Array;
  wz: Float32Array;
  rng: Rng;
}

function spawn(rt: Runtime, i: number, px: number, py: number, pz: number, sinH: number, cosH: number, ahead: number): void {
  const lateral = rt.rng.signed() * PARTICLES.lateral;
  rt.wx[i] = px + ahead * sinH + lateral * cosH;
  rt.wz[i] = pz + ahead * cosH - lateral * sinH;
  rt.wy[i] = py + rt.rng.signed() * PARTICLES.vertical;
}

function build(count: number): Runtime {
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('uv', base.getAttribute('uv'));
  geometry.instanceCount = count;

  const rng = new Rng(4242);
  const offsetArray = new Float32Array(count * 3);
  const alphaArray = new Float32Array(count);
  for (let i = 0; i < count; i++) alphaArray[i] = rng.range(0.4, 1);
  const offsets = new THREE.InstancedBufferAttribute(offsetArray, 3);
  offsets.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aOffset', offsets);
  geometry.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alphaArray, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uRelVel: { value: new THREE.Vector3(0, 0, 1) },
      uLength: { value: 1 },
      uWidth: { value: PARTICLES.width },
      uColor: { value: new THREE.Color('#ffffff') },
      uOpacity: { value: 0 },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;

  const rt: Runtime = {
    mesh,
    material,
    offsets,
    count,
    wx: new Float32Array(count),
    wy: new Float32Array(count),
    wz: new Float32Array(count),
    rng,
  };
  for (let i = 0; i < count; i++) {
    spawn(rt, i, 0, renderState.altitude, 0, 0, 1, rng.range(PARTICLES.ahead[0], PARTICLES.ahead[1]));
  }
  return rt;
}

export function WindParticles() {
  const tier = useGameStore((s) => s.qualityTier);
  const rt = useMemo(() => build(Math.max(20, Math.round(PARTICLES.baseCount * TIER_SETTINGS[tier].cloudScale))), [tier]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const r = renderState;
    const sinH = Math.sin(r.heading);
    const cosH = Math.cos(r.heading);
    const w = r.wind;

    // Air moves with the wind (world frame); streaks are fixed in the air.
    const windX = w.horizontal * sinH + w.cross * cosH;
    const windZ = w.horizontal * cosH - w.cross * sinH;
    const windY = w.vertical;

    // Relative velocity of the air seen from the plane, in render space (sim +Z = render -Z).
    const drift = w.cross * PHYSICS.crossDrift;
    const planeVx = r.vx * sinH + drift * cosH;
    const planeVz = r.vx * cosH - drift * sinH;
    rt.material.uniforms.uRelVel.value.set(windX - planeVx, windY - r.vy, -(windZ - planeVz));
    const relSpeed = Math.hypot(windX - planeVx, windY - r.vy, windZ - planeVz);
    rt.material.uniforms.uLength.value = clamp(relSpeed * PARTICLES.lengthPerSpeed, PARTICLES.minLength, PARTICLES.maxLength);
    rt.material.uniforms.uOpacity.value =
      PARTICLES.baseOpacity +
      w.gust * PARTICLES.gustOpacity +
      w.turbulence * PARTICLES.turbulenceOpacity +
      (r.overspeed ? PARTICLES.overspeedOpacity : 0);
    (rt.material.uniforms.uColor.value as THREE.Color).copy(currentSky.horizon).lerp(currentSky.cloudLight, 0.5);

    const arr = rt.offsets.array as Float32Array;
    const px = r.posX;
    const py = r.altitude;
    const pz = r.posZ;
    for (let i = 0; i < rt.count; i++) {
      rt.wx[i] += windX * dt;
      rt.wy[i] += windY * dt;
      rt.wz[i] += windZ * dt;
      let rx = rt.wx[i] - px;
      let ry = rt.wy[i] - py;
      let rz = rt.wz[i] - pz;
      const ahead = rx * sinH + rz * cosH;
      const lateral = rx * cosH - rz * sinH;
      if (
        ahead < PARTICLES.ahead[0] ||
        ahead > PARTICLES.ahead[1] + 10 ||
        Math.abs(lateral) > PARTICLES.lateral + 6 ||
        Math.abs(ry) > PARTICLES.vertical + 6 ||
        rt.wy[i] < 0.5
      ) {
        spawn(rt, i, px, py, pz, sinH, cosH, rt.rng.range(PARTICLES.ahead[1] * 0.4, PARTICLES.ahead[1]));
        rx = rt.wx[i] - px;
        ry = rt.wy[i] - py;
        rz = rt.wz[i] - pz;
      }
      arr[i * 3] = rx;
      arr[i * 3 + 1] = ry;
      arr[i * 3 + 2] = -rz;
    }
    rt.offsets.needsUpdate = true;
  });

  return <primitive object={rt.mesh} />;
}
