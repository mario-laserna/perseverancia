import { lightMinutes, solAt, msAtSol } from './ephemeris.js';

// Historial de manejos de Perseverance que publica la NASA (permite CORS, se lee en vivo).
const WAYPOINTS_URL = 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json';

let drives = null;
function loadDrives() {
  drives ??= fetch(WAYPOINTS_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`La NASA respondió ${res.status} al pedir los manejos`);
      return res.json();
    })
    // Solo las paradas de fin de manejo ("y"): las intermedias traen la distancia a 0.
    .then((json) => json.features.map((f) => f.properties).filter((p) => p.final === 'y'));
  return drives;
}

export const waypointsProvider = {
  supportsRequest: (measure) => measure.provider === 'nasa-waypoints',
  async request(measure) {
    const rows = await loadDrives();
    return rows.map((p) => ({ sol: p.sol, value: p[measure.source] * (measure.scale ?? 1) }));
  },
};

export const ephemerisProvider = {
  supportsRequest: (measure) => measure.provider === 'ephemeris',
  async request() {
    const today = solAt(Date.now());
    const points = [];
    for (let sol = 0; sol < today; sol++) points.push({ sol, value: lightMinutes(msAtSol(sol)) });
    points.push({ sol: today, value: lightMinutes(Date.now()) });
    return points;
  },
  supportsSubscribe: (measure) => measure.provider === 'ephemeris',
  subscribe(measure, callback) {
    const tick = () => callback({ sol: solAt(Date.now()), value: lightMinutes(Date.now()) });
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  },
};
