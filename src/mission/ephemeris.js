// Posiciones aproximadas de la Tierra y Marte con los elementos keplerianos de JPL
// ("Keplerian Elements for Approximate Positions of the Major Planets", tabla 1, 1800–2050).
// Error de unos minutos de arco: de sobra para el tiempo de luz.

const AU_KM = 149597870.7;
const C_KM_S = 299792.458;
const DEG = Math.PI / 180;

// [valor en J2000, cambio por siglo] para a (UA), e, I, L, ϖ, Ω (grados).
const ELEMENTS = {
  earth: {
    a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981], peri: [102.93768193, 0.32327364], node: [0, 0],
  },
  mars: {
    a: [1.52371034, 0.00001847], e: [0.0933941, 0.00007882], I: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499], peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343],
  },
};

const julianDay = (ms) => ms / 86400000 + 2440587.5;

function heliocentric(planet, ms) {
  const T = (julianDay(ms) - 2451545) / 36525;
  const at = (k) => ELEMENTS[planet][k][0] + ELEMENTS[planet][k][1] * T;
  const a = at('a'), e = at('e'), I = at('I') * DEG, node = at('node') * DEG, peri = at('peri') * DEG;
  const w = peri - node;
  let M = (at('L') * DEG - peri) % (2 * Math.PI);
  if (M > Math.PI) M -= 2 * Math.PI;
  if (M < -Math.PI) M += 2 * Math.PI;

  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));

  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cn = Math.cos(node), sn = Math.sin(node), ci = Math.cos(I), si = Math.sin(I);
  return [
    (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}

export function earthMarsKm(ms) {
  const p = heliocentric('earth', ms), q = heliocentric('mars', ms);
  return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) * AU_KM;
}

export const lightMinutes = (ms) => earthMarsKm(ms) / C_KM_S / 60;

// Sol de misión de Perseverance (sol 0 = día del aterrizaje en Jezero, 18 feb 2021),
// con la hora solar media local en su longitud (Mars24, NASA GISS).
const SOL_MS = 88775244.147;
const JEZERO_EAST_LON = 77.45;
const LANDING_MS = Date.UTC(2021, 1, 18, 20, 44);
const TT_MINUS_UTC_S = 69.184;

const localMarsDays = (ms) =>
  (julianDay(ms) + TT_MINUS_UTC_S / 86400 - 2405522.0028779) / 1.0274912517 + JEZERO_EAST_LON / 360;
const SOL_ZERO = Math.floor(localMarsDays(LANDING_MS));

export const solAt = (ms) => localMarsDays(ms) - SOL_ZERO;
export const msAtSol = (sol) => LANDING_MS + (sol - solAt(LANDING_MS)) * SOL_MS;
