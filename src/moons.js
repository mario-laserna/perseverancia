import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm3, noise3 } from './noise.js';

const DISTANCE = 2000;

function moonGeometry(seed, lumpiness, stretch) {
  let geo = new THREE.IcosahedronGeometry(1, 5);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let r = 1 + lumpiness * fbm3(v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3, 3);
    // Cráteres: pozos donde el ruido supera un umbral.
    const crater = noise3(v.x * 4 + seed, v.y * 4, v.z * 4 - seed);
    r -= Math.max(0, crater - 0.25) * 0.25;
    v.multiplyScalar(r).multiply(stretch);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function moonMaterial(sunDir, albedo) {
  // Se suma la luz reflejada sobre el cielo y se oscurece un poco lo que hay detrás:
  // el lado nocturno casi desaparece en el cielo, como una luna de día.
  return new THREE.ShaderMaterial({
    fog: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { sunDir: { value: sunDir }, albedo: { value: new THREE.Color(albedo) } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform vec3 albedo;
      varying vec3 vNormal;
      void main() {
        float l = max(dot(normalize(vNormal), sunDir), 0.0);
        vec3 col = albedo * pow(l, 0.8) * 1.6;
        gl_FragColor = vec4(col, 0.22);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function placeOnSky(mesh, azimuthDeg, elevationDeg, angularRadiusDeg) {
  const az = THREE.MathUtils.degToRad(azimuthDeg), el = THREE.MathUtils.degToRad(elevationDeg);
  mesh.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(DISTANCE);
  mesh.scale.setScalar(DISTANCE * Math.tan(THREE.MathUtils.degToRad(angularRadiusDeg)));
}

/** Fobos y Deimos. Tamaños exagerados respecto a la realidad para que se lean en pantalla. */
export function createMoons(sunDir) {
  const group = new THREE.Group();

  const phobos = new THREE.Mesh(moonGeometry(3.7, 0.22, new THREE.Vector3(1.25, 0.95, 0.85)), moonMaterial(sunDir, 0x9a8a7e));
  phobos.name = 'Fobos';
  placeOnSky(phobos, -24, 19, 1.0);
  phobos.rotation.set(0.4, 1.1, 0.3);

  const deimos = new THREE.Mesh(moonGeometry(9.1, 0.12, new THREE.Vector3(1.1, 0.95, 0.9)), moonMaterial(sunDir, 0xa89a8c));
  deimos.name = 'Deimos';
  placeOnSky(deimos, 3, 27, 0.4);

  for (const m of [phobos, deimos]) {
    m.renderOrder = -1;
    m.frustumCulled = false;
    group.add(m);
  }
  group.userData = { phobos, deimos };
  return group;
}
