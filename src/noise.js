// Ruido de Perlin mejorado (3D) con semilla, más utilidades fBm y ridged.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const perm = new Uint8Array(512);
{
  const rand = mulberry32(1976); // año del Viking 1
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + t * (b - a);

function grad(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/** Ruido de Perlin 3D, rango aproximado [-1, 1]. */
export function noise3(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
  const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
         lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
         lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
    w,
  );
}

export const noise2 = (x, y) => noise3(x, y, 0.371);

/** fBm 2D normalizado a ~[-1, 1]. */
export function fbm2(x, y, octaves = 5, lacunarity = 2.03, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x, y);
    norm += amp;
    x *= lacunarity; y *= lacunarity;
    amp *= gain;
  }
  return sum / norm;
}

/** fBm "ridged" 2D en [0, 1]: crestas afiladas para montañas. */
export function ridged2(x, y, octaves = 5) {
  let sum = 0, amp = 0.5, norm = 0, prev = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(noise2(x, y));
    n *= n;
    sum += n * amp * prev;
    norm += amp;
    prev = n;
    x *= 2.1; y *= 2.1;
    amp *= 0.5;
  }
  return sum / norm;
}

export function fbm3(x, y, z, octaves = 4) {
  let sum = 0, amp = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x, y, z);
    norm += amp;
    x *= 2.02; y *= 2.02; z *= 2.02;
    amp *= 0.5;
  }
  return sum / norm;
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
