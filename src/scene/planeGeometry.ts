import * as THREE from 'three';
import { Rng } from '@/sim/rng';

/**
 * Procedural folded paper dart, built as three parts so the wings can flex
 * about the central crease.
 *
 * Local frame: nose points toward -Z (Three.js forward), +Y up, +X right.
 * Pivot is 40 percent of the length behind the nose so pitching looks natural.
 * Flat-shaded, double-sided, with an inner fold layer on each wing so the
 * creases read as folded paper rather than a single triangle.
 */

/**
 * Real dart proportions (about 0.28 m long, 0.16 m span) scaled up roughly 9x
 * so the plane reads clearly from the chase camera.
 */
export const PLANE_LENGTH = 2.5;
const WINGSPAN = 1.4;
const KEEL_DEPTH = 0.3;
const DIHEDRAL = 0.18;
const FOLD_LAYER_LIFT = 0.015;
const KEEL_HALF_GAP = 0.01;

/** Per-face tint so folds and keel read even under flat light. */
const TINT_WING = 1.0;
const TINT_FOLD = 0.92;
const TINT_KEEL = 0.86;

export interface PlaneParts {
  leftWing: THREE.BufferGeometry;
  rightWing: THREE.BufferGeometry;
  keel: THREE.BufferGeometry;
}

class PartBuilder {
  private positions: number[] = [];
  private uvs: number[] = [];
  private colors: number[] = [];

  constructor(private readonly noseZ: number) {}

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, tint: number): void {
    for (const p of [a, b, c]) {
      this.positions.push(p.x, p.y, p.z);
      this.uvs.push((p.x / WINGSPAN + 0.5) * 2, ((p.z - this.noseZ) / PLANE_LENGTH) * 3);
      this.colors.push(tint, tint, tint);
    }
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals(); // non-indexed, so these are flat per-face normals
    geometry.computeBoundingSphere();
    return geometry;
  }
}

export function createPaperPlaneParts(seed = 5): PlaneParts {
  const rng = new Rng(seed);
  const jitter = (v: number) => v + rng.signed() * PLANE_LENGTH * 0.01;

  const noseZ = -PLANE_LENGTH * 0.6;
  const tailZ = PLANE_LENGTH * 0.4;

  const nose = new THREE.Vector3(0, 0, noseZ);
  const creaseTail = new THREE.Vector3(0, 0, tailZ);
  const tipL = new THREE.Vector3(-WINGSPAN / 2, DIHEDRAL, jitter(tailZ * 0.96));
  const tipR = new THREE.Vector3(WINGSPAN / 2, DIHEDRAL, jitter(tailZ * 0.96));
  const keelBottom = new THREE.Vector3(0, -KEEL_DEPTH, jitter(tailZ));
  const keelL = new THREE.Vector3(-KEEL_HALF_GAP, 0, 0);
  const keelR = new THREE.Vector3(KEEL_HALF_GAP, 0, 0);

  // Inner fold layer: a narrower triangle sitting just above each wing.
  const foldL = new THREE.Vector3(-WINGSPAN * 0.2, FOLD_LAYER_LIFT + DIHEDRAL * 0.4, tailZ * 0.55);
  const foldR = new THREE.Vector3(WINGSPAN * 0.2, FOLD_LAYER_LIFT + DIHEDRAL * 0.4, tailZ * 0.55);
  const creaseTailUp = creaseTail.clone().setY(FOLD_LAYER_LIFT);
  const noseUp = nose.clone().setY(FOLD_LAYER_LIFT * 0.5);

  const left = new PartBuilder(noseZ);
  left.tri(nose, tipL, creaseTail, TINT_WING);
  left.tri(noseUp, foldL, creaseTailUp, TINT_FOLD);

  const right = new PartBuilder(noseZ);
  right.tri(nose, creaseTail, tipR, TINT_WING);
  right.tri(noseUp, creaseTailUp, foldR, TINT_FOLD);

  const keel = new PartBuilder(noseZ);
  keel.tri(nose.clone().add(keelL), creaseTail.clone().add(keelL), keelBottom.clone().add(keelL), TINT_KEEL);
  keel.tri(nose.clone().add(keelR), keelBottom.clone().add(keelR), creaseTail.clone().add(keelR), TINT_KEEL);

  return { leftWing: left.build(), rightWing: right.build(), keel: keel.build() };
}
