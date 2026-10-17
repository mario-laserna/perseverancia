# Proyecto: Modelado 3D del rover Perseverance

Modelo 3D fiel del rover Perseverance de la NASA, basado en sus referencias oficiales, a escala real en metros, organizado por subsistemas y exportado a glTF/STL.

Hoy es una simulación jugable con Vite + Three.js: paisaje de Marte, rover conducible, control de misión con datos reales y cámaras que abren fotos reales de la NASA. Para usuarios, ver `README.md`.

## Comandos

- `npm run dev`: servidor en http://localhost:5173 (puerto fijo, `--strictPort`). A menudo el usuario ya lo tiene abierto; no lances otro.
- `npm run check`: verificación principal (`scripts/check.mjs`). Usa el servidor de dev si responde y, si no, levanta uno propio. Abre Chrome headless con SwiftShader y comprueba medidas, tecla T, fotos de las 4 cámaras, ruedas y consola sin errores (los avisos `console.warning` también cuentan como fallo). Guarda capturas en `screenshots/` y sale con 1 si algo falla. **Tiene que pasar antes de dar un cambio por terminado.**
- `node scripts/drive-test.mjs` / `node scripts/orbit-test.mjs`: pruebas manuales; necesitan `npm run dev` en marcha.
- No hay framework de tests unitarios ni linter. No añadas dependencias sin preguntar: el usuario pide a menudo "no instales nada".

## Arquitectura

- `src/main.js`: escena, luces, polvo, cámara orbital (`OrbitControls`) y bucle `animate()`. Es el punto de montaje: registra los proveedores de telemetría, monta el panel y conecta cámaras y visor.
- `src/terrain.js`: `heightAt(x, z)` da la altura del suelo. La usan el rover, la cámara y las huellas.
- `src/rover.js`: carga `public/models/perseverance.glb` (Draco, decodificador en `public/draco/`), lo escala a 3,0 m y lleva la cinemática: Ackermann en las 4 ruedas de esquina, ruedas del medio fijas, pivote en el sitio y aceleración suavizada. La inclinación del chasis se suaviza con `slerp`, pero el rumbo se fija exacto para que el chasis no gire sin que rueden las ruedas.
- `src/wheels.js`: el modelo trae las 6 ruedas fusionadas en una malla por material. Este módulo reparte los triángulos por rueda, crea los grupos `steer` (dirección, eje Y) y `spin` (rodadura, eje X) y mueve con la dirección el soporte de la suspensión de cada rueda de esquina.
- `src/mission/`: control de misión con el patrón de Open MCT. `measures.js` define cada medida (nombre, unidad, proveedor). `providers.js` tiene los proveedores, con `request` para toda la misión y `subscribe` para datos en vivo. `telemetry.js` es una mini API, `ephemeris.js` calcula órbitas y soles de misión, y `panel.js` es el HUD que se oculta con T. Un dato es `{ sol, value }`.
- `src/cameras/`: `markers.js` pone sprites brillantes sobre las piezas `Mastcam_Z_cams`, `NavCams`, `hazcams_front` y `WATSON` y gestiona hover y clic. `viewer.js` hace el obturador, el flash, el revelado, la ampliación, las flechas y Esc. `photos.js` guarda las 20 fotos elegidas a mano, con URL, sol, fecha y crédito.

Ganchos de prueba en `window`: `__sceneReady`, `__rover` (con `state.wheels` y `update(dt)`), `__mission`, `__cameras` (`markers` con posición en pantalla y `pickAt(x, y)`) y `__photo`. `check.mjs` depende de ellos; no los quites ni los renombres.

## Convenciones

- Interfaz, comentarios y commits en español. Identificadores y nombres de archivo en inglés (`createRover`, `heightAt`).
- Módulos ES pequeños con una función `createX(...)` que devuelve `{ update, ... }`. Sin clases ni frameworks.
- La escena está en metros; el rover avanza hacia −Z local en el código.
- Estilo del HUD: cristal oscuro color óxido (`rgba(28, 14, 8, …)`), acento `#f0a064` y tipografía monoespaciada del sistema. No se cargan fuentes externas.
- Las animaciones del HUD y del visor de fotos respetan `prefers-reduced-motion`.

## Datos externos

- **Manejos:** `https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json`. Permite CORS y se lee en vivo. Usa solo los puntos con `final === 'y'`, porque los intermedios traen la distancia a 0.
- **Fotos:** `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&ver=1.2&num=100&page=0&order=sol+desc`, con `&search=%7CNAVCAM_LEFT%7C` para filtrar por cámara.
  - **CORS:** la API lo permite, pero los archivos de imagen no lo traen. Se pueden mostrar con `<img>`, pero no leer sus píxeles en un canvas.
  - **Color:** en Mastcam-Z y WATSON una foto a color lleva `EBY` en el `imageid`; `ECM` es gris. En NavCam y Hazcam ese código no sirve, porque `ECM` suele ser a color: hay que mirar la imagen.
  - **Revisión previa:** antes de cambiar `photos.js`, descarga y mira las candidatas (hojas de contactos en `screenshots/revision/`) y descarta cielo vacío, sol, la diana de calibración, miniaturas y fotos con luz LED azul.
- **Tiempo de luz:** se calcula en el navegador, sin red. Se validó contra JPL Horizons (`ssd.jpl.nasa.gov/api/horizons.api`).

## Trampas conocidas

- **El rover conduce marcha atrás.** El frente del modelo (brazo, Hazcam delantera, mástil) está en +Z local y el RTG en −Z, pero el juego avanza hacia −Z. Está pendiente: girar el modelo 180° al cargarlo.
- **Chrome headless con SwiftShader va a pocos fotogramas por segundo.** Los temporizadores y la amortiguación de la cámara tardan mucho más de lo esperado; no confundas eso con fallos. Proyecta posiciones a pantalla después de `camera.updateMatrixWorld()`.
- **La suspensión no se articula.** Son unas 280 piezas sueltas mezcladas en una malla por material.
- **Velocidad acelerada a propósito.** El juego usa 2,5 m/s (`MAX_SPEED`); el rover real va a 4,2 cm/s.
- **`screenshots/` está en `.gitignore`.** No enlaces capturas desde el README.
- **Usa la API de Vite.** `check.mjs` levanta el servidor con `createServer` cuando hace falta; no lances procesos `vite` sueltos.
