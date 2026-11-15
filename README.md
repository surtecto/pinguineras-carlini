# Pingüineras de Carlini

Herramienta web para detectar colonias de pingüinos por la mancha de guano en imágenes satelitales y aéreas, medir su superficie, estimar parejas reproductoras y seguirlas por temporada. Sitio de referencia: Punta Stranger, Península Potter (ZAEP N.º 132), junto a la Base Carlini, Isla 25 de Mayo, Antártida.

**Sitio:** https://surtecto.github.io/pinguineras-carlini/ · **Manual:** https://surtecto.github.io/pinguineras-carlini/manual.html

## Qué hace

- Abre escenas Sentinel-2 reales de la Península Potter incluidas en el sitio, o busca otras fechas y sectores directamente en el archivo abierto de Copernicus.
- Carga imágenes propias: GeoTIFF multibanda (WGS 84, UTM, EPSG:3031), PNG o JPG.
- Detecta guano por regla espectral (umbrales fijos o relativos a cada escena) o por clasificación de máxima verosimilitud con ejemplos («esto es guano» / «esto no es guano»).
- Separa grupos, mide superficie y estima parejas por densidad de nidos; cuenta individuos en imágenes de hasta 15 cm por píxel.
- Con un modelo de elevación calcula cota, pendiente, orientación, distancia al mar y al grupo vecino.
- Guarda detecciones por temporada, las compara con los censos de terreno publicados (70 colonias del sector desde 1956/57) y calcula mapas de cambio entre fechas.
- Exporta CSV, GeoJSON y PNG. Todo corre en el navegador: ninguna imagen se sube a un servidor.

## Estado

Es una herramienta de exploración, **sin validación de campo**. A 10 m por píxel Sentinel-2 muestra manchas compatibles con guano, no aves ni nidos. Ver el manual para los límites.

## Estructura

| Archivo | Contenido |
|---|---|
| `index.html`, `style.css` | Página y estilos |
| `engine.js` | Motor de detección y análisis espacial (sin dependencias) |
| `app.js` | Visor, controles, resultados y exportación |
| `tiempo.js` | Mapa del sector, series de censos, registro de detecciones |
| `sentinel.js` | Escenas Sentinel-2 incluidas y lectura en vivo del archivo |
| `ui.js` | Pestañas, panel de tres pasos y franja de estado |
| `extra.js` | Base Esri bajo la imagen, zona de análisis editable, fichas por grupo, lista de ortomosaicos de dron |
| `supervisada.js` | Clasificación supervisada: clases, ejemplos marcados sobre la imagen, mapa clasificado y superficies |
| `data.js` | Censos (MAPPPD) y línea de costa (Natural Earth) |
| `datos/` | Recortes Sentinel-2, relieve Copernicus DEM, catálogo y serie inicial |
| `vendor/geotiff.js` | Lector GeoTIFF (geotiff.js 2.1.3, licencia MIT) |
| `vendor/leaflet/` | Mapa de colonias (Leaflet 1.9.4, licencia BSD de 2 cláusulas) |
| `docs/` | Informe de trabajo y manual en Word |

## Datos y créditos

- **Sentinel-2 L2A:** contiene datos Copernicus Sentinel modificados (2019–2025), leídos de Earth Search (Element 84) en AWS.
- **Relieve:** Copernicus DEM GLO-30, © DLR e.V. 2010–2014 y © Airbus Defence and Space GmbH 2014–2018, provisto bajo licencia COPERNICUS por la Unión Europea y la ESA.
- **Censos:** MAPPPD / Antarctic Penguin Biogeography Project (mapppdr 3.1), CC BY 4.0.
- **Costa:** Natural Earth, dominio público.

Desarrollado con Claude (Anthropic) para Juan Patricio Addesso, noviembre de 2026.
