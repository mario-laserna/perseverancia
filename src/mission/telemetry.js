// Telemetría al estilo de Open MCT, en pequeño (ver docs/mapa-del-repo.html):
// cada medida declara nombre, unidad y proveedor; el proveedor sirve el pasado (request)
// y, si puede, lo nuevo (subscribe). Un dato es un objeto plano { sol, value }.

const providers = [];

export function addProvider(provider) {
  providers.unshift(provider); // como Open MCT: el último registrado se consulta primero
}

function find(capability, measure) {
  const provider = providers.find((p) => p[capability]?.(measure));
  if (!provider) throw new Error(`Ningún proveedor sirve "${measure.key}" (${capability})`);
  return provider;
}

export const request = (measure) => find('supportsRequest', measure).request(measure);

export function subscribe(measure, callback) {
  const provider = providers.find((p) => p.supportsSubscribe?.(measure));
  return provider ? provider.subscribe(measure, callback) : () => {};
}
