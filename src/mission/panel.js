import { request, subscribe } from './telemetry.js';
import { solAt } from './ephemeris.js';

// Panel de control de misión sobre la escena. La tecla T lo muestra u oculta.
// Cada tarjeta: valor actual, gráfica de toda la misión (eje X en soles) y qué significa.

const CSS = `
.mc { position: fixed; top: 12px; right: 12px; width: 340px; max-height: calc(100% - 24px); overflow-y: auto;
  box-sizing: border-box; padding: 12px 14px 10px; color: #f3dcc4; background: rgba(28, 14, 8, 0.72);
  border: 1px solid rgba(240, 160, 100, 0.35); border-radius: 6px; backdrop-filter: blur(6px);
  font: 12px/1.4 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; user-select: none; }
.mc[hidden], .mc-tab[hidden] { display: none; }
.mc-head { display: grid; gap: 2px; letter-spacing: 0.12em; color: #f0a064; font-weight: 700;
  padding-bottom: 7px; border-bottom: 1px solid rgba(240, 160, 100, 0.25); }
.mc-head span { color: #c9a88c; font-weight: 400; letter-spacing: 0.06em; font-size: 10.5px; }
.mc-live { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #7fe08a; margin-right: 6px;
  animation: mc-blink 2s infinite; }
@keyframes mc-blink { 50% { opacity: 0.25; } }
.mc-card { padding: 8px 0 7px; border-bottom: 1px solid rgba(240, 160, 100, 0.15); }
.mc-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.mc-name { color: #c9a88c; text-transform: uppercase; letter-spacing: 0.08em; font-size: 10.5px; }
.mc-src { color: #8e735f; font-size: 10px; }
.mc-value { font-size: 20px; font-weight: 700; color: #fff1e2; font-variant-numeric: tabular-nums; }
.mc-unit { font-size: 12px; color: #c9a88c; margin-left: 4px; font-weight: 400; }
.mc-chart { display: block; width: 100%; height: 34px; margin: 3px 0 2px; }
.mc-axis { display: flex; justify-content: space-between; color: #8e735f; font-size: 9.5px; }
.mc-text { margin-top: 5px; color: #e4c9b0; font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.35; }
.mc-foot { padding-top: 8px; color: #8e735f; font-size: 10.5px; display: flex; justify-content: space-between; }
.mc-key { color: #f3dcc4; border: 1px solid #8e735f; border-radius: 3px; padding: 0 4px; }
.mc-tab { position: fixed; top: 12px; right: 12px; padding: 5px 9px; color: #f3dcc4; background: rgba(28, 14, 8, 0.6);
  border: 1px solid rgba(240, 160, 100, 0.35); border-radius: 6px; font: 11px ui-monospace, Menlo, monospace; }
@media (prefers-reduced-motion: reduce) { .mc-live { animation: none; } }
`;

const SOURCES = { 'nasa-waypoints': 'NASA · manejos', ephemeris: 'efemérides JPL' };
const W = 312, H = 34;

function chartPath(points, maxSol) {
  const values = points.map((p) => p.value);
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const xy = points.map((p) => [(p.sol / maxSol) * W, H - 3 - ((p.value - lo) / span) * (H - 6)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  return { line, area: `${line}L${xy.at(-1)[0].toFixed(1)},${H}L${xy[0][0].toFixed(1)},${H}Z`, end: xy.at(-1) };
}

export function createMissionPanel(measures) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const panel = document.createElement('aside');
  panel.className = 'mc';
  panel.setAttribute('aria-label', 'Control de misión');
  panel.innerHTML = `
    <div class="mc-head">CONTROL DE MISIÓN<span><i class="mc-live"></i>EN VIVO · SOL <b class="mc-sol"></b> · CRÁTER JEZERO</span></div>
    ${measures.map((m) => `
      <section class="mc-card" data-key="${m.key}">
        <div class="mc-row"><span class="mc-name">${m.name}</span><span class="mc-src">${SOURCES[m.provider]}</span></div>
        <div class="mc-value">…<span class="mc-unit">${m.unit}</span></div>
        <svg class="mc-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div class="mc-axis"><span>sol 0</span><span class="mc-range"></span><span class="mc-last"></span></div>
        <div class="mc-text">Cargando…</div>
      </section>`).join('')}
    <div class="mc-foot"><span>Datos reales · se actualizan solos</span><span><b class="mc-key">T</b> ocultar</span></div>`;
  const tab = document.createElement('div');
  tab.className = 'mc-tab';
  tab.innerHTML = '<b class="mc-key">T</b> control de misión';
  tab.hidden = true;
  document.body.append(panel, tab);

  const state = { visible: true, measures: {} };
  window.__mission = state;

  const solEl = panel.querySelector('.mc-sol');
  const showSol = () => { solEl.textContent = Math.floor(solAt(Date.now())); };
  showSol();
  setInterval(showSol, 60000);

  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyT' || e.repeat) return;
    state.visible = !state.visible;
    panel.hidden = !state.visible;
    tab.hidden = state.visible;
  });

  for (const m of measures) {
    const card = panel.querySelector(`[data-key="${m.key}"]`);
    const valueEl = card.querySelector('.mc-value');
    const show = (v, points) => {
      valueEl.firstChild.textContent = m.format(v);
      card.querySelector('.mc-text').textContent = m.explain(v, points);
      state.measures[m.key] = { name: m.name, unit: m.unit, provider: m.provider, value: v, display: m.format(v), points: points.length };
    };

    request(m)
      .then((points) => {
        const maxSol = Math.max(solAt(Date.now()), points.at(-1).sol);
        const { line, area, end } = chartPath(points, maxSol);
        card.querySelector('.mc-chart').innerHTML = `
          <path d="${area}" fill="rgba(240,160,100,0.16)"/>
          <path d="${line}" fill="none" stroke="#f0a064" stroke-width="1.4" vector-effect="non-scaling-stroke"/>
          <circle cx="${end[0]}" cy="${end[1]}" r="2.6" fill="#fff1e2"/>`;
        const values = points.map((p) => p.value);
        card.querySelector('.mc-range').textContent =
          `${m.format(Math.min(...values))} – ${m.format(Math.max(...values))} ${m.unit}`;
        card.querySelector('.mc-last').textContent = `sol ${Math.floor(points.at(-1).sol)}`;
        show(points.at(-1).value, points);
        subscribe(m, (datum) => show(datum.value, points));
      })
      .catch((err) => {
        valueEl.firstChild.textContent = 'sin datos';
        card.querySelector('.mc-text').textContent = 'No se pudo leer el proveedor. ¿Hay conexión?';
        console.error(`Control de misión: ${m.name}:`, err);
      });
  }
}
