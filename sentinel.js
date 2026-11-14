/* Escenas Sentinel-2 reales: las incluidas en el sitio y la lectura en vivo del archivo abierto (Earth Search / AWS). */
(function () {
  'use strict';
  var A = window.PCApp, $ = function (id) { return document.getElementById(id); };
  if (!A || !window.PC_WEB) return;
  var STAC = 'https://earth-search.aws.element84.com/v1', CAT = null, DEM = null, demTried = false;
  var SECTORES = [
    { id: 'potter', n: 'Península Potter y Punta Stranger', lon: -58.640, lat: -62.250, kx: 5.5, ky: 4.75 },
    { id: 'barton', n: 'Península Barton y Punta Narębski', lon: -58.770, lat: -62.232, kx: 5, ky: 4 },
    { id: 'ardley', n: 'Isla Ardley y península Fildes', lon: -58.940, lat: -62.205, kx: 5, ky: 4.5 },
    { id: 'almirantazgo', n: 'Bahía Almirantazgo: Point Thomas y Llano Point', lon: -58.450, lat: -62.175, kx: 5, ky: 4.5 },
    { id: 'lions', n: 'Lions Rump', lon: -58.125, lat: -62.135, kx: 4, ky: 3.5 },
    { id: 'harmony', n: 'Punta Armonía, isla Nelson', lon: -59.215, lat: -62.300, kx: 4.5, ky: 4 }
  ];
  var BAD = { 0: 1, 1: 1, 3: 1, 8: 1, 9: 1, 10: 1 };
  function tmo(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('El servidor de imágenes tardó demasiado. Volver a intentar.')); }, ms); })]); }

  /* ---------- relieve incluido ---------- */
  async function getDEM() {
    if (demTried) return DEM; demTried = true;
    try {
      if (!CAT || !CAT.relieve) return null;
      await A.ensureGeoTIFF();
      var buf = await (await fetch(CAT.relieve.archivo)).arrayBuffer(), tiff = await GeoTIFF.fromArrayBuffer(buf), im = await tiff.getImage();
      var ras = await im.readRasters({ interleave: false }), o = im.getOrigin(), r = im.getResolution(), nd = im.getGDALNoData();
      DEM = { w: im.getWidth(), h: im.getHeight(), data: ras[0] instanceof Float32Array ? ras[0] : Float32Array.from(ras[0]), nodata: nd === null ? -9999 : nd, geo: { ox: o[0], oy: o[1], rx: r[0], ry: r[1], epsg: 4326 }, nombre: CAT.relieve.nombre };
    } catch (e) { DEM = null; }
    return DEM;
  }

  /* ---------- armado de la escena ---------- */
  /* bands: [azul, verde, rojo, nir, swir] como Float32Array en reflectancia x10000; scl a la misma grilla */
  async function makeScene(o) {
    var N = o.w * o.h, valid = new Uint8Array(N), bad = 0, land = 0;
    for (var i = 0; i < N; i++) { var v = o.scl[i]; if (BAD[v] || o.bands[2][i] === 0) { bad++; } else valid[i] = 1; if (v !== 6) land++; }
    var sc = PE.makeScene({ w: o.w, h: o.h, bands: o.bands, valid: bad ? valid : null, map: { r: 2, g: 1, b: 0, nir: 3, swir: 4 },
      geo: { ox: o.ox, oy: o.oy, rx: 10, ry: -10, epsg: 32721 }, pxArea: 100, gsdSource: 'de Sentinel-2 (10 m)', name: o.name, date: o.date, note: o.note });
    sc.preset = 'custom'; sc.down = 1; sc.orig = [o.w, o.h]; sc.scl = o.scl; sc.gamma = 0.45;
    sc.rule = CAT && CAT.regla ? CAT.regla : null; if (CAT && CAT.limpieza) { sc.open = CAT.limpieza.abrir; sc.close = CAT.limpieza.cerrar; sc.minArea = CAT.limpieza.minimo; }
    if (CAT && CAT.zona && o.zona !== false) { var Z = CAT.zona, bx = [Math.max(0, Math.round((Z.x0 - o.ox) / 10)), Math.max(0, Math.round((o.oy - Z.y1) / 10)), Math.min(o.w, Math.round((Z.x1 - o.ox) / 10)), Math.min(o.h, Math.round((o.oy - Z.y0) / 10))];
      if (bx[2] - bx[0] > 5 && bx[3] - bx[1] > 5) { var roi = new Uint8Array(N); for (var y = bx[1]; y < bx[3]; y++) roi.fill(1, y * o.w + bx[0], y * o.w + bx[2]); sc.roi = roi; sc.roiBox = bx; sc.roiName = Z.nombre; sc.roiOn = true; } }
    var dem = await getDEM();
    if (dem) { var el = PE.resampleDEM(dem, sc); if (el) { sc.dem = el; sc.demName = dem.nombre; sc.demCell = 30; } }
    return sc;
  }
  function note(e, extra) {
    return 'Sentinel-2 del ' + e.fecha.split('-').reverse().join('/') + ', temporada ' + PE.seasonLabel(PE.season(e.fecha)) + '. Píxel de 10 m; ' + Math.round(e.nubes * 100) + ' % del recorte con nubes o sombras, que quedan fuera del análisis. ' + (extra || '') + 'Contiene datos Copernicus Sentinel modificados.';
  }
  async function loadBundled(e) {
    A.busy('Leyendo la escena del ' + e.fecha + '…');
    try {
      await A.ensureGeoTIFF();
      var buf = await (await fetch(e.archivo)).arrayBuffer(), tiff = await GeoTIFF.fromArrayBuffer(buf), im = await tiff.getImage();
      var ras = await im.readRasters({ interleave: false }), o = im.getOrigin(), bands = [];
      for (var b = 0; b < 5; b++) bands.push(Float32Array.from(ras[b]));
      var sc = await makeScene({ w: im.getWidth(), h: im.getHeight(), bands: bands, scl: ras[5], ox: o[0], oy: o[1], name: 'Sentinel-2 ' + e.fecha + ' · Península Potter', date: e.fecha, note: note(e) });
      A.setScene(sc);
    } catch (err) { A.toast('No se pudo leer la escena incluida. ' + (err && err.message ? err.message : '')); }
    A.busy(null);
  }

  /* ---------- archivo en vivo ---------- */
  function sectorWindow(s) {
    var c = PE.lonLatToUTM(s.lon, s.lat, 21, true), sn = function (v) { return Math.round(v / 20) * 20; };
    return { x0: sn(c[0] - s.kx * 1000), x1: sn(c[0] + s.kx * 1000), y0: sn(c[1] - s.ky * 1000), y1: sn(c[1] + s.ky * 1000) };
  }
  /* lectura de una ventana con corte por demora y reintentos: las conexiones lentas dejan pedidos colgados */
  async function readWinTry(url, W, outW, outH, method, ms, tries) {
    var last;
    for (var t = 0; t < tries; t++) {
      var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, ms);
      try { var out = await readWin(url, W, outW, outH, method, ctl.signal); clearTimeout(timer); return out; }
      catch (e) { clearTimeout(timer); last = e; if (e && e.message === 'fuera') throw e; }
    }
    throw new Error(last && last.name === 'AbortError' ? 'El servidor de imágenes tardó demasiado. Volver a intentar.' : (last && last.message) || 'lectura fallida');
  }
  async function readWin(url, W, outW, outH, method, signal) {
    var tiff = await GeoTIFF.fromUrl(url, { blockSize: 524288, cacheSize: 40 }, signal), img = await tiff.getImage(), o = img.getOrigin(), r = img.getResolution(), ry = Math.abs(r[1]);
    var px0 = Math.round((W.x0 - o[0]) / r[0]), px1 = Math.round((W.x1 - o[0]) / r[0]), py0 = Math.round((o[1] - W.y1) / ry), py1 = Math.round((o[1] - W.y0) / ry);
    if (px0 < 0 || py0 < 0 || px1 > img.getWidth() || py1 > img.getHeight()) throw new Error('fuera');
    var opt = { window: [px0, py0, px1, py1], interleave: false, signal: signal };
    if (outW) { opt.width = outW; opt.height = outH; opt.resampleMethod = method; }
    return (await img.readRasters(opt))[0];
  }
  var items = [];
  async function search() {
    var s = SECTORES.filter(function (x) { return x.id === $('s2sector').value; })[0], y = +$('s2season').value, W = sectorWindow(s);
    var box = $('s2res'); box.textContent = 'Consultando el archivo…';
    try {
      var dlat = s.ky / 111.2, dlon = s.kx / (111.3 * Math.cos(s.lat * Math.PI / 180));
      var body = { collections: ['sentinel-2-l2a'], bbox: [s.lon - dlon * 0.6, s.lat - dlat * 0.6, s.lon + dlon * 0.6, s.lat + dlat * 0.6], datetime: y + '-10-01T00:00:00Z/' + (y + 1) + '-03-31T23:59:59Z', limit: 100, query: { 'eo:cloud_cover': { lt: 85 } } };
      var j = await tmo(fetch(STAC + '/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }), 40000);
      items = (j.features || []).map(function (f) { var p = f.properties, a = f.assets; return { id: f.id, fecha: p.datetime.slice(0, 10), tesela: (p['grid:code'] || '').replace('MGRS-', ''), nubeTesela: p['eo:cloud_cover'], pb: p['s2:processing_baseline'] || '', off: p['earthsearch:boa_offset_applied'] === true,
        a: { b: a.blue.href, g: a.green.href, r: a.red.href, n: a.nir.href, s: a.swir16.href, scl: a.scl.href } }; });
      if (!items.length) { box.textContent = 'No hay escenas de esa temporada en el archivo. La cobertura de este sector empieza en 2018/19.'; return; }
      box.textContent = 'Midiendo las nubes sobre el sector en ' + items.length + ' escenas…';
      var q = items.slice(), done = 0;
      async function worker() { while (q.length) { var it = q.shift(); try { var scl = await readWinTry(it.a.scl, W, undefined, undefined, undefined, 25000, 2), bad = 0; for (var i = 0; i < scl.length; i++) if (BAD[scl[i]]) bad++; it.nubes = bad / scl.length; } catch (e) { it.nubes = null; } done++; box.textContent = 'Midiendo las nubes sobre el sector: ' + done + ' de ' + items.length + '…'; } }
      await A.ensureGeoTIFF(); await Promise.all([worker(), worker(), worker(), worker()]);
      var best = {}; items.forEach(function (it) { if (it.nubes === null) return; var k = it.fecha; if (!best[k] || it.nubes < best[k].nubes - 0.01 || (Math.abs(it.nubes - best[k].nubes) <= 0.01 && it.off && !best[k].off)) best[k] = it; });
      var list = Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b) { return a.nubes - b.nubes; }).slice(0, 12);
      box.textContent = '';
      if (!list.length) { box.textContent = 'Ninguna escena de esa temporada cubre el sector completo.'; return; }
      list.forEach(function (it) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'btn s2item';
        b.textContent = it.fecha.split('-').reverse().join('/') + ' · ' + Math.round(it.nubes * 100) + ' % de nubes en el sector';
        b.addEventListener('click', function () { loadLive(it, s, W); });
        box.appendChild(b);
      });
    } catch (e) { box.textContent = 'No se pudo consultar el archivo Sentinel-2. Revisar la conexión; desde algunas redes ese servidor está bloqueado.'; }
  }
  async function loadLive(it, s, W) {
    A.busy('Leyendo Sentinel-2 del ' + it.fecha + ' desde el archivo…');
    try {
      await A.ensureGeoTIFF();
      var w = (W.x1 - W.x0) / 10, h = (W.y1 - W.y0) / 10, raw = [];
      var urls = [[it.a.b], [it.a.g], [it.a.r], [it.a.n], [it.a.s, w, h, 'bilinear'], [it.a.scl, w, h, 'nearest']];
      for (var k = 0; k < urls.length; k++) { A.busy('Leyendo Sentinel-2 del ' + it.fecha + ': banda ' + (k + 1) + ' de 6…'); raw.push(await readWinTry(urls[k][0], W, urls[k][1], urls[k][2], urls[k][3], 45000, 3)); }
      var sub = it.pb >= '04.00' && !it.off ? 1000 : 0, bands = raw.slice(0, 5).map(function (a) { var o = new Float32Array(a.length); for (var i = 0; i < a.length; i++) { var v = a[i]; o[i] = v === 0 ? 0 : (v > sub ? v - sub : 1); } return o; });
      var e = { fecha: it.fecha, nubes: it.nubes || 0 };
      var sc = await makeScene({ w: w, h: h, bands: bands, scl: raw[5], ox: W.x0, oy: W.y1, name: 'Sentinel-2 ' + it.fecha + ' · ' + s.n, date: it.fecha, note: note(e, 'Leída en vivo del archivo abierto. ') });
      A.setScene(sc);
    } catch (err) { A.toast(err && err.message === 'fuera' ? 'Esa escena no cubre el sector completo. Probar otra fecha.' : 'No se pudo leer la escena. ' + (err && err.message ? err.message : '')); }
    A.busy(null);
  }

  /* ---------- arranque ---------- */
  (function ui() {
    var ss = $('s2sector'), se = $('s2season');
    SECTORES.forEach(function (s) { ss.add(new Option(s.n, s.id)); });
    var now = new Date(), last = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
    for (var y = last; y >= 2018; y--) se.add(new Option('Temporada ' + PE.seasonLabel(y), String(y)));
    $('s2go').addEventListener('click', search);
    $('s2cat').addEventListener('change', function () { var e = CAT && CAT.escenas.filter(function (x) { return x.archivo === $('s2cat').value; })[0]; if (e) loadBundled(e); });
  })();
  fetch('datos/catalogo.json').then(function (r) { if (!r.ok) throw new Error('sin catálogo'); return r.json(); }).then(function (c) {
    CAT = c; var sel = $('s2cat');
    c.escenas.forEach(function (e) { sel.add(new Option(e.fecha.split('-').reverse().join('/') + ' · temporada ' + PE.seasonLabel(PE.season(e.fecha)) + ' · ' + Math.round(e.nubes * 100) + ' % nubes', e.archivo)); });
    var def = c.escenas.filter(function (e) { return e.archivo === c.porDefecto; })[0] || c.escenas[0];
    sel.value = def.archivo; return loadBundled(def);
  }).catch(function () { $('s2box').hidden = true; A.demo(); });
})();
