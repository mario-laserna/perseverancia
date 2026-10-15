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
  await page.waitForTimeout(3000);

  await mkdir(path.dirname(shotPath), { recursive: true });
  await page.screenshot({ path: shotPath });
  console.log(`Captura: ${path.relative(root, shotPath)}`);
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
