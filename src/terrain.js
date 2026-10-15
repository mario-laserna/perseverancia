import * as THREE from 'three';
import { fbm2, ridged2, noise2, smoothstep } from './noise.js';

const SIZE = 1600; // metros de lado
const SEGMENTS = 420;

const DUNE_ANGLE = 1.89; // crestas casi perpendiculares al sol: sotavento en sombra
const DUNE_COS = Math.cos(DUNE_ANGLE), DUNE_SIN = Math.sin(DUNE_ANGLE);
const DUNE_WAVELENGTH = 34;

/** Cuánto campo de dunas hay en (x, z): 0 = llanura rocosa, 1 = dunas plenas. */
export function duneMask(x, z) {
  const r = Math.hypot(x, z);
  const field = smoothstep(-0.15, 0.25, fbm2(x * 0.0035 + 7.1, z * 0.0035 - 3.3, 3));
  return smoothstep(22, 75, r) * (1 - smoothstep(320, 420, r)) * field;
}

function duneHeight(x, z) {
  const mask = duneMask(x, z);
  if (mask <= 0) return 0;
  const warp = fbm2(x * 0.008, z * 0.008, 3) * 40;
  const s = (x * DUNE_COS + z * DUNE_SIN + warp) / DUNE_WAVELENGTH;
  const t = s - Math.floor(s);
  // Barlovento suave y largo, sotavento corto y empinado.
  const profile = t < 0.72 ? smoothstep(0, 1, t / 0.72) : 1 - smoothstep(0, 1, (t - 0.72) / 0.28);
  const amp = 4.6 * (0.65 + 0.35 * noise2(x * 0.015 + 11, z * 0.015));
  // Pequeños ripples de viento sobre las dunas.
  const ripple = Math.sin((x * DUNE_COS + z * DUNE_SIN) * 2.4 + noise2(x * 0.2, z * 0.2) * 3) * 0.035;
  return mask * (profile * amp + ripple);
}

/** Altura del terreno en metros. */
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h = fbm2(x * 0.004, z * 0.004, 4) * 9;
  h += 6 * Math.exp(-((r / 60) ** 2)); // loma suave donde está la cámara
  h += fbm2(x * 0.06 + 40, z * 0.06, 4) * 0.45 * (1 - duneMask(x, z) * 0.8); // suelo rocoso
  h += duneHeight(x, z);
  const far = smoothstep(260, 620, r);
  if (far > 0) h += far * (ridged2(x * 0.005 + 3, z * 0.005 - 8, 5) * 65 + 6);
  return h;
}

function makeGrainTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Grano fino + manchas suaves periódicas (para que el tile no tenga costuras).
      const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2;
      const blotch = noise2(Math.cos(u) * 2 + Math.sin(v) * 3, Math.sin(u) * 2 + Math.cos(v) * 3) * 0.08;
      const g = 0.9 + blotch + (Math.random() - 0.5) * 0.16;
      const c = Math.max(0, Math.min(255, g * 255));
      const i = (y * size + x) * 4;
      img.data[i] = c; img.data[i + 1] = c * 0.98; img.data[i + 2] = c * 0.96; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createTerrain() {
  const geo = new THREE.PlaneGeometry(2, 2, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  // Rejilla más densa cerca de la cámara (origen) y más gruesa a lo lejos.
  const warp = (u) => (SIZE / 2) * (0.12 * u + 0.88 * u * Math.abs(u));
  for (let i = 0; i < pos.count; i++) {
    const x = warp(pos.getX(i)), z = warp(pos.getZ(i));
    pos.setXYZ(i, x, heightAt(x, z), z);
    uv.setXY(i, x / 3, z / 3);
  }
  geo.computeVertexNormals();

  const normal = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const ochre = new THREE.Color(0xb8743f);
  const rust = new THREE.Color(0x8a3f22);
  const sand = new THREE.Color(0xd49a62);
  const basalt = new THREE.Color(0x4e2a1c);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const slope = 1 - normal.getY(i);
    const dunes = duneMask(x, z);
    const n = fbm2(x * 0.03 + 5, z * 0.03 - 9, 4);
    c.copy(ochre).lerp(rust, smoothstep(-0.3, 0.5, n) * 0.7);
    c.lerp(sand, dunes * 0.85);
    c.lerp(basalt, smoothstep(0.08, 0.45, slope) * (1 - dunes) * 0.6);
    c.lerp(basalt, smoothstep(0.35, 0.7, noise2(x * 0.12, z * 0.12)) * (1 - dunes) * 0.35);
    const v = 0.92 + 0.08 * noise2(x * 0.5, z * 0.5);
    colors[i * 3] = c.r * v; colors[i * 3 + 1] = c.g * v; colors[i * 3 + 2] = c.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const grain = makeGrainTexture();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: grain,
    bumpMap: grain,
    bumpScale: 1.5,
    roughness: 0.97,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}
