import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { heightAt } from './terrain.js';

// Medidas oficiales de Perseverance: 3,0 m de largo, 2,7 m de ancho, 2,2 m de alto.
const REAL_LENGTH = 3.0;
const TRACK_HALF_WIDTH = 1.1; // mitad de la vía entre ruedas, aprox.
const MAX_SPEED = 2.5; // m/s, muy acelerado respecto a los 4,2 cm/s reales
const TURN_SPEED = 0.9; // rad/s
const MAX_PRINTS = 4000;

const CAMERA_PART = /cam|lens|watson|look_camera/i;

export function createRover(scene) {
  const rover = new THREE.Group(); // origen en el suelo, avanza hacia -Z local
  rover.name = 'Perseverance';
  scene.add(rover);

  const state = { speed: 0, heading: 0, loaded: false };
  rover.position.set(0, heightAt(0, -8), -8);

  const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('/draco/'));
  loader.load('/models/perseverance.glb', (gltf) => {
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    // El eje horizontal más largo es el largo del rover; lo alineamos con Z.
    if (size.x > size.z) model.rotation.y = Math.PI / 2;
    model.scale.setScalar(REAL_LENGTH / Math.max(size.x, size.z));
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);

    const cameras = [];
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
      if (o.name && CAMERA_PART.test(o.name) && !/^\d|cover|bracket|wiring/i.test(o.name)) cameras.push(o.name);
    });
    console.log('Piezas de cámara de Perseverance:', cameras.join(', '));
    rover.add(model);
    rover.userData.cameraParts = cameras;
    state.loaded = true;
  });

  // Huellas: pares de marcas oscuras instanciadas, el buffer se recicla.
  const printGeo = new THREE.PlaneGeometry(0.42, 0.3).rotateX(-Math.PI / 2);
  const printMat = new THREE.MeshStandardMaterial({
    color: 0x5a2a16, roughness: 1, transparent: true, opacity: 0.55,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const prints = new THREE.InstancedMesh(printGeo, printMat, MAX_PRINTS);
  prints.count = 0;
  prints.frustumCulled = false;
  prints.receiveShadow = true;
  scene.add(prints);
  let nextPrint = 0;
  const lastPrintPos = rover.position.clone();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);

  function stamp() {
    for (const side of [-1, 1]) {
      const ox = Math.cos(state.heading) * side * TRACK_HALF_WIDTH;
      const oz = -Math.sin(state.heading) * side * TRACK_HALF_WIDTH;
      p.set(rover.position.x + ox, 0, rover.position.z + oz);
      p.y = heightAt(p.x, p.z) + 0.02;
      q.setFromAxisAngle(yAxis, state.heading);
      m.compose(p, q, s);
      prints.setMatrixAt(nextPrint, m);
      nextPrint = (nextPrint + 1) % MAX_PRINTS;
      prints.count = Math.max(prints.count, nextPrint === 0 ? MAX_PRINTS : nextPrint);
    }
    prints.instanceMatrix.needsUpdate = true;
  }

  const keys = new Set();
  addEventListener('keydown', (e) => keys.add(e.code));
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  const forward = new THREE.Vector3();
  const up = new THREE.Vector3(), fwdPt = new THREE.Vector3(), right = new THREE.Vector3();

  function update(dt) {
    const throttle = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const steer = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
    const target = throttle * MAX_SPEED;
    state.speed += (target - state.speed) * Math.min(1, dt * 2.5);
    if (Math.abs(state.speed) > 0.05 || throttle) state.heading += steer * TURN_SPEED * dt * Math.sign(state.speed || throttle);

    forward.set(-Math.sin(state.heading), 0, -Math.cos(state.heading));
    rover.position.addScaledVector(forward, state.speed * dt);
    const { x, z } = rover.position;
    rover.position.y = heightAt(x, z);

    // Inclinar el chasis según la pendiente bajo las ruedas.
    const hF = heightAt(x + forward.x * 1.4, z + forward.z * 1.4);
    const hB = heightAt(x - forward.x * 1.4, z - forward.z * 1.4);
    const rx = Math.cos(state.heading), rz = -Math.sin(state.heading);
    const hR = heightAt(x + rx * TRACK_HALF_WIDTH, z + rz * TRACK_HALF_WIDTH);
    const hL = heightAt(x - rx * TRACK_HALF_WIDTH, z - rz * TRACK_HALF_WIDTH);
    rover.position.y = Math.min(rover.position.y, (hF + hB + hR + hL) / 4 + 0.05);
    fwdPt.set(forward.x * 2.8, hF - hB, forward.z * 2.8).normalize();
    right.set(rx * 2 * TRACK_HALF_WIDTH, hR - hL, rz * 2 * TRACK_HALF_WIDTH).normalize();
    up.crossVectors(right, fwdPt).normalize();
    right.crossVectors(fwdPt, up);
    m.makeBasis(right, up, fwdPt.negate()); // el rover mira hacia -Z local
    rover.quaternion.slerp(q.setFromRotationMatrix(m), Math.min(1, dt * 8));

    if (rover.position.distanceTo(lastPrintPos) > 0.32) {
      stamp();
      lastPrintPos.copy(rover.position);
    }
  }

  return { object: rover, state, update };
}
