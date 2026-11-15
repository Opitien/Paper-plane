import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CLOUD_VARIANTS, createCloudAtlas } from './textures';
import { currentSky, skyFx } from './skyPalette';
import { renderState } from '@/state/live';
import { useGameStore } from '@/state/gameStore';
import { TIER_SETTINGS } from '@/utils/quality';
import { Rng } from '@/sim/rng';

/**
 * Three layers of soft billboard clouds rendered as instanced quads.
 * A fixed pool per layer; instances that fall behind the camera are respawned
 * ahead. Nothing is allocated during play. Depth comes from true 3D placement:
 * far clouds are large and distant, near clouds small and close, so parallax
 * is real and each layer passes at its own apparent speed.
 */

interface LayerConfig {
  name: string;
  baseCount: number;
  /** Lateral distance from the track, metres (sign random). */
  lateral: [number, number];
  altitude: [number, number];
  size: [number, number];
  /** Spawn this far ahead of the plane. */
  ahead: [number, number];
  /** Recycle once this far behind the plane. */
  behind: number;
  /** Own motion along the track, m/s. Negative drifts toward the plane like a headwind. */
  drift: number;
  /** How much of the simulated wind this layer visibly follows (near clouds more). */
  windFollow: number;
  opacity: number;
  renderOrder: number;
}

const LAYERS: LayerConfig[] = [
  {
    name: 'far',
    baseCount: 150,
    lateral: [120, 1600],
    altitude: [60, 420],
    size: [140, 320],
    ahead: [900, 2800],
    behind: 500,
    drift: -0.5,
    windFollow: 0.35,
    opacity: 0.85,
    renderOrder: 1,
  },
  {
    name: 'mid',
    baseCount: 120,
    lateral: [40, 520],
    altitude: [25, 260],
    size: [45, 120],
    ahead: [250, 1300],
    behind: 220,
    drift: -1.2,
    windFollow: 0.7,
    opacity: 0.9,
    renderOrder: 2,
  },
  {
    name: 'near',
    baseCount: 60,
    lateral: [14, 180],
    altitude: [20, 220],
    size: [12, 42],
    ahead: [80, 520],
    behind: 60,
    drift: -2.0,
    windFollow: 1.0,
    opacity: 0.95,
    renderOrder: 3,
  },
];

/** Clouds fade later than the ground so distant layers stay visible: multiples of the scene fog. */
const CLOUD_FOG_NEAR_SCALE = 1.6;
const CLOUD_FOG_FAR_SCALE = 1.45;
const ASPECT = 1.6;

const vertexShader = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aSeed;
  attribute float aVariant;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uVariants;
  varying vec2 vUv;
  varying vec2 vAtlasUv;
  varying float vAlpha;
  varying float vFog;

  void main() {
    vUv = uv;
    vAtlasUv = vec2((uv.x + aVariant) / uVariants, uv.y);
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
    float c = cos(aSeed);
    float s = sin(aSeed);
    vec2 p = vec2(position.x * ${ASPECT.toFixed(2)}, position.y);
    p = vec2(p.x * c - p.y * s, p.x * s + p.y * c) * aSize;
    mv.xy += p;
    float depth = -mv.z;
    vFog = smoothstep(uFogNear, uFogFar, depth);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uLight;
  uniform vec3 uShade;
  uniform vec3 uFogColor;
  uniform float uOpacity;
  uniform float uFlash;
  varying vec2 vUv;
  varying vec2 vAtlasUv;
  varying float vAlpha;
  varying float vFog;

  void main() {
    float a = texture2D(uMap, vAtlasUv).a;
    if (a < 0.004) discard;
    vec3 col = mix(uShade, uLight, smoothstep(0.15, 0.85, vUv.y));
    col += vec3(uFlash * 0.7);
    col = mix(col, uFogColor, vFog);
    float alpha = a * vAlpha * uOpacity * (1.0 - vFog * 0.85);
    gl_FragColor = vec4(col, alpha);
    // No tone mapping, to match the sky dome and the scene fog (see Sky.tsx).
    #include <colorspace_fragment>
  }
`;

interface LayerRuntime {
  config: LayerConfig;
  count: number;
  mesh: THREE.Mesh;
  offsets: THREE.InstancedBufferAttribute;
  /** World ground position of each cloud (sim frame: X right, Z forward at heading 0). */
  wx: Float32Array;
  wz: Float32Array;
  y: Float32Array;
  rng: Rng;
}

/** Places cloud `i` relative to the plane: `ahead` along the heading, `lateral` to the right. */
function place(
  layer: LayerRuntime,
  i: number,
  planeX: number,
  planeZ: number,
  sinH: number,
  cosH: number,
  ahead: number,
  lateral: number,
): void {
  layer.wx[i] = planeX + ahead * sinH + lateral * cosH;
  layer.wz[i] = planeZ + ahead * cosH - lateral * sinH;
}

function buildLayer(config: LayerConfig, count: number, texture: THREE.Texture, rng: Rng): LayerRuntime {
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('uv', base.getAttribute('uv'));
  geometry.instanceCount = count;

  const offsetArray = new Float32Array(count * 3);
  const sizeArray = new Float32Array(count);
  const alphaArray = new Float32Array(count);
  const seedArray = new Float32Array(count);
  const variantArray = new Float32Array(count);
  const wx = new Float32Array(count);
  const wz = new Float32Array(count);
  const y = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const side = rng.next() < 0.5 ? -1 : 1;
    const lateral = side * rng.range(config.lateral[0], config.lateral[1]);
    y[i] = rng.range(config.altitude[0], config.altitude[1]);
    // Fill the whole visible span at start so the sky is never empty.
    const ahead = rng.range(-config.behind, config.ahead[1]);
    wx[i] = lateral;
    wz[i] = ahead;
    sizeArray[i] = rng.range(config.size[0], config.size[1]);
    alphaArray[i] = rng.range(0.55, 1);
    seedArray[i] = rng.signed() * 0.35;
    variantArray[i] = Math.floor(rng.next() * CLOUD_VARIANTS);
  }

  const offsets = new THREE.InstancedBufferAttribute(offsetArray, 3);
  offsets.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aOffset', offsets);
  geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizeArray, 1));
  geometry.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alphaArray, 1));
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedArray, 1));
  geometry.setAttribute('aVariant', new THREE.InstancedBufferAttribute(variantArray, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    // Colour uniforms reference the live palette objects (mutated in place by <Environment />).
    uniforms: {
      uMap: { value: texture },
      uLight: { value: currentSky.cloudLight },
      uShade: { value: currentSky.cloudShade },
      uFogColor: { value: currentSky.horizon },
      uFogNear: { value: currentSky.fogNear * CLOUD_FOG_NEAR_SCALE },
      uFogFar: { value: currentSky.fogFar * CLOUD_FOG_FAR_SCALE },
      uOpacity: { value: config.opacity * currentSky.cloudOpacity },
      uVariants: { value: CLOUD_VARIANTS },
      uFlash: { value: 0 },
    },
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = config.renderOrder;

  return { config, count, mesh, offsets, wx, wz, y, rng };
}

function updateLayer(
  layer: LayerRuntime,
  planeX: number,
  planeZ: number,
  heading: number,
  dt: number,
  windHorizontal: number,
  windCross: number,
): void {
  const { config, count, offsets, wx, wz, y, rng } = layer;
  const arr = offsets.array as Float32Array;
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);
  // Clouds drift with the wind, expressed in the plane's frame (along and across the heading).
  const along = (config.drift + windHorizontal * config.windFollow) * dt;
  const across = windCross * config.windFollow * dt;
  const dx = along * sinH + across * cosH;
  const dz = along * cosH - across * sinH;

  for (let i = 0; i < count; i++) {
    wx[i] += dx;
    wz[i] += dz;
    let rx = wx[i] - planeX;
    let rz = wz[i] - planeZ;
    // Distance ahead of the plane along its current heading.
    const ahead = rx * sinH + rz * cosH;
    if (ahead < -config.behind) {
      const side = rng.next() < 0.5 ? -1 : 1;
      place(
        layer,
        i,
        planeX,
        planeZ,
        sinH,
        cosH,
        rng.range(config.ahead[0], config.ahead[1]),
        side * rng.range(config.lateral[0], config.lateral[1]),
      );
      y[i] = rng.range(config.altitude[0], config.altitude[1]);
      rx = wx[i] - planeX;
      rz = wz[i] - planeZ;
    }
    // Render space is world-aligned with the plane at the origin; sim +Z is render -Z.
    arr[i * 3] = rx;
    arr[i * 3 + 1] = y[i];
    arr[i * 3 + 2] = -rz;
  }
  offsets.needsUpdate = true;
}

export function Clouds() {
  const tier = useGameStore((s) => s.qualityTier);
  const layers = useMemo(() => {
    const texture = createCloudAtlas();
    const scale = TIER_SETTINGS[tier].cloudScale;
    return LAYERS.map((config, i) =>
      buildLayer(config, Math.max(8, Math.round(config.baseCount * scale)), texture, new Rng(100 + i)),
    );
  }, [tier]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const r = renderState;
    for (const layer of layers) {
      updateLayer(layer, r.posX, r.posZ, r.heading, dt, r.wind.horizontal, r.wind.cross);
      const u = (layer.mesh.material as THREE.ShaderMaterial).uniforms;
      u.uFogNear.value = currentSky.fogNear * CLOUD_FOG_NEAR_SCALE;
      u.uFogFar.value = currentSky.fogFar * CLOUD_FOG_FAR_SCALE;
      u.uOpacity.value = layer.config.opacity * currentSky.cloudOpacity;
      u.uFlash.value = skyFx.flash;
    }
  });

  return (
    <>
      {layers.map((layer) => (
        <primitive key={layer.config.name} object={layer.mesh} />
      ))}
    </>
  );
}
