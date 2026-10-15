import * as THREE from 'three';

// Colores en sRGB; el shader los pasa a lineal antes del tone mapping.
export const HORIZON_COLOR = new THREE.Color(0.93, 0.66, 0.44);

/** Cúpula de cielo marciano: caramelo, bruma en el horizonte y halo azulado del sol. */
export function createSky(sunDir) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDir: { value: sunDir.clone().normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = (modelMatrix * vec4(position, 0.0)).xyz;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // siempre en el plano lejano
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      varying vec3 vDir;

      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float c = dot(d, sunDir);

        vec3 horizon = vec3(0.86, 0.60, 0.40);
        vec3 mid     = vec3(0.70, 0.46, 0.30);
        vec3 zenith  = vec3(0.40, 0.26, 0.19);

        float t = max(h, 0.0);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.3, t));
        col = mix(col, zenith, smoothstep(0.25, 1.0, t));

        // Bruma de polvo, más densa pegada al horizonte.
        col += vec3(0.07, 0.06, 0.04) * exp(-abs(h) * 14.0);

        // Dispersión hacia delante, cálida y amplia alrededor del sol.
        col += vec3(0.55, 0.36, 0.20) * pow(max(c, 0.0), 6.0) * 0.35;

        // Halo azul-grisáceo cerca del disco (polvo fino de Marte).
        float halo = pow(max(c, 0.0), 350.0);
        col = mix(col, vec3(0.62, 0.74, 0.90), halo * 0.85);
        col += vec3(0.25, 0.32, 0.42) * pow(max(c, 0.0), 2500.0);

        // Disco solar (más pequeño que desde la Tierra).
        float disc = smoothstep(0.99993, 0.99997, c);
        col = mix(col, vec3(1.0, 0.98, 0.94) * 4.0, disc);

        gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material);
  mesh.scale.setScalar(2500);
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  return mesh;
}
