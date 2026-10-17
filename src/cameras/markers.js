import * as THREE from 'three';

// Puntos que brillan sobre las cámaras del modelo. Al pasar el ratón muestran el nombre;
// al hacer clic, `onShoot(camera)` toma la foto. Se dibujan siempre encima para encontrarlos.

// `anchor`: dónde va el punto dentro de la caja de la pieza (0–1 en x, y, z). Mastcam-Z y NavCam
// comparten la cabeza del mástil; una arriba y otra abajo para que sus puntos no se pisen.
export const CAMERAS = [
  { key: 'mastcam', part: 'Mastcam_Z_cams', anchor: [0.5, 0.92, 0.5], name: 'Mastcam-Z', about: 'Los ojos con zoom, en lo alto del mástil' },
  { key: 'navcam', part: 'NavCams', anchor: [0.5, 0.1, 0.5], name: 'NavCam', about: 'Miran por dónde va a conducir' },
  { key: 'hazcam', part: 'hazcams_front', anchor: [0.5, 0.5, 0.5], name: 'Hazcam delantera', about: 'Vigilan las ruedas y el brazo' },
  { key: 'watson', part: 'WATSON', anchor: [0.5, 0.5, 0.5], name: 'WATSON', about: 'Lupa en la punta del brazo' },
];

const CSS = `
.cam-tip { position: fixed; pointer-events: none; transform: translate(14px, -50%); padding: 5px 9px;
  background: rgba(28, 14, 8, 0.82); border: 1px solid rgba(240, 160, 100, 0.45); border-radius: 5px;
  color: #fff1e2; font: 12px/1.35 ui-monospace, Menlo, monospace; white-space: nowrap; }
.cam-tip b { color: #f0a064; letter-spacing: 0.06em; }
.cam-tip span { display: block; color: #c9a88c; font: 11px system-ui, sans-serif; }
.cam-tip[hidden] { display: none; }
`;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, 'rgba(255,244,220,1)');
  grad.addColorStop(0.2, 'rgba(255,186,105,0.9)');
  grad.addColorStop(0.36, 'rgba(255,150,70,0.22)');
  grad.addColorStop(0.55, 'rgba(255,140,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createCameraMarkers({ rover, camera, canvas, onShoot }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const tip = document.createElement('div');
  tip.className = 'cam-tip';
  tip.hidden = true;
  document.body.append(tip);

  const texture = glowTexture();
  const markers = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered = null, down = null, enabled = true;

  function setup() {
    for (const cam of CAMERAS) {
      const part = rover.object.getObjectByName(cam.part);
      if (!part) continue;
      // El punto va sobre la pieza, colgado del rover (escala 1): lo sigue sin recalcular.
      rover.object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(part).applyMatrix4(rover.object.matrixWorld.clone().invert());
      const center = new THREE.Vector3(...cam.anchor).multiply(box.getSize(new THREE.Vector3())).add(box.min);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
        sizeAttenuation: false,
      }));
      sprite.position.copy(center);
      sprite.renderOrder = 10;
      sprite.userData.camera = cam;
      rover.object.add(sprite);
      markers.push(sprite);
    }
  }

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(markers, false);
    if (!hits.length) return null;
    // Mastcam-Z y NavCam están juntas en el mástil: gana el punto más cercano al cursor.
    const gap = (s) => {
      const p = s.getWorldPosition(new THREE.Vector3()).project(camera);
      return Math.hypot(p.x - pointer.x, p.y - pointer.y);
    };
    return hits.map((h) => h.object).sort((a, b) => gap(a) - gap(b))[0];
  }

  canvas.addEventListener('pointermove', (e) => {
    hovered = enabled && markers.length ? pick(e.clientX, e.clientY) : null;
    canvas.style.cursor = hovered ? 'pointer' : '';
    tip.hidden = !hovered;
    if (hovered) {
      const cam = hovered.userData.camera;
      tip.innerHTML = `<b>${cam.name}</b><span>${cam.about} · clic para una foto</span>`;
      tip.style.left = `${e.clientX}px`;
      tip.style.top = `${e.clientY}px`;
    }
  });
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    // Un arrastre para girar la cámara no cuenta como clic.
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || performance.now() - down.t > 500) return;
    const hit = enabled && pick(e.clientX, e.clientY);
    if (hit) {
      tip.hidden = true;
      onShoot(hit.userData.camera);
    }
  });

  // Para las pruebas: qué cámara hay bajo un punto de la pantalla.
  const state = { markers: [], pickAt: (x, y) => pick(x, y)?.userData.camera.key ?? null };
  window.__cameras = state;

  return {
    setEnabled(on) {
      enabled = on;
      for (const m of markers) m.visible = on;
      if (!on) { tip.hidden = true; canvas.style.cursor = ''; }
    },
    update(t) {
      if (!markers.length && rover.state.loaded) setup();
      camera.updateMatrixWorld(); // la cámara ya se movió este fotograma; proyectar con su posición actual
      const rect = canvas.getBoundingClientRect();
      state.markers = markers.map((m, i) => {
        const pulse = 0.04 + 0.007 * Math.sin(t * 3 + i * 1.7);
        m.scale.setScalar(m === hovered ? 0.06 : pulse);
        const p = m.getWorldPosition(new THREE.Vector3()).project(camera);
        return { key: m.userData.camera.key, x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
      });
    },
  };
}
