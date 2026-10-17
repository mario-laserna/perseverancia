// Visor de fotos: obturador y flash, la foto se revela poco a poco y se queda unos segundos.
// Clic para ampliar, flechas para más fotos de esa cámara, Esc para volver al juego.

const STAY_MS = 9000; // lo que se queda la foto si no la tocas
const DEVELOP_MS = 2600;

const CSS = `
.pv { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; pointer-events: none; }
.pv[hidden] { display: none; }
.pv-blade { position: absolute; z-index: 2; left: 0; right: 0; height: 50%; background: #050302; transform: scaleY(0); }
.pv-blade.top { top: 0; transform-origin: top; }
.pv-blade.bottom { bottom: 0; transform-origin: bottom; }
.pv.shoot .pv-blade { animation: pv-shut 260ms ease-in-out; }
@keyframes pv-shut { 0% { transform: scaleY(0); } 35%, 45% { transform: scaleY(1); } 100% { transform: scaleY(0); } }
.pv-flash { position: absolute; z-index: 2; inset: 0; background: #fff8ee; opacity: 0; }
.pv.shoot .pv-flash { animation: pv-flash 700ms ease-out 100ms; }
@keyframes pv-flash { 0% { opacity: 0.95; } 100% { opacity: 0; } }

.pv-print { margin: 0; width: min-content; pointer-events: auto; cursor: zoom-in; display: grid; gap: 8px; padding: 12px 12px 10px;
  background: rgba(28, 14, 8, 0.9); border: 1px solid rgba(240, 160, 100, 0.4); border-radius: 6px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55); font: 12px/1.4 ui-monospace, 'SF Mono', Menlo, monospace; color: #f3dcc4;
  transform: scale(0.96); opacity: 0; transition: transform 300ms ease-out, opacity 300ms ease-out; }
.pv.on .pv-print { transform: none; opacity: 1; }
.pv-frame { position: relative; background: #0b0604; line-height: 0; }
.pv-frame.waiting { width: min(74vw, 1040px, 88vh); aspect-ratio: 4 / 3; }
.pv-img { display: block; max-width: min(74vw, 1040px); max-height: 66vh; width: auto; height: auto; opacity: 0; }
.pv-img.dev { animation: pv-develop ${DEVELOP_MS}ms ease-out forwards; }
@keyframes pv-develop {
  0% { opacity: 0.25; filter: brightness(0.2) sepia(1) contrast(0.5) blur(14px); }
  45% { opacity: 1; filter: brightness(0.7) sepia(0.6) contrast(0.8) blur(4px); }
  100% { opacity: 1; filter: none; }
}
.pv-wait { position: absolute; inset: 0; display: grid; place-items: center; color: #8e735f; letter-spacing: 0.2em; line-height: 1.4; }
.pv-wait[hidden] { display: none; }
.pv-cap { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; }
.pv-cam { color: #f0a064; font-weight: 700; letter-spacing: 0.1em; font-size: 14px; }
.pv-sol { color: #fff1e2; font-weight: 700; font-size: 14px; }
.pv-ago { color: #c9a88c; }
.pv-count { margin-left: auto; color: #8e735f; }
.pv-foot { display: flex; justify-content: space-between; gap: 12px; color: #8e735f; font-size: 10.5px; }
.pv-key { color: #f3dcc4; border: 1px solid #8e735f; border-radius: 3px; padding: 0 4px; }
.pv-timer { height: 2px; background: rgba(240, 160, 100, 0.2); }
.pv-timer i { display: block; height: 100%; background: #f0a064; transform-origin: left; transform: scaleX(0); }
.pv-timer.run i { animation: pv-timer ${STAY_MS}ms linear forwards; }
.pv-print:hover .pv-timer i { animation-play-state: paused; }
@keyframes pv-timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }

.pv.big { pointer-events: auto; background: rgba(8, 4, 2, 0.93); }
.pv.big .pv-print { cursor: zoom-out; background: none; border: 0; box-shadow: none; }
.pv.big .pv-img { max-width: 96vw; max-height: 84vh; }
.pv.big .pv-timer { visibility: hidden; }
@media (prefers-reduced-motion: reduce) {
  .pv.shoot .pv-blade, .pv.shoot .pv-flash { animation: none; }
  .pv-img.dev { animation-duration: 600ms; }
}
`;

function shutterSound() {
  try {
    const ctx = (shutterSound.ctx ??= new AudioContext());
    // Dos chasquidos de ruido filtrado: la cortinilla que cierra y la que abre.
    for (const [at, level] of [[0, 0.55], [0.085, 0.35]]) {
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 2600, Q: 0.9 });
      const gain = new GainNode(ctx, { gain: level });
      src.connect(band).connect(gain).connect(ctx.destination);
      src.start(ctx.currentTime + at);
    }
  } catch {
    // Sin audio la foto sigue funcionando.
  }
}

const daysAgo = (iso) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
};

export function createPhotoViewer({ photos, onOpen, onClose }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const root = document.createElement('div');
  root.className = 'pv';
  root.hidden = true;
  root.innerHTML = `
    <i class="pv-blade top"></i><i class="pv-blade bottom"></i><div class="pv-flash"></div>
    <figure class="pv-print">
      <div class="pv-frame"><img class="pv-img" alt=""><div class="pv-wait">REVELANDO…</div></div>
      <figcaption class="pv-cap"><span class="pv-cam"></span><span class="pv-sol"></span><span class="pv-ago"></span><span class="pv-count"></span></figcaption>
      <div class="pv-timer"><i></i></div>
      <div class="pv-foot"><span>clic ampliar · <b class="pv-key">←</b> <b class="pv-key">→</b> más fotos · <b class="pv-key">Esc</b> volver al juego</span><span class="pv-credit"></span></div>
    </figure>`;
  document.body.append(root);
  const $ = (sel) => root.querySelector(sel);
  const img = $('.pv-img'), wait = $('.pv-wait'), timer = $('.pv-timer'), print = $('.pv-print'), frame = $('.pv-frame');

  const state = { open: false, camera: null, index: 0, loaded: false, developed: false, big: false };
  window.__photo = state;
  let camera = null, closeTimer = 0, developTimer = 0, loadToken = 0;

  function restartAnimation(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // fuerza a reiniciar la animación CSS
    el.classList.add(cls);
  }

  function armCloseTimer() {
    clearTimeout(closeTimer);
    timer.classList.remove('run');
    if (state.big) return;
    restartAnimation(timer, 'run');
    closeTimer = setTimeout(close, STAY_MS);
  }

  function show(index, { flash }) {
    const list = photos[camera.key];
    state.index = (index + list.length) % list.length;
    const photo = list[state.index];
    state.loaded = state.developed = false;
    clearTimeout(closeTimer);
    clearTimeout(developTimer);
    timer.classList.remove('run');

    if (flash) {
      restartAnimation(root, 'shoot');
      shutterSound();
    }
    $('.pv-cam').textContent = camera.name.toUpperCase();
    $('.pv-sol').textContent = `SOL ${photo.sol}`;
    $('.pv-ago').textContent = daysAgo(photo.taken);
    $('.pv-count').textContent = `${state.index + 1} / ${list.length}`;
    $('.pv-credit').textContent = photo.credit;
    img.classList.remove('dev');
    img.style.opacity = '0';
    img.removeAttribute('src'); // hueco 4:3 mientras llega la foto
    frame.classList.add('waiting');
    wait.hidden = false;
    wait.textContent = 'REVELANDO…';

    const token = ++loadToken;
    img.onload = () => {
      if (token !== loadToken) return;
      state.loaded = true;
      wait.hidden = true;
      frame.classList.remove('waiting');
      img.style.opacity = '';
      restartAnimation(img, 'dev');
      developTimer = setTimeout(() => {
        state.developed = true;
        armCloseTimer();
      }, DEVELOP_MS);
    };
    img.onerror = () => {
      if (token !== loadToken) return;
      wait.textContent = 'SIN SEÑAL DE LA NASA';
      console.error(`No se pudo cargar la foto ${photo.id}`);
    };
    img.src = state.big ? photo.full : photo.large;
    img.alt = `${camera.name}, sol ${photo.sol}`;
  }

  function open(cam) {
    camera = cam;
    state.open = true;
    state.camera = cam.key;
    state.big = false;
    root.classList.remove('big');
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('on'));
    onOpen?.();
    show(0, { flash: true });
  }

  function close() {
    clearTimeout(closeTimer);
    clearTimeout(developTimer);
    loadToken++;
    root.classList.remove('on', 'big', 'shoot');
    root.hidden = true;
    Object.assign(state, { open: false, camera: null, loaded: false, developed: false, big: false });
    onClose?.();
  }

  function toggleBig() {
    state.big = !state.big;
    root.classList.toggle('big', state.big);
    const photo = photos[camera.key][state.index];
    if (state.big && state.loaded) {
      // La de máxima resolución se cambia cuando ya está descargada, sin volver a revelar.
      const full = new Image();
      full.onload = () => {
        if (!state.big || img.src !== photo.large) return;
        img.onload = img.onerror = null; // ya está revelada: solo cambia la resolución
        img.src = photo.full;
      };
      full.src = photo.full;
    }
    if (state.developed) armCloseTimer();
  }

  print.addEventListener('click', (e) => { e.stopPropagation(); if (state.loaded) toggleBig(); });
  print.addEventListener('mouseenter', () => clearTimeout(closeTimer));
  print.addEventListener('mouseleave', () => { if (state.developed) armCloseTimer(); });
  root.addEventListener('click', () => { if (state.big) close(); });
  addEventListener('keydown', (e) => {
    if (!state.open) return;
    if (e.code === 'Escape') close();
    else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
      e.preventDefault();
      show(state.index + (e.code === 'ArrowRight' ? 1 : -1), { flash: true });
    }
  });

  return { open, close };
}
