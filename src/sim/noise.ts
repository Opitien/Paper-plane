/**
 * 1D value noise in [-1, 1], continuous and smooth, deterministic for a seed.
 * Used for slow wind drift and fast turbulence. Not allocation-free-critical
 * but allocates nothing anyway.
 */

function hash(i: number, seed: number): number {
  let h = (Math.imul(i, 374761393) + Math.imul(seed, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i, seed) * 2 - 1;
  const b = hash(i + 1, seed) * 2 - 1;
  // Quintic smoothstep for a continuous second derivative.
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return a + (b - a) * u;
}
