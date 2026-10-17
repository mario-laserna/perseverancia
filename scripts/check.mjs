// Abre la escena en un Chrome invisible (el Chrome instalado, sin descargar navegadores),
// guarda una captura y lista los errores de consola.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5173;
const shotPath = path.join(root, 'screenshots', 'check.png');

async function isUp(url) {
  try {
    const res = await fetch(url);
    const html = await res.text();
    return res.ok && html.includes('/src/main.js');
  } catch {
    return false;
  }
}

let server = null;
let url = `http://localhost:${PORT}/`;
if (!(await isUp(url))) {
  server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
  await server.listen();
  url = server.resolvedUrls.local[0];
  console.log(`Servidor propio en ${url}`);
} else {
  console.log(`Usando servidor de dev en ${url}`);
}

const problems = [];
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => {
    if (msg.type() === 'log') console.log('[página] ' + msg.text());
    if (msg.type() === 'error' || msg.type() === 'warning') {
      problems.push(`[console.${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', (req) => problems.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sceneReady === true, null, { timeout: 30000 }).catch(() => {
    problems.push('[check] la escena no marcó window.__sceneReady en 30 s');
  });
  // Control de misión: las 4 medidas tienen que llegar con un número real.
  const EXPECTED = ['distance', 'elevation', 'tilt', 'lightTime'];
  await page
    .waitForFunction(
      (keys) => keys.every((k) => Number.isFinite(window.__mission?.measures[k]?.value)),
      EXPECTED,
      { timeout: 30000 },
    )
    .catch(() => {});
  const measures = await page.evaluate(() => window.__mission?.measures ?? {});
  for (const key of EXPECTED) {
    const m = measures[key];
    if (m && Number.isFinite(m.value) && m.points > 0) {
      console.log(`Medida ✅ ${m.name}: ${m.display} ${m.unit} (${m.provider}, ${m.points} puntos)`);
    } else {
      problems.push(`[check] la medida "${key}" no cargó un valor`);
    }
  }

  await page.waitForTimeout(3000);

  await mkdir(path.dirname(shotPath), { recursive: true });
  await page.screenshot({ path: shotPath });
  console.log(`Captura: ${path.relative(root, shotPath)}`);

  // La tecla T oculta el panel.
  await page.keyboard.press('KeyT');
  const hidden = await page.evaluate(() => document.querySelector('.mc')?.hidden === true && !window.__mission.visible);
  if (hidden) console.log('Tecla T oculta el panel ✅');
  else problems.push('[check] la tecla T no ocultó el control de misión');

  // Cámaras: clic en cada punto, la foto real se revela, se guarda la captura y Esc vuelve al juego.
  await page.waitForFunction(() => window.__cameras?.markers.length === 4, null, { timeout: 10000 }).catch(() => {});
  for (const key of ['mastcam', 'navcam', 'hazcam', 'watson']) {
    const marker = await page.evaluate((k) => window.__cameras?.markers.find((m) => m.key === k), key);
    if (!marker) {
      problems.push(`[check] no hay punto para la cámara "${key}"`);
      continue;
    }
    await page.mouse.move(marker.x, marker.y);
    await page.mouse.down();
    await page.mouse.up();
    const ok = await page
      .waitForFunction((k) => window.__photo?.camera === k && window.__photo.developed, key, { timeout: 30000 })
      .then(() => true, () => false);
    const photo = await page.evaluate(() => {
      const img = document.querySelector('.pv-img');
      return { src: img?.currentSrc, width: img?.naturalWidth, caption: document.querySelector('.pv-cap')?.innerText.replace(/\s+/g, ' ') };
    });
    if (ok && photo.width > 0 && photo.src?.startsWith('https://mars.nasa.gov/')) {
      const shot = path.join(root, 'screenshots', `foto-${key}.png`);
      await page.screenshot({ path: shot });
      console.log(`Foto ✅ ${photo.caption} · ${photo.width} px · ${path.relative(root, shot)}`);
    } else {
      problems.push(`[check] la cámara "${key}" no abrió una foto real (${JSON.stringify(photo)})`);
    }
    await page.keyboard.press('Escape');
    if (await page.evaluate(() => window.__photo.open)) problems.push('[check] Esc no cerró la foto');
  }

  // Ruedas: 6 piezas separadas, ruedan sin patinar y las esquinas se orientan para pivotar.
  const drive = async (keys, steps) => {
    for (const k of keys) await page.keyboard.down(k);
    const result = await page.evaluate((steps) => {
      const R = window.__rover, start = R.object.position.clone();
      const spin0 = R.state.wheels.map((w) => w.spin.rotation.x);
      for (let i = 0; i < steps; i++) R.update(1 / 60);
      return {
        meters: R.object.position.clone().sub(start).setY(0).length(),
        rolled: R.state.wheels.map((w, i) => Math.abs(w.spin.rotation.x - spin0[i]) * w.radius),
        angles: R.state.wheels.map((w) => (w.angle * 180) / Math.PI),
      };
    }, steps);
    for (const k of keys) await page.keyboard.up(k);
    return result;
  };
  const wheelCount = await page.evaluate(() => window.__rover.state.wheels.length);
  const straight = await drive(['KeyW'], 240);
  const worstSlip = Math.max(...straight.rolled.map((r) => Math.abs(r / straight.meters - 1)));
  await drive([], 400); // frenar
  const pivot = await drive(['KeyA'], 120);
  const cornersTurned = pivot.angles.filter((a) => Math.abs(a) > 40).length;
  if (wheelCount === 6 && worstSlip < 0.02 && cornersTurned === 4) {
    console.log(`Ruedas ✅ 6 separadas, patinaje recto ${(worstSlip * 100).toFixed(2)} %, esquinas a ${pivot.angles.map((a) => a.toFixed(0)).join('/')}° al pivotar`);
  } else {
    problems.push(`[check] ruedas: ${wheelCount} piezas, patinaje ${(worstSlip * 100).toFixed(1)} %, ${cornersTurned}/4 esquinas orientadas`);
  }
} finally {
  await browser.close();
  if (server) await server.close();
}

// Avisos esperables del renderizado por software, no de nuestro código.
const ignored = [/GPU stall due to ReadPixels/, /Automatic fallback to software WebGL/];
const real = problems.filter((p) => !ignored.some((re) => re.test(p)));

if (real.length === 0) {
  console.log('Sin errores de consola ✅');
} else {
  console.log(`${real.length} problema(s):`);
  for (const p of real) console.log('  ' + p);
  process.exitCode = 1;
}
