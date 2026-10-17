# Perseverancia

Simulación 3D del rover Perseverance de la NASA en un paisaje de Marte, hecha con Vite y Three.js. Conduces a Percy por las dunas con el modelo oficial a escala real. Sus ruedas se mueven como las del rover de verdad, un panel de control de misión muestra datos reales de la misión y sus cámaras toman fotos reales de Marte.

## Qué incluye

- **Paisaje de Marte:** dunas, rocas, cielo color caramelo con polvo, sol bajo con halo azulado, Fobos y Deimos.
- **Rover conducible:** modelo 3D oficial de Perseverance (comprimido con Draco) a escala real (3 m de largo), con huellas en el suelo y una cámara orbital que lo sigue.
- **Ruedas con física real:** las 6 ruedas ruedan sin patinar, solo giran las 4 de las esquinas, las del medio van fijas y, parado, el rover pivota sobre sí mismo.
- **Control de misión:** distancia recorrida, altura del terreno e inclinación, sacados del historial de manejos de la NASA, y el tiempo de luz entre la Tierra y Marte, calculado en vivo. Cada dato trae su gráfica de toda la misión y una frase que explica qué significa.
- **Cámaras de Percy:** puntos que brillan sobre Mastcam-Z, NavCam, Hazcam delantera y WATSON. Al hacer clic suena el obturador, salta el flash y se revela una foto real de Marte tomada en los últimos días.

## Requisitos

- Node.js 24 y npm 11 (es con lo que se desarrolla).
- Para `npm run check`: Google Chrome instalado. El script usa el Chrome del sistema y no descarga navegadores.
- Conexión a internet: el panel y las fotos leen datos de mars.nasa.gov en vivo.

## Cómo ejecutarlo

```bash
npm install
npm run dev
```

Abre http://localhost:5173 en el navegador.

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en el puerto 5173, con recarga al guardar |
| `npm run build` | Genera la versión de producción en `dist/` |
| `npm run preview` | Sirve la versión de `dist/` para probarla |
| `npm run check` | Comprobación automática en un Chrome invisible (ver abajo) |

## Controles

| Tecla o gesto | Acción |
|---|---|
| W / S | Avanzar / retroceder |
| A / D | Girar. Parado y sin W/S, pivota sobre sí mismo |
| Arrastrar con el ratón | Girar la cámara 360° alrededor del rover |
| Rueda del ratón | Acercar o alejar |
| T | Mostrar u ocultar el control de misión |
| Clic en un punto brillante | Tomar una foto con esa cámara |
| Clic en la foto | Ampliarla a pantalla completa |
| ← / → | Más fotos de la misma cámara |
| Esc | Cerrar la foto y volver al juego |

## Comprobación automática

`npm run check` abre el juego en un Chrome invisible. Si ya tienes `npm run dev` en marcha usa ese servidor, y si no levanta uno propio. Comprueba lo siguiente:

- las 4 medidas del control de misión cargan con un número real;
- la tecla T oculta el panel;
- cada cámara abre una foto real de la NASA;
- las ruedas no patinan al ir recto y las esquinas se orientan para pivotar;
- la consola no tiene errores.

Guarda capturas en `screenshots/`: `check.png` y `foto-<cámara>.png`. Si algo falla, termina con código de salida 1.

También hay dos pruebas manuales que necesitan `npm run dev` en marcha: `node scripts/drive-test.mjs` (conduce y guarda `screenshots/drive.png`) y `node scripts/orbit-test.mjs` (gira la cámara y guarda `screenshots/orbit.png`).

## Estructura

```
index.html             página única; carga src/main.js
src/
  main.js              escena, luces, polvo, cámara orbital y bucle principal
  terrain.js           terreno de dunas (heightAt da la altura en cualquier punto)
  rocks.js  sky.js  moons.js  noise.js
  rover.js             carga del modelo, conducción y huellas
  wheels.js            separa las 6 ruedas del modelo para que giren y dirijan
  mission/             control de misión (telemetría al estilo de Open MCT)
  cameras/             puntos de cámara, visor de fotos y fotos elegidas
public/
  models/perseverance.glb   modelo 3D del rover (Draco)
  draco/                    decodificador Draco
scripts/               check.mjs y pruebas con Playwright
docs/mapa-del-repo.html     mapa de Open MCT usado como referencia
```

## Datos y créditos

- **Historial de manejos:** [M20_waypoints.json](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json), de NASA/JPL-Caltech.
- **Fotos:** API de imágenes en bruto de la NASA (`mars.nasa.gov/rss/api`, feed `raw_images`). Los créditos son NASA/JPL-Caltech, y NASA/JPL-Caltech/ASU en Mastcam-Z. Las 20 fotos se eligieron a mano y están en `src/cameras/photos.js`.
- **Tiempo de luz:** elementos keplerianos aproximados de JPL. El resultado coincide con JPL Horizons al 0,01 %.

## Limitaciones conocidas

- **Conduce marcha atrás.** El frente del modelo (brazo y mástil) está en +Z y el juego avanza hacia −Z.
- **Suspensión rígida.** La suspensión rocker-bogie no se articula: el chasis se inclina con el terreno, pero las ruedas no suben ni bajan por separado.
- **Velocidad acelerada.** La velocidad máxima es 2,5 m/s; el Perseverance real va a 4,2 cm/s.
