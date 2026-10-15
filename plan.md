# Paisaje de Marte con Vite + Three.js

> **Estado: ✅ TERMINADO (2026-10-14).** Pasos 0–4 completados. `npm run check` → sin errores de consola; captura en `screenshots/check.png` con dunas, rocas, cielo caramelo con polvo, sol con halo azulado y sombras suaves, Fobos y Deimos.
> Rondas de mejora: (1) rocas de primer plano más pequeñas y dunas más altas/cercanas; (2) dunas orientadas frente al sol; (3) dunas giradas 180° para ver el sotavento en sombra.
> Extra: `.vscode/settings.json` con `workbench.browser.openLocalhostLinks: true` para abrir http://localhost:5173 en el navegador integrado de VS Code.

## Contexto
La carpeta solo tiene `CLAUDE.md` (no se toca). Node 24 / npm 11 y Google Chrome en /Applications están disponibles. Objetivo: escena de Marte "de película", visible en el navegador de Cursor en menos de 2 min, con un `npm run check` (Playwright + Chrome del sistema) para autoevaluarse en máximo 3 rondas.

## Paso 0: guardar el plan
Copiar este plan a `/Users/mariolaserna/codigo/perseverancia/plan.md` (primera acción tras aprobar).

## Paso 1: algo visible rápido (≤2 min)
1. Escribir a mano `package.json` (sin `npm create`, para ir más rápido): deps `three`, devDeps `vite`, `playwright-core` (no descarga navegadores). Scripts: `dev` (`vite --host --port 5173`), `build`, `check` (`node scripts/check.mjs`).
2. `index.html` + `src/main.js` mínimo: renderer, cámara, plano de terreno con ruido, fondo caramelo, luz direccional cálida.
3. `npm install` y `npm run dev` en segundo plano → avisar URL `http://localhost:5173`.

## Paso 2: escena completa (`src/` modular)
- `src/terrain.js`: plano grande de alta resolución, desplazado con ruido fBm + función de dunas (crestas sinusoidales deformadas por ruido, asimétricas); colores por vértice ocre/óxido/arena; `MeshStandardMaterial` rugoso.
- `src/rocks.js`: `IcosahedronGeometry` deformadas con ruido, `InstancedMesh` con cientos de rocas de distintos tamaños, asentadas sobre la altura del terreno; algunas grandes en primer plano.
- `src/sky.js`: esfera de cielo con `ShaderMaterial`: degradado caramelo/butterscotch, halo del sol (en Marte el entorno del sol se ve azulado al atardecer: halo azul-grisáceo tenue alrededor del disco), bruma más densa en el horizonte.
- `src/moons.js`: Fobos (más grande, irregular) y Deimos (pequeño) como sprites/mallas pequeñas en el cielo, iluminadas por el lado del sol.
- `src/main.js`: sol bajo (luz direccional cálida, sombras `PCFSoftShadowMap`, frustum ajustado), `HemisphereLight` caramelo/marrón, `FogExp2` color polvo, ACES tone mapping, partículas de polvo flotando (`Points`), cámara a altura humana con `OrbitControls` y leve movimiento automático.

## Paso 3: `npm run check` (`scripts/check.mjs`)
- `playwright-core` con `chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] })` para WebGL sin GPU.
- Si el servidor de dev no responde en 5173, levanta uno propio con la API de Vite (`createServer`) y lo cierra al final.
- Recoge `console` (error/warning) y `pageerror`; espera ~3 s de render; guarda `screenshots/check.png` (1280×720); imprime lista de errores y sale con código ≠0 si hay errores.

## Paso 4: rondas de mejora (máx. 3)
Tras cada mejora grande: `npm run check`, abrir la captura con Read, verificar visualmente: dunas, rocas, cielo caramelo con polvo, sol cálido con sombras suaves, Fobos y Deimos visibles. Corregir lo que falte (encuadre de lunas, exposición, sombras, niebla).

## Archivos
`package.json`, `index.html`, `src/main.js`, `src/terrain.js`, `src/rocks.js`, `src/sky.js`, `src/moons.js`, `src/noise.js`, `scripts/check.mjs`, `.gitignore`.

## Verificación
- Servidor vivo en http://localhost:5173 (lo ves en Cursor; HMR recarga cambios).
- `npm run check` → 0 errores de consola y captura `screenshots/check.png` mostrando todos los elementos pedidos.
