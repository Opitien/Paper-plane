import * as THREE from 'three';
import { lerp } from '@/utils/math';

/**
 * Colours and sun placement shared by the sky dome, lighting, fog, ground and
 * clouds so they always agree. Five keyframes indexed by journey progress are
 * blended continuously into `currentSky`, which the scene reads every frame.
 *
 * The dome's horizon colour doubles as the fog colour (see ARCHITECTURE.md,
 * colour pipeline), so they can never drift apart.
 */
export interface SkyStage {
  zenith: THREE.Color;
  horizon: THREE.Color;
  /** Colour of the dome below the horizon line. */
  below: THREE.Color;
  ground: THREE.Color;
  sun: THREE.Color;
  /** Unit vector pointing from the scene toward the sun. */
  sunDirection: THREE.Vector3;
  /** 0..1, fades the visible disc and halo (overcast hides the sun). */
  sunVisibility: number;
  sunIntensity: number;
  hemiIntensity: number;
  fogNear: number;
  fogFar: number;
  cloudLight: THREE.Color;
  cloudShade: THREE.Color;
  /** Multiplier on cloud layer opacity: fewer visible clouds on a clear day. */
  cloudOpacity: number;
}

interface Keyframe {
  at: number;
  name: string;
  stage: SkyStage;
}

function stage(s: {
  zenith: string;
  horizon: string;
  below: string;
  ground: string;
  sun: string;
  sunDirection: [number, number, number];
  sunVisibility: number;
  sunIntensity: number;
  hemiIntensity: number;
  fogNear: number;
  fogFar: number;
  cloudLight: string;
  cloudShade: string;
  cloudOpacity: number;
}): SkyStage {
  return {
    zenith: new THREE.Color(s.zenith),
    horizon: new THREE.Color(s.horizon),
    below: new THREE.Color(s.below),
    ground: new THREE.Color(s.ground),
    sun: new THREE.Color(s.sun),
    sunDirection: new THREE.Vector3(...s.sunDirection).normalize(),
    sunVisibility: s.sunVisibility,
    sunIntensity: s.sunIntensity,
    hemiIntensity: s.hemiIntensity,
    fogNear: s.fogNear,
    fogFar: s.fogFar,
    cloudLight: new THREE.Color(s.cloudLight),
    cloudShade: new THREE.Color(s.cloudShade),
    cloudOpacity: s.cloudOpacity,
  };
}

export const SKY_KEYFRAMES: Keyframe[] = [
  {
    at: 0.0,
    name: 'clear',
    stage: stage({
      zenith: '#2f6fd6',
      horizon: '#c6dff5',
      below: '#9db9cf',
      ground: '#9dbab0',
      sun: '#fff3d2',
      sunDirection: [-0.42, 0.72, -0.55],
      sunVisibility: 1,
      sunIntensity: 2.6,
      hemiIntensity: 0.9,
      fogNear: 250,
      fogFar: 2600,
      cloudLight: '#ffffff',
      cloudShade: '#a6bdd8',
      cloudOpacity: 0.75,
    }),
  },
  {
    at: 0.25,
    name: 'cumulus',
    stage: stage({
      zenith: '#3b7ad4',
      horizon: '#d9e6f1',
      below: '#a9bfcf',
      ground: '#9cb6a6',
      sun: '#fff0c8',
      sunDirection: [-0.5, 0.58, -0.64],
      sunVisibility: 1,
      sunIntensity: 2.4,
      hemiIntensity: 0.95,
      fogNear: 220,
      fogFar: 2400,
      cloudLight: '#ffffff',
      cloudShade: '#9fb4cc',
      cloudOpacity: 1.0,
    }),
  },
  {
    at: 0.5,
    name: 'golden hour',
    stage: stage({
      zenith: '#4b5299',
      horizon: '#f0a76e',
      below: '#a98777',
      ground: '#8c8a78',
      sun: '#ffd9a0',
      sunDirection: [-0.7, 0.17, -0.69],
      sunVisibility: 1,
      sunIntensity: 2.2,
      hemiIntensity: 0.7,
      fogNear: 180,
      fogFar: 2200,
      cloudLight: '#ffd7b3',
      cloudShade: '#8b6f8c',
      cloudOpacity: 1.0,
    }),
  },
  {
    at: 0.72,
    name: 'overcast',
    stage: stage({
      zenith: '#6c7c91',
      horizon: '#b7c0ca',
      below: '#8d99a5',
      ground: '#7e8e87',
      sun: '#e6eaef',
      sunDirection: [-0.3, 0.5, -0.8],
      sunVisibility: 0,
      sunIntensity: 1.0,
      hemiIntensity: 0.8,
      fogNear: 120,
      fogFar: 1800,
      cloudLight: '#d5dce5',
      cloudShade: '#7b8797',
      cloudOpacity: 1.0,
    }),
  },
  {
    at: 1.0,
    name: 'storm',
    stage: stage({
      zenith: '#283240',
      horizon: '#5c6875',
      below: '#444e5a',
      ground: '#4d5856',
      sun: '#c6ced6',
      sunDirection: [-0.3, 0.5, -0.8],
      sunVisibility: 0,
      sunIntensity: 0.6,
      hemiIntensity: 0.55,
      fogNear: 80,
      fogFar: 1300,
      cloudLight: '#8d98a6',
      cloudShade: '#3d4652',
      cloudOpacity: 1.0,
    }),
  },
];

function cloneStage(s: SkyStage): SkyStage {
  return {
    zenith: s.zenith.clone(),
    horizon: s.horizon.clone(),
    below: s.below.clone(),
    ground: s.ground.clone(),
    sun: s.sun.clone(),
    sunDirection: s.sunDirection.clone(),
    sunVisibility: s.sunVisibility,
    sunIntensity: s.sunIntensity,
    hemiIntensity: s.hemiIntensity,
    fogNear: s.fogNear,
    fogFar: s.fogFar,
    cloudLight: s.cloudLight.clone(),
    cloudShade: s.cloudShade.clone(),
    cloudOpacity: s.cloudOpacity,
  };
}

/** The blended stage for the current progress. Mutated in place every frame; never reassigned. */
export const currentSky: SkyStage = cloneStage(SKY_KEYFRAMES[0].stage);

/** Writes the blend of the two keyframes around `progress` into `out`. */
export function blendSky(progress: number, out: SkyStage): void {
  const p = Math.min(1, Math.max(0, progress));
  let i = 0;
  while (i < SKY_KEYFRAMES.length - 2 && p > SKY_KEYFRAMES[i + 1].at) i++;
  const a = SKY_KEYFRAMES[i];
  const b = SKY_KEYFRAMES[i + 1];
  const t = (p - a.at) / (b.at - a.at);
  const s = t * t * (3 - 2 * t); // smoothstep so keyframes do not read as corners

  out.zenith.lerpColors(a.stage.zenith, b.stage.zenith, s);
  out.horizon.lerpColors(a.stage.horizon, b.stage.horizon, s);
  out.below.lerpColors(a.stage.below, b.stage.below, s);
  out.ground.lerpColors(a.stage.ground, b.stage.ground, s);
  out.sun.lerpColors(a.stage.sun, b.stage.sun, s);
  out.sunDirection.lerpVectors(a.stage.sunDirection, b.stage.sunDirection, s).normalize();
  out.sunVisibility = lerp(a.stage.sunVisibility, b.stage.sunVisibility, s);
  out.sunIntensity = lerp(a.stage.sunIntensity, b.stage.sunIntensity, s);
  out.hemiIntensity = lerp(a.stage.hemiIntensity, b.stage.hemiIntensity, s);
  out.fogNear = lerp(a.stage.fogNear, b.stage.fogNear, s);
  out.fogFar = lerp(a.stage.fogFar, b.stage.fogFar, s);
  out.cloudLight.lerpColors(a.stage.cloudLight, b.stage.cloudLight, s);
  out.cloudShade.lerpColors(a.stage.cloudShade, b.stage.cloudShade, s);
  out.cloudOpacity = lerp(a.stage.cloudOpacity, b.stage.cloudOpacity, s);
}

/** Transient effects layered on the palette. Written by <Environment />. */
export const skyFx = {
  /** 0..1 lightning flash brightness. */
  flash: 0,
};

/** Name of the stage the player is in, for the HUD and debug panel. */
export function stageName(progress: number): string {
  let name = SKY_KEYFRAMES[0].name;
  for (const k of SKY_KEYFRAMES) if (progress >= k.at - 0.08) name = k.name;
  return name;
}

export const SKY_DOME_RADIUS = 3200;
export const CAMERA_FAR = 6000;
