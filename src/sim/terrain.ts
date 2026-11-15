import { HILL } from './constants';
import { smoothstep } from '@/utils/math';

/**
 * Ground height at a world position. The world is flat except for the launch
 * hill at the origin: a flat top, then a smooth dome down to the plain. The
 * same function shapes the rendered hill, so what you see is what you hit.
 */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r >= HILL.radius) return 0;
  if (r <= HILL.topRadius) return HILL.height;
  return HILL.height * (1 - smoothstep(HILL.topRadius, HILL.radius, r));
}

/** Radial profile for building the hill mesh: height at radius r. */
export function hillProfile(r: number): number {
  return terrainHeight(r, 0);
}
