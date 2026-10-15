import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTerrain, heightAt } from './terrain.js';
import { createRocks } from './rocks.js';
import { createSky, HORIZON_COLOR } from './sky.js';
import { createMoons } from './moons.js';
import { createRover } from './rover.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(HORIZON_COLOR, 0.0021);

// Sol bajo de tarde, algo a la derecha de la vista.
const sunAz = THREE.MathUtils.degToRad(30), sunEl = THREE.MathUtils.degToRad(8);
const sunDir = new THREE.Vector3(Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl), -Math.cos(sunAz) * Math.cos(sunEl));

scene.add(createSky(sunDir));
scene.add(createMoons(sunDir));
scene.add(createTerrain());
scene.add(createRocks());

const sun = new THREE.DirectionalLight(0xffd0a0, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera;
sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40;
sc.near = 1; sc.far = 600;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);

scene.add(new THREE.HemisphereLight(0xe2a878, 0x5a3020, 1.1));

// Polvo flotando alrededor de la cámara.
const DUST_BOX = new THREE.Vector3(80, 18, 80);
const dust = (() => {
  const count = 4000;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * DUST_BOX.x;
    positions[i * 3 + 1] = Math.random() * DUST_BOX.y;
    positions[i * 3 + 2] = (Math.random() - 0.5) * DUST_BOX.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const mat = new THREE.PointsMaterial({
    size: 0.07,
    map: new THREE.CanvasTexture(c),
    color: 0xe8b88a,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
})();
scene.add(dust);

// Cámara orbital centrada en el rover: arrastra con el ratón para verlo en 360°,
// rueda para acercar. Al conducir sin tocar el ratón vuelve sola detrás del rover.
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 6000);
const rover = createRover(scene);
const LOOK_HEIGHT = 1.3;
const CHASE_OFFSET = new THREE.Vector3(0, 2.4, 8); // detrás (+Z local) y arriba
const yAxis = new THREE.Vector3(0, 1, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI * 0.53;
controls.target.copy(rover.object.position).y += LOOK_HEIGHT;
camera.position.copy(CHASE_OFFSET).add(controls.target);
controls.update();

let dragging = false, lastInteraction = -Infinity;
controls.addEventListener('start', () => { dragging = true; });
controls.addEventListener('end', () => { dragging = false; lastInteraction = performance.now(); });

const prevTarget = controls.target.clone();
const offset = new THREE.Vector3(), chase = new THREE.Vector3();
function placeCamera(dt) {
  // El objetivo sigue al rover y la cámara se desplaza con él, conservando el ángulo elegido.
  controls.target.copy(rover.object.position).y += LOOK_HEIGHT;
  camera.position.add(offset.subVectors(controls.target, prevTarget));
  prevTarget.copy(controls.target);

  const driving = Math.abs(rover.state.speed) > 0.1;
  if (driving && !dragging && performance.now() - lastInteraction > 1500) {
    offset.subVectors(camera.position, controls.target);
    chase.copy(CHASE_OFFSET).setLength(offset.length()).applyAxisAngle(yAxis, rover.state.heading);
    offset.lerp(chase, Math.min(1, dt * 1.5));
    camera.position.copy(controls.target).add(offset);
  }
  controls.update();
  const minY = heightAt(camera.position.x, camera.position.z) + 0.8;
  if (camera.position.y < minY) camera.position.y = minY;
}
window.__rover = rover;

const clock = new THREE.Clock();
const wind = new THREE.Vector3(1.2, 0.05, 0.4);
function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  rover.update(dt);
  placeCamera(dt);

  // El sol y su caja de sombras siguen al rover.
  sun.target.position.copy(rover.object.position);
  sun.position.copy(rover.object.position).addScaledVector(sunDir, 300);

  // Polvo arrastrado por el viento, envuelto en una caja alrededor de la cámara.
  const p = dust.geometry.attributes.position;
  const base = camera.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) + (wind.x + Math.sin(t + i) * 0.3) * dt;
    let y = p.getY(i) + (wind.y + Math.cos(t * 0.7 + i) * 0.08) * dt;
    let z = p.getZ(i) + wind.z * dt;
    x = THREE.MathUtils.euclideanModulo(x - base.x + DUST_BOX.x / 2, DUST_BOX.x) + base.x - DUST_BOX.x / 2;
    z = THREE.MathUtils.euclideanModulo(z - base.z + DUST_BOX.z / 2, DUST_BOX.z) + base.z - DUST_BOX.z / 2;
    y = THREE.MathUtils.euclideanModulo(y - (base.y - 4), DUST_BOX.y) + base.y - 4;
    p.setXYZ(i, x, y, z);
  }
  p.needsUpdate = true;

  renderer.render(scene, camera);
  if (rover.state.loaded) window.__sceneReady = true;
}
renderer.setAnimationLoop(animate);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
