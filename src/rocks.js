import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm3, noise3, mulberry32, smoothstep } from './noise.js';
import { heightAt, duneMask } from './terrain.js';

const VARIANTS = 6;

function makeRockGeometry(seed) {
  let geo = new THREE.IcosahedronGeometry(1, 4);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const s = seed * 17.3;
  const squash = 0.45 + (seed % 3) * 0.12;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let r = 1 + 0.32 * fbm3(v.x * 1.1 + s, v.y * 1.1, v.z * 1.1 - s, 3);
    // Caras planas tipo fractura.
    r -= Math.max(0, noise3(v.x * 0.9 - s, v.y * 0.9 + s, v.z * 0.9)) * 0.35;
    r += 0.05 * noise3(v.x * 6 + s, v.y * 6, v.z * 6);
    v.multiplyScalar(r);
    v.y *= squash;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo = geo.toNonIndexed(); // facetado
  geo.computeVertexNormals();
  return geo;
}

/** Rocas instanciadas asentadas en el terreno. */
export function createRocks() {
  const rand = mulberry32(2020); // lanzamiento de Perseverance
  const group = new THREE.Group();
  const placements = Array.from({ length: VARIANTS }, () => []);

  const add = (x, z, scale) => {
    const variant = Math.floor(rand() * VARIANTS);
    placements[variant].push({ x, z, scale, rotY: rand() * Math.PI * 2, tilt: (rand() - 0.5) * 0.4 });
  };

  // Rocas protagonistas en primer plano (la cámara mira hacia -Z).
  add(-3.2, -9, 0.45);
  add(5.5, -16, 0.9);
  add(-9.5, -22, 1.3);
  add(1.2, -5.5, 0.18);
  add(16, -34, 1.9);
  add(-20, -40, 1.2);
  add(8, -24, 0.4);

  // Campo de rocas: muchas pequeñas, menos grandes (ley de potencia).
  let placed = 0;
  while (placed < 1100) {
    const r = 3 + Math.pow(rand(), 1.6) * 160;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (rand() < duneMask(x, z) * 0.95) continue;
    // Cerca de la cámara solo guijarros; lejos, algún bloque grande.
    const maxScale = 0.25 + smoothstep(6, 40, r) * 1.0;
    const scale = 0.04 + Math.pow(rand(), 6) * maxScale;
    add(x, z, scale);
    placed++;
  }

  const material = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, flatShading: true });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p = new THREE.Vector3(), sc = new THREE.Vector3();
  const dark = new THREE.Color(0x4a2c1f), red = new THREE.Color(0x8c4a2c), c = new THREE.Color();

  placements.forEach((list, variant) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(makeRockGeometry(variant + 1), material, list.length);
    list.forEach((it, i) => {
      // Asentar: hundir parte de la roca en el suelo.
      const ground = Math.min(
        heightAt(it.x, it.z),
        heightAt(it.x + it.scale * 0.7, it.z),
        heightAt(it.x - it.scale * 0.7, it.z),
        heightAt(it.x, it.z + it.scale * 0.7),
        heightAt(it.x, it.z - it.scale * 0.7),
      );
      p.set(it.x, ground + it.scale * 0.12, it.z);
      e.set(it.tilt, it.rotY, it.tilt * 0.5);
      q.setFromEuler(e);
      sc.set(it.scale * (0.8 + rand() * 0.5), it.scale, it.scale * (0.8 + rand() * 0.5));
      m.compose(p, q, sc);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.copy(dark).lerp(red, rand() * 0.8));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  return group;
}
