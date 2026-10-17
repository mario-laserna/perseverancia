import * as THREE from 'three';

// El modelo trae las 6 ruedas fusionadas en una malla por material. Aquí se separan en
// piezas con su propio eje: `steer` gira en vertical (dirección) y `spin` rueda sobre el eje.
// En las 4 ruedas de las esquinas, el soporte de la suspensión que baja hasta el buje gira
// con la dirección, como en el rover real.

const CORNER_REACH = 0.42; // unidades del modelo (≈ m) alrededor del eje de dirección que cuenta como soporte de la rueda

const shadowed = (mesh) => Object.assign(mesh, { castShadow: true, receiveShadow: true });

// Geometría con los triángulos `tris` de `geo` (no indexada).
function subGeometry(geo, tris) {
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const n = attr.itemSize * 3;
    const dst = new attr.array.constructor(tris.length * n);
    tris.forEach((t, i) => dst.set(attr.array.subarray(t * n, t * n + n), i * n));
    out.setAttribute(name, new THREE.BufferAttribute(dst, attr.itemSize, attr.normalized));
  }
  return out;
}

// Para cada triángulo, la pieza conectada a la que pertenece (vértices soldados por posición).
function connectedParts(geo) {
  const pos = geo.attributes.position;
  const parent = Int32Array.from({ length: pos.count }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const welded = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
    if (welded.has(key)) parent[find(i)] = find(welded.get(key));
    else welded.set(key, i);
    if (i % 3) parent[find(i)] = find(i - (i % 3));
  }
  const parts = new Map();
  for (let t = 0; t < pos.count / 3; t++) {
    const root = find(t * 3);
    if (!parts.has(root)) parts.set(root, { tris: [], box: new THREE.Box3() });
    const part = parts.get(root);
    part.tris.push(t);
    for (let k = 0; k < 3; k++) part.box.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, t * 3 + k));
  }
  return [...parts.values()];
}

export function rigWheels(model, rover) {
  const group = model.getObjectByName('Wheels_objs');
  const suspension = model.getObjectByName('suspension');
  model.updateMatrixWorld(true);

  // 1. Repartir los triángulos de las ruedas: lado (x) y posición (delantera, media, trasera).
  const sources = group.children.filter((o) => o.isMesh).map((mesh) => {
    const geo = mesh.geometry.toNonIndexed().applyMatrix4(mesh.matrix);
    return { mesh, geo };
  });
  const maxZ = Math.max(...sources.map(({ geo }) => (geo.computeBoundingBox(), Math.max(-geo.boundingBox.min.z, geo.boundingBox.max.z))));
  const slot = (x, z) => (x < 0 ? 0 : 3) + (z < -0.45 * maxZ ? 0 : z > 0.45 * maxZ ? 2 : 1);

  const wheels = Array.from({ length: 6 }, (_, i) => ({ index: i, box: new THREE.Box3(), pieces: [] }));
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (const { mesh, geo } of sources) {
    const pos = geo.attributes.position;
    const bySlot = Array.from({ length: 6 }, () => []);
    for (let t = 0; t < pos.count / 3; t++) {
      c.set(0, 0, 0);
      for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, t * 3 + k));
      c.divideScalar(3);
      bySlot[slot(c.x, c.z)].push(t);
    }
    bySlot.forEach((tris, i) => {
      if (!tris.length) return;
      const sub = subGeometry(geo, tris);
      sub.computeBoundingBox();
      wheels[i].box.union(sub.boundingBox);
      wheels[i].pieces.push({ geo: sub, material: mesh.material });
    });
    group.remove(mesh);
  }

  // 2. Montar cada rueda: grupo de dirección en el centro del buje, grupo de rodadura dentro.
  const toWheels = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  for (const w of wheels) {
    const center = w.box.getCenter(new THREE.Vector3());
    w.steer = new THREE.Group();
    w.steer.position.copy(center);
    w.spin = new THREE.Group();
    w.steer.add(w.spin);
    group.add(w.steer);
    for (const { geo, material } of w.pieces) {
      geo.translate(-center.x, -center.y, -center.z);
      w.spin.add(shadowed(new THREE.Mesh(geo, material)));
    }
    w.corner = w.index % 3 !== 1; // las del medio no tienen motor de dirección
    w.steer.updateMatrixWorld(true);
    w.local = rover.worldToLocal(w.steer.getWorldPosition(new THREE.Vector3()));
    w.radius = ((w.box.max.y - w.box.min.y) / 2) * group.getWorldScale(scale).y;
    w.angle = 0;
  }

  // 3. El soporte de cada rueda de esquina (piezas cerca de su eje y por debajo del motor) gira con ella.
  toWheels.copy(group.matrix).invert().multiply(suspension.matrix);
  for (const mesh of suspension.children.filter((o) => o.isMesh)) {
    const geo = mesh.geometry.toNonIndexed().applyMatrix4(mesh.matrix).applyMatrix4(toWheels);
    const keep = [];
    const attached = new Map();
    for (const part of connectedParts(geo)) {
      const owner = wheels.find((w) => {
        if (!w.corner) return false;
        const p = w.steer.position, b = part.box;
        const reach = Math.max(
          Math.hypot(b.min.x - p.x, b.min.z - p.z), Math.hypot(b.max.x - p.x, b.max.z - p.z),
          Math.hypot(b.min.x - p.x, b.max.z - p.z), Math.hypot(b.max.x - p.x, b.min.z - p.z),
        );
        return reach < CORNER_REACH && b.max.y < w.box.max.y + 0.5 * (w.box.max.y - w.box.min.y);
      });
      if (owner) attached.set(owner, [...(attached.get(owner) ?? []), ...part.tris]);
      else keep.push(...part.tris);
    }
    for (const [w, tris] of attached) {
      const sub = subGeometry(geo, tris).translate(-w.steer.position.x, -w.steer.position.y, -w.steer.position.z);
      w.steer.add(shadowed(new THREE.Mesh(sub, mesh.material)));
    }
    // Lo que no va con ninguna rueda vuelve a la suspensión, en sus coordenadas originales.
    const back = mesh.matrix.clone().invert().multiply(toWheels.clone().invert());
    mesh.geometry = subGeometry(geo, keep).applyMatrix4(back);
  }

  return wheels;
}
