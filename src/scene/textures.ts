import * as THREE from 'three';
import { Rng } from '@/sim/rng';

/**
 * Procedural textures drawn on canvases at startup. No image files shipped.
 * Each generator is called once and the result cached by the component.
 */

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [canvas, ctx];
}

/** Number of cloud shapes in the atlas, laid out in one row. */
export const CLOUD_VARIANTS = 4;

/** Atlas of soft cloud shapes, alpha only, one per column. */
export function createCloudAtlas(seed = 7, size = 256): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size * CLOUD_VARIANTS;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  for (let v = 0; v < CLOUD_VARIANTS; v++) {
    ctx.save();
    ctx.translate(v * size, 0);
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.clip();
    drawCloudShape(ctx, new Rng(seed + v * 13), size);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

function drawCloudShape(ctx: CanvasRenderingContext2D, rng: Rng, size: number): void {
  ctx.clearRect(0, 0, size, size);
  // A flat-bottomed cluster: a few large soft puffs for the body, then smaller
  // denser puffs along the top edge so the silhouette has lumps rather than
  // being one blur.
  const body = 6;
  for (let i = 0; i < body; i++) {
    const cx = size * (0.5 + rng.signed() * 0.2);
    const cy = size * (0.58 + rng.signed() * 0.06);
    const r = size * rng.range(0.17, 0.24);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tops = 10;
  for (let i = 0; i < tops; i++) {
    const cx = size * (0.5 + rng.signed() * 0.26);
    const cy = size * (0.42 + rng.signed() * 0.1);
    const r = size * rng.range(0.07, 0.14);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  // Fade the whole sprite toward its edges so no quad border ever shows.
  const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size * 0.5);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
}

/** Warm white paper with fibre noise and faint fold shading. */
export function createPaperTextures(seed = 3, size = 512): { map: THREE.Texture; bumpMap: THREE.Texture } {
  const rng = new Rng(seed);

  const [colorCanvas, c] = makeCanvas(size);
  c.fillStyle = '#f6f3ec';
  c.fillRect(0, 0, size, size);
  // Fibres: thousands of tiny low-alpha strokes.
  for (let i = 0; i < 9000; i++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    const len = rng.range(1, 5);
    const ang = rng.next() * Math.PI;
    const shade = 225 + Math.floor(rng.next() * 30);
    c.strokeStyle = `rgba(${shade},${shade - 4},${shade - 12},${rng.range(0.08, 0.25)})`;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    c.stroke();
  }
  // Soft blotches for uneven paper tone.
  for (let i = 0; i < 40; i++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    const r = rng.range(20, 90);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const dark = rng.next() < 0.5;
    g.addColorStop(0, dark ? 'rgba(200,190,170,0.10)' : 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
  }

  const [bumpCanvas, b] = makeCanvas(size);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);
  for (let i = 0; i < 14000; i++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    const v = 110 + Math.floor(rng.next() * 60);
    b.fillStyle = `rgba(${v},${v},${v},0.35)`;
    b.fillRect(x, y, rng.range(1, 3), 1);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  return { map, bumpMap };
}

/** Large-scale blotchy ground so forward motion reads near the floor. Tiles seamlessly enough under fog. */
export function createGroundTexture(seed = 11, size = 512): THREE.Texture {
  const [canvas, ctx] = makeCanvas(size);
  const rng = new Rng(seed);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    const r = rng.range(12, 70);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rng.next() < 0.55;
    g.addColorStop(0, dark ? 'rgba(90,110,100,0.11)' : 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    // Draw wrapped copies so the tile edge is continuous.
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.fillRect(0, 0, size, size);
        ctx.restore();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
