import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTerrain, heightAt } from './terrain.js';
import { createRocks } from './rocks.js';
import { createSky, HORIZON_COLOR } from './sky.js';
import { createMoons } from './moons.js';

const EYE_HEIGHT = 1.7;

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
sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
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

// Cámara a altura humana, mirando hacia el sol con ligera inclinación hacia arriba.
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 6000);
const ground0 = heightAt(0, 0);
camera.position.set(0, ground0 + EYE_HEIGHT, 0);
const pitch = THREE.MathUtils.degToRad(6), yaw = THREE.MathUtils.degToRad(0);
const lookDir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(camera.position).addScaledVector(lookDir, 10);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.58;
controls.update();

let lastInteraction = -Infinity;
controls.addEventListener('start', () => { lastInteraction = Infinity; });
controls.addEventListener('end', () => { lastInteraction = performance.now(); });

// Movimiento automático leve: balanceo lento de la vista cuando nadie toca los controles.
const yAxis = new THREE.Vector3(0, 1, 0);
const offset = new THREE.Vector3();
let swayPrev = 0;
function sway(t) {
  const idle = performance.now() - lastInteraction > 4000;
  const s = idle ? Math.sin(t * 0.06) * 0.07 : swayPrev;
  if (s !== swayPrev) {
    offset.subVectors(camera.position, controls.target).applyAxisAngle(yAxis, s - swayPrev);
    camera.position.copy(controls.target).add(offset);
    swayPrev = s;
  }
  const minY = heightAt(camera.position.x, camera.position.z) + 1.2;
  if (camera.position.y < minY) camera.position.y = minY;
}

const clock = new THREE.Clock();
const wind = new THREE.Vector3(1.2, 0.05, 0.4);
function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  sway(t);
  controls.update();

  // El sol y su caja de sombras siguen a la cámara.
  sun.target.position.copy(controls.target);
  sun.position.copy(controls.target).addScaledVector(sunDir, 300);

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
  window.__sceneReady = true;
}
renderer.setAnimationLoop(animate);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
