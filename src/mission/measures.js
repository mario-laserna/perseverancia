// Diccionario de medidas: como los telemetry.values de Open MCT, cada una con nombre,
// unidad y proveedor. `source` es el campo del JSON de la NASA de donde sale el valor.

const num = (v, digits) =>
  v.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const MEASURES = [
  {
    key: 'distance',
    name: 'Distancia recorrida',
    unit: 'km',
    provider: 'nasa-waypoints',
    source: 'dist_total_m',
    scale: 0.001,
    format: (v) => num(v, 2),
    explain: () => 'Todo lo que Percy ha rodado por Marte desde que aterrizó, a 4,2 cm/s como mucho.',
  },
  {
    key: 'elevation',
    name: 'Altura del terreno',
    unit: 'm',
    provider: 'nasa-waypoints',
    source: 'elev_geoid',
    format: (v) => num(v, 0),
    explain: (v, points) =>
      `Está ${num(-v, 0)} m bajo el «nivel del mar» de Marte. ` +
      `Desde el fondo de Jezero ha subido ${num(v - points[0].value, 0)} m.`,
  },
  {
    key: 'tilt',
    name: 'Inclinación',
    unit: '°',
    provider: 'nasa-waypoints',
    source: 'tilt',
    format: (v) => num(v, 1),
    explain: (v, points) =>
      `Lo que se ladea el rover en su última parada; 0° sería suelo plano. ` +
      `Su récord en la misión: ${num(Math.max(...points.map((p) => p.value)), 1)}°.`,
  },
  {
    key: 'lightTime',
    name: 'Tiempo de luz Tierra–Marte',
    unit: 'min:s',
    provider: 'ephemeris',
    format: (v) => {
      const cs = Math.round(v * 6000); // centésimas de segundo
      return `${Math.floor(cs / 6000)}:${num((cs % 6000) / 100, 2).padStart(5, '0')}`;
    },
    explain: () => 'Lo que tarda una orden de la Tierra en llegar. Por eso a Percy no se le conduce en directo.',
  },
];
