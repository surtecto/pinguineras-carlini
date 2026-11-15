/* Interfaz de Pingüineras de Carlini. Depende de engine.js (PE). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var MAXPX = 4e6;
  var CLASSES = [{ id: 'guano', label: 'Esto es guano', color: '#ff5fa2' }, { id: 'no', label: 'Esto no es guano', color: '#ffd23f' }];
  var PRESETS = {
    rgb: { r: 0, g: 1, b: 2, nir: -1, swir: -1 }, bgrn: { r: 2, g: 1, b: 0, nir: 3, swir: -1 },
    wv8: { r: 4, g: 2, b: 1, nir: 6, swir: -1 }, l8: { r: 3, g: 2, b: 1, nir: 4, swir: 5 }, s2: { r: 3, g: 2, b: 1, nir: 7, swir: 10 }
  };
  var S = {
    scene: null, method: 'rule', rule: PE.defaultRule(), samples: [], cls: 'guano', brush: 4, tol: 24,
    open: 1, close: 1, minArea: 8, dens: { lo: 0.33, mid: 0.63, hi: 0.93 }, mode: 'rgb', gamma: 1, ovA: 0.5, ovOn: true,
    tool: 'pan', view: { k: 1, x: 0, y: 0 }, res: null, blobs: null, ind: { on: false, diam: 0.35, k: 6, guano: true },
    sel: 0, measure: [], down: 1, maxPx: 4e6, terr: { on: false, slope: 35, elev: 150 }
  };
  var cv = $('view'), ctx = cv.getContext('2d');
  var base = document.createElement('canvas'), fill = document.createElement('canvas'), edge = document.createElement('canvas');
  var nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }), nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }),
    nf2 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }), nf3 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

  /* ---------- avisos ---------- */
  var toastT = 0;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 4200); }
  function busy(msg) { $('busy').hidden = !msg; if (msg) $('busyTxt').textContent = msg; }
  function later(fn) { return new Promise(function (res) { requestAnimationFrame(function () { setTimeout(function () { res(fn()); }, 0); }); }); }

  /* ---------- carga de imágenes ---------- */
  var gtLoading = null;
  function ensureGeoTIFF() {
    if (window.GeoTIFF) return Promise.resolve();
    if (!gtLoading) gtLoading = new Promise(function (res, rej) {
      var sc = document.createElement('script');
      sc.src = window.PC_WEB ? 'vendor/geotiff.js' : 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js';
      sc.onload = function () { res(); }; sc.onerror = function () { gtLoading = null; rej(new Error('No se pudo cargar el lector de GeoTIFF. Revisar la conexión y volver a intentar.')); };
      document.head.appendChild(sc);
    });
    return gtLoading;
  }
  function fitSize(W, H, maxPx) { var f = Math.min(1, Math.sqrt(maxPx / (W * H))); return { w: Math.max(1, Math.round(W * f)), h: Math.max(1, Math.round(H * f)) }; }

  function loadRaster(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var W = img.naturalWidth, H = img.naturalHeight, t = fitSize(W, H, S.maxPx);
        var c = document.createElement('canvas'); c.width = t.w; c.height = t.h;
        var g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, t.w, t.h);
        URL.revokeObjectURL(url);
        var d = g.getImageData(0, 0, t.w, t.h).data, N = t.w * t.h;
        var R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), valid = null;
        for (var i = 0, j = 0; i < N; i++, j += 4) {
          R[i] = d[j]; G[i] = d[j + 1]; B[i] = d[j + 2];
          if (d[j + 3] < 8) { if (!valid) { valid = new Uint8Array(N).fill(1); } valid[i] = 0; }
        }
        var sc = PE.makeScene({ w: t.w, h: t.h, bands: [R, G, B], eightBit: true, valid: valid, name: file.name });
        sc.down = W / t.w; sc.orig = [W, H]; sc.date = guessDate(file.name, '');
        res(sc);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('El navegador no pudo leer la imagen. Probar con PNG, JPG o GeoTIFF.')); };
      img.src = url;
    });
  }

  /* Lee una imagen enorme sin pirámides por franjas horizontales y la reduce sobre la marcha: nunca hay más de unos 16 MP en memoria. */
  async function readBanded(im, win, t, n) {
    var W = win[2] - win[0], H = win[3] - win[1], f = H / t.h, ro = Math.max(1, Math.floor(16e6 / (W * f))), out = [];
    for (var b = 0; b < n; b++) out.push(new Float32Array(t.w * t.h));
    if (im.getTileHeight() <= 4 && f >= 2) { // TIFF en tiras de una fila (típico de Pix4D): alcanza con leer una fila de cada tantas
      for (var r = 0; r < t.h; r++) {
        var sy = Math.min(win[3] - 1, win[1] + Math.floor((r + 0.5) * f)), line = await im.readRasters({ window: [win[0], sy, win[2], sy + 1], width: t.w, height: 1, resampleMethod: 'nearest', interleave: false });
        for (b = 0; b < n; b++) out[b].set(line[b], r * t.w);
        if (r % 40 === 0) { busy('Armando la vista general de una imagen de ' + nf0.format(W * H / 1e6) + ' megapíxeles… ' + Math.round(100 * r / t.h) + ' %'); await new Promise(function (res) { setTimeout(res, 0); }); }
      }
      return out;
    }
    for (var oy = 0; oy < t.h; oy += ro) {
      var o1 = Math.min(t.h, oy + ro), y0 = win[1] + Math.round(oy * f), y1 = win[1] + Math.max(Math.round(oy * f) + 1, Math.round(o1 * f));
      var part = await im.readRasters({ window: [win[0], y0, win[2], Math.min(win[3], y1)], width: t.w, height: o1 - oy, resampleMethod: 'nearest', interleave: false });
      for (b = 0; b < n; b++) out[b].set(part[b], oy * t.w);
      busy('Armando la vista general de una imagen de ' + nf0.format(W * H / 1e6) + ' megapíxeles… ' + Math.round(100 * o1 / t.h) + ' %');
      await new Promise(function (r) { setTimeout(r, 0); });
    }
    return out;
  }
  async function loadTiff(file, cut) {
    await ensureGeoTIFF();
    var tiff = cut ? cut.tiff : await GeoTIFF.fromBlob(file), main = await tiff.getImage(0);
    var W0 = main.getWidth(), H0 = main.getHeight(), n = main.getSamplesPerPixel();
    var win = cut ? cut.win : [0, 0, W0, H0], W = win[2] - win[0], H = win[3] - win[1];
    var t = fitSize(W, H, cut ? 9e6 : Math.min(S.maxPx, Math.floor(S.maxPx * 6.5 / Math.max(3, n))));
    var img = main, count = await tiff.getImageCount();
    for (var i = 1; i < count; i++) { // usar una pirámide interna si alcanza
      var im = await tiff.getImage(i);
      if (im.getSamplesPerPixel() === n && im.getWidth() / W0 * W >= t.w && im.getWidth() < img.getWidth()) img = im;
    }
    var ras, N = t.w * t.h, bands = [], ks = img.getWidth() / W0, iw = [Math.round(win[0] * ks), Math.round(win[1] * ks), Math.round(win[2] * ks), Math.round(win[3] * ks)];
    if ((iw[2] - iw[0]) * (iw[3] - iw[1]) > 6e7) ras = await readBanded(img, iw, t, n);
    else {
      var opts = { interleave: false, window: iw };
      if (iw[2] - iw[0] !== t.w || iw[3] - iw[1] !== t.h) { opts.width = t.w; opts.height = t.h; opts.resampleMethod = 'bilinear'; }
      ras = await img.readRasters(opts);
    }
    for (var b = 0; b < n; b++) bands.push(ras[b] instanceof Float32Array ? ras[b] : Float32Array.from(ras[b]));
    var bits = main.getBitsPerSample(), eight = bits === 8 && main.getSampleFormat() === 1;
    var fd = main.fileDirectory || {}, nodata = main.getGDALNoData(), valid = null, bad = 0;
    if (eight && n === 4 && fd.ExtraSamples) { // canal alfa
      valid = new Uint8Array(N);
      for (var q = 0; q < N; q++) { valid[q] = bands[3][q] > 0 ? 1 : 0; if (!valid[q]) bad++; }
      bands = bands.slice(0, 3); n = 3; if (!bad) valid = null;
    } else {
      valid = new Uint8Array(N);
      for (var p = 0; p < N; p++) {
        var inval = true;
        for (var c = 0; c < n; c++) { var v = bands[c][p]; if (v !== v) continue; if (nodata !== null ? v !== nodata : (eight || v !== 0)) { inval = false; break; } }
        valid[p] = inval ? 0 : 1; if (inval) bad++;
      }
      if (!bad) valid = null;
    }
    var geo = null;
    try {
      var o = main.getOrigin(), r = main.getResolution(), gk = main.getGeoKeys() || {};
      var epsg = gk.ProjectedCSTypeGeoKey || gk.GeographicTypeGeoKey || 0;
      if (epsg === 32767) epsg = 0;
      geo = { ox: o[0] + win[0] * r[0], oy: o[1] + win[1] * r[1], rx: r[0] * W / t.w, ry: r[1] * H / t.h, epsg: epsg };
      if (!PE.crsKind(epsg) && Math.abs(o[0]) <= 180 && Math.abs(o[1]) <= 90 && Math.abs(r[0]) < 0.05) { geo.epsg = 4326; geo.assumed = true; }
    } catch (e) { geo = null; }
    var map = n >= 3 ? { r: 0, g: 1, b: 2, nir: -1, swir: -1 } : { r: 0, g: 0, b: 0, nir: -1, swir: -1 }, preset = 'rgb';
    if (!eight) {
      if (n === 4 || (n > 4 && n < 7)) preset = 'bgrn'; else if (n === 7) preset = 'l8'; else if (n === 8) preset = 'wv8'; else if (n >= 9) preset = 's2';
      if (preset !== 'rgb') map = Object.assign({}, PRESETS[preset]);
      if (map.swir >= n) map.swir = -1;
    }
    var sc = PE.makeScene({ w: t.w, h: t.h, bands: bands, eightBit: eight, valid: valid, map: map, geo: geo, name: file.name });
    sc.preset = n < 3 ? 'custom' : preset; sc.down = W / t.w; sc.orig = [W, H]; sc.date = guessDate(file.name, fd.DateTime || '');
    sc.src = { tiff: tiff, file: file, win: win, W0: W0, H0: H0 };
    if (geo) { sc.pxArea = PE.pixelArea(geo, t.w, t.h); sc.gsdSource = 'leído del GeoTIFF' + (geo.epsg ? ' (EPSG:' + geo.epsg + (geo.assumed ? ', supuesto' : '') + ')' : ''); }
    return sc;
  }

  function guessDate(name, tag) {
    var m = /(19[7-9]\d|20[0-4]\d)[:\-_]?(0[1-9]|1[0-2])[:\-_]?([0-2]\d|3[01])/.exec(String(tag)) || /(19[7-9]\d|20[0-4]\d)[\-_]?(0[1-9]|1[0-2])[\-_]?([0-2]\d|3[01])/.exec(String(name));
    return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
  }
  async function loadDEM(file) {
    var sc = S.scene; if (!file || !sc) return;
    if (!sc.geo) { toast('El relieve se ubica por coordenadas: hace falta que la imagen cargada sea un GeoTIFF georreferenciado.'); return; }
    busy('Leyendo el modelo de elevación…');
    try {
      await ensureGeoTIFF();
      var tiff = await GeoTIFF.fromBlob(file), im = await tiff.getImage(0), W = im.getWidth(), H = im.getHeight(), t = fitSize(W, H, 6e6);
      var opts = { samples: [0], interleave: false };
      if (t.w !== W || t.h !== H) { opts.width = t.w; opts.height = t.h; opts.resampleMethod = 'bilinear'; }
      var ras = await im.readRasters(opts), o = im.getOrigin(), r = im.getResolution(), gk = im.getGeoKeys() || {};
      var epsg = gk.ProjectedCSTypeGeoKey || gk.GeographicTypeGeoKey || 0;
      if (!PE.crsKind(epsg) && Math.abs(o[0]) <= 180 && Math.abs(o[1]) <= 90 && Math.abs(r[0]) < 0.05) epsg = 4326;
      var nd = im.getGDALNoData(), dem = { w: t.w, h: t.h, data: ras[0] instanceof Float32Array ? ras[0] : Float32Array.from(ras[0]), nodata: nd === null ? -9999 : nd,
        geo: { ox: o[0], oy: o[1], rx: r[0] * W / t.w, ry: r[1] * H / t.h, epsg: epsg } };
      var el = PE.resampleDEM(dem, sc);
      if (!el) throw new Error('El modelo de elevación no se superpone con la imagen, o su sistema de coordenadas no es WGS 84, UTM ni EPSG:3031.');
      sc.elev = el; sc.demName = file.name; sc.demCell = Math.abs(dem.geo.rx) * (PE.crsKind(epsg) === 'geo' ? 111320 * Math.cos(62.2 * Math.PI / 180) : 1);
      computeTerrain(); syncControls(); schedule(0);
    } catch (e) { toast(e && e.message ? e.message : 'No se pudo leer el modelo de elevación.'); }
    busy(null);
  }
  function computeTerrain() {
    var sc = S.scene, g = PE.gsd(sc); sc.terrain = null; sc._sea = undefined;
    if (!sc.elev || !g) return;
    var rot = 0;
    if (sc.geo && PE.crsKind(sc.geo.epsg) === 'ps') { var c = PE.pxToCRS(sc.geo, sc.w / 2, sc.h / 2); rot = PE.ps3031ToLonLat(c[0], c[1])[0]; }
    sc.terrain = PE.terrain(sc.elev, sc.w, sc.h, g, rot);
  }

  async function loadFile(file) {
    if (!file) return;
    busy('Leyendo ' + file.name + '…');
    try {
      var sc = /\.tiff?$/i.test(file.name) || /tiff/.test(file.type) ? await loadTiff(file) : await loadRaster(file);
      setScene(sc);
    } catch (e) { toast(e && e.message ? e.message : 'No se pudo leer el archivo.'); }
    busy(null);
  }

  /* ---------- estado de la escena ---------- */
  function setScene(sc) {
    S.scene = sc; S.samples = []; S.res = null; S.blobs = null; S.sel = 0; S.measure = []; S.down = sc.down || 1;
    var g0 = PE.gsd(sc); S.brush = g0 && g0 >= 5 ? 2 : 4; // en imágenes de píxel grueso, un toque chico para no mezclar la mancha con su entorno
    S.gamma = sc.gamma || (sc.eightBit ? 1 : 0.6); S.mode = 'rgb'; S.method = 'rule'; S.tool = 'pan'; S.warn = '';
    S.dens = { lo: 0.33, mid: 0.63, hi: 0.93 }; $('species').value = 'adelia'; $('known').value = ''; $('measureBox').hidden = true;
    S.terr.on = false; $('terrOn').checked = false; if (sc.dem) { sc.elev = sc.dem; sc.demName = sc.demName || 'relieve sintético'; } computeTerrain();
    S.rule = sc.rule ? Object.assign(PE.defaultRule(), sc.rule) : PE.defaultRule(); S.open = sc.open !== undefined ? sc.open : 1; S.close = sc.close !== undefined ? sc.close : 1; S.minArea = sc.minArea !== undefined ? sc.minArea : 8;
    S.ind.on = false; $('indOn').checked = false;
    base.width = fill.width = edge.width = sc.w; base.height = fill.height = edge.height = sc.h;
    $('preset').value = sc.preset || 'rgb';
    buildBandSelects(); syncControls(); renderBase(); fitView(true); schedule(0);
    var note = sc.note || (sc.name + ' · ' + sc.orig[0] + ' × ' + sc.orig[1] + ' píxeles, ' + sc.n + (sc.n === 1 ? ' banda' : ' bandas') +
      (S.down > 1.01 ? '. Se analiza a 1/' + nf1.format(S.down) + ' de su resolución para que el navegador responda.' : '.'));
    $('sceneNote').textContent = note;
    document.dispatchEvent(new CustomEvent('pc:scene'));
  }
  function buildBandSelects() {
    var sc = S.scene, m = sc.map;
    [['bR', 'r', false], ['bG', 'g', false], ['bB', 'b', false], ['bN', 'nir', true], ['bS', 'swir', true]].forEach(function (d) {
      var sel = $(d[0]); sel.innerHTML = '';
      if (d[2]) sel.add(new Option('No hay', '-1'));
      for (var i = 0; i < sc.n; i++) sel.add(new Option('Banda ' + (i + 1), String(i)));
      sel.value = String(m[d[1]]);
    });
  }
  function syncControls() {
    var sc = S.scene, r = S.rule, g = PE.gsd(sc);
    [['pRi', r.ri, 'oRi'], ['pAx', r.ax, 'oAx'], ['pLmin', r.lmin, 'oLmin'], ['pLmax', r.lmax, 'oLmax'], ['pNdvi', r.ndvi, 'oNdvi'], ['pNdwi', r.ndwi, 'oNdwi'], ['pNdsi', r.ndsi, 'oNdsi']]
      .forEach(function (d) { $(d[0]).value = d[1]; $(d[2]).textContent = nf3.format(d[1]); });
    $('rowNdvi').hidden = $('rowNdwi').hidden = sc.map.nir < 0; $('rowNdsi').hidden = sc.map.swir < 0;
    $('pRel').checked = !!r.rel; $('rowRi').hidden = $('rowAx').hidden = !!r.rel; $('rowKri').hidden = $('rowKax').hidden = !r.rel;
    $('pKri').value = r.kri; $('oKri').textContent = nf1.format(r.kri); $('pKax').value = r.kax; $('oKax').textContent = nf1.format(r.kax);
    $('roiRow').hidden = !sc.roi; $('roiOn').checked = !!sc.roiOn; if (sc.roi) $('roiLbl').textContent = 'Analizar sólo ' + sc.roiName;
    $('brush').value = S.brush; $('oBrush').textContent = S.brush + ' px';
    $('tol').value = S.tol; $('oTol').textContent = S.tol;
    $('open').value = S.open; $('oOpen').textContent = S.open + ' px'; $('close').value = S.close; $('oClose').textContent = S.close + ' px';
    $('minArea').value = S.minArea; $('minAreaLbl').textContent = g > 0 ? 'Superficie mínima de un grupo (m²)' : 'Tamaño mínimo de un grupo (píxeles)';
    $('dLo').value = S.dens.lo; $('dMid').value = S.dens.mid; $('dHi').value = S.dens.hi;
    $('gamma').value = S.gamma; $('ovA').value = S.ovA; $('mode').value = S.mode;
    Array.prototype.forEach.call($('mode').options, function (o) { o.disabled = ((o.value === 'cir' || o.value === 'ndvi') && sc.map.nir < 0) || (o.value === 'elev' && !sc.elev) || ((o.value === 'slope' || o.value === 'shade') && !sc.terrain); });
    $('demBox').hidden = !sc.terrain; $('tSlope').value = S.terr.slope; $('oTSlope').textContent = S.terr.slope + '°'; $('tElev').value = S.terr.elev; $('oTElev').textContent = S.terr.elev + ' m';
    $('demNote').textContent = sc.terrain ? 'Relieve cargado: ' + sc.demName + (sc.demCell && sc.demCell > g * 3 ? '. Su celda de ' + nf0.format(sc.demCell) + ' m es más gruesa que la imagen: las pendientes salen suavizadas.' : '.') + ' Disponible en «Vista» como elevación, pendiente y sombreado.'
      : (sc.elev ? 'Hay relieve, pero falta la escala de la imagen para calcular pendientes.' : 'Un GeoTIFF de elevación (Copernicus DEM, REMA) sobre una imagen georreferenciada agrega cota, pendiente y orientación a cada grupo.');
    $('gsd').value = g > 0 ? +(g / S.down).toPrecision(4) : '';
    $('gsdNote').textContent = g > 0 ? 'Tamaño de píxel ' + (sc.gsdSource || 'ingresado') + '. Píxel de análisis: ' + fmtLen(g) + '.' : 'Sin escala no hay superficies en metros. Ingresar el tamaño de píxel o medir una distancia conocida con «Medir».';
    $('indDiam').value = S.ind.diam; $('oDiam').textContent = nf2.format(S.ind.diam) + ' m'; $('indK').value = S.ind.k; $('oK').textContent = nf1.format(S.ind.k);
    var can = g > 0 && g <= 0.15;
    $('indOn').disabled = !can; if (!can) { S.ind.on = false; $('indOn').checked = false; }
    $('indBox').hidden = !S.ind.on;
    $('indNote').textContent = can ? 'Cuenta aves presentes, no nidos: incluye pichones y adultos que no crían, y puede tomar piedras o sombras por aves.'
      : (g > 0 ? 'No disponible: con píxeles de ' + fmtLen(g) + ' un pingüino no llega a ocupar un píxel. Hace falta una imagen de dron o aérea de hasta 15 cm por píxel.' : 'Disponible sólo con escala conocida y píxeles de hasta 15 cm.');
    renderChips();
    setMethod(S.method, true);
    $('toolPan').setAttribute('aria-pressed', String(S.tool === 'pan')); $('toolSample').setAttribute('aria-pressed', String(S.tool === 'sample')); $('toolMeasure').setAttribute('aria-pressed', String(S.tool === 'measure'));
    cv.className = S.tool === 'pan' ? '' : S.tool;
  }
  function fmtLen(m) { return m < 1 ? nf1.format(m * 100) + ' cm' : nf2.format(m) + ' m'; }
  function renderChips() {
    var box = $('chips'), counts = {};
    S.samples.forEach(function (s) { counts[s.cls] = (counts[s.cls] || 0) + 1; });
    box.innerHTML = '';
    CLASSES.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(S.cls === c.id));
      var dot = document.createElement('i'); dot.style.background = c.color; b.appendChild(dot);
      b.appendChild(document.createTextNode(c.label));
      var n = document.createElement('b'); n.textContent = counts[c.id] || 0; b.appendChild(n);
      b.addEventListener('click', function () { S.cls = c.id; setTool('sample'); renderChips(); document.dispatchEvent(new CustomEvent('pc:result')); });
      box.appendChild(b);
    });
  }
  function setMethod(m, quiet) {
    S.method = m;
    $('mRule').setAttribute('aria-selected', String(m === 'rule')); $('mML').setAttribute('aria-selected', String(m === 'ml'));
    $('ruleBox').hidden = m !== 'rule'; $('mlBox').hidden = m !== 'ml';
    if (!quiet) { setTool(m === 'ml' ? 'sample' : 'pan'); schedule(0); }
  }
  function setTool(t) {
    S.tool = t;
    $('toolPan').setAttribute('aria-pressed', String(t === 'pan')); $('toolSample').setAttribute('aria-pressed', String(t === 'sample')); $('toolMeasure').setAttribute('aria-pressed', String(t === 'measure'));
    cv.className = t === 'pan' ? '' : t;
    if (t === 'sample' && S.method !== 'ml') setMethod('ml');
    if (t !== 'measure' && S.measure.length < 2) { S.measure = []; $('measureBox').hidden = true; }
    draw();
  }

  /* ---------- procesamiento ---------- */
  var runT = 0;
  function schedule(ms) { clearTimeout(runT); runT = setTimeout(run, ms === undefined ? 90 : ms); document.dispatchEvent(new CustomEvent('pc:run')); }
  function run() {
    var sc = S.scene; if (!sc) return;
    var heavy = S.method === 'ml' || S.ind.on;
    if (heavy) busy('Clasificando…');
    later(function () {
      var raw, warn = '';
      if (S.method === 'rule') {
        raw = PE.classifyRule(sc, S.rule);
        if (sc.map.r === sc.map.b) warn = 'La imagen tiene una sola banda visible: la regla espectral necesita color. Usar el método con muestras.';
      } else {
        // cada ejemplo de «no es guano» es una clase propia: nieve, roca y agua no se parecen entre sí
        var tr = S.samples.map(function (q, k) { return q.cls === 'guano' ? q : { cls: 'no' + k, x: q.x, y: q.y, r: q.r }; });
        var gm = sc.map.nir >= 0 || sc.map.swir >= 0 ? PE.groundMask(sc, S.rule) : null;
        if (gm) { // clase implícita «suelo común»: así el primer toque ya distingue la mancha del terreno que la rodea
          var bb = sc.roi && sc.roiOn && sc.roiBox ? sc.roiBox : [0, 0, sc.w, sc.h], st = Math.max(1, Math.round(Math.sqrt((bb[2] - bb[0]) * (bb[3] - bb[1]) / 1500)));
          for (var gy = bb[1]; gy < bb[3]; gy += st) for (var gx = bb[0]; gx < bb[2]; gx += st) {
            if (!gm[gy * sc.w + gx]) continue;
            var near = false; for (var k2 = 0; k2 < S.samples.length; k2++) { var q2 = S.samples[k2]; if (Math.abs(q2.x - gx) <= q2.r + 2 && Math.abs(q2.y - gy) <= q2.r + 2) { near = true; break; } }
            if (!near) tr.push({ cls: 'suelo', x: gx, y: gy, r: 0 });
          }
        }
        var model = PE.trainML(sc, tr);
        if (!model.cls.some(function (c) { return c.id === 'guano'; })) { raw = new Uint8Array(sc.w * sc.h); warn = 'Falta marcar guano: elegir «Esto es guano» y tocar una mancha en la imagen.'; }
        else {
          raw = PE.classifyML(sc, model, S.tol, 'guano');
          if (gm) for (var u = 0; u < raw.length; u++) if (raw[u] && !gm[u]) raw[u] = 0; // un toque nunca pinta mar, nieve ni vegetación
          if (!S.samples.some(function (q) { return q.cls !== 'guano'; })) warn = 'Sólo marcaste guano. Si se pintó de más, elegir «Esto no es guano» y tocar esas partes.';
        }
      }
      if (sc.roi && sc.roiOn) { for (var z = 0; z < raw.length; z++) if (raw[z] && !sc.roi[z]) raw[z] = 0; }
      if (S.terr.on && sc.terrain) { var SL = sc.terrain.slope, EL = sc.elev; for (var q = 0; q < raw.length; q++) if (raw[q] && (SL[q] > S.terr.slope || EL[q] > S.terr.elev)) raw[q] = 0; }
      var m = PE.morph(raw, sc.w, sc.h, S.open, S.close);
      var minPx = sc.pxArea > 0 ? Math.max(1, Math.ceil(S.minArea / sc.pxArea)) : Math.max(1, Math.round(S.minArea));
      S.res = PE.components(m, sc.w, sc.h, minPx);
      if (sc._sea === undefined) { var wm = sc.pxArea > 0 ? PE.waterMask(sc) : null; sc._sea = wm ? PE.distanceTo(wm, sc.w, sc.h) : null; }
      PE.zonal(sc, S.res, sc._sea); PE.nearest(S.res.comps, PE.gsd(sc));
      S.blobs = null;
      if (S.ind.on && sc.pxArea > 0) {
        var g = PE.gsd(sc), within = null;
        if (S.ind.guano) within = PE.dilate(S.res.mask, sc.w, sc.h, Math.max(1, Math.round(1 / g)));
        S.blobs = PE.detectBlobs(sc, { diamPx: S.ind.diam / g, k: S.ind.k, within: within });
      }
      if (window.PCX && window.PCX.nests) { var nb = window.PCX.nests(sc); if (nb) S.blobs = nb; }
      if (S.sel > S.res.comps.length) S.sel = 0;
      paintOverlay(); updateResults(warn); draw(); busy(null);
      document.dispatchEvent(new CustomEvent('pc:result', { detail: { run: true } }));
    });
  }
  function renderBase() {
    var sc = S.scene, g = base.getContext('2d'), id = g.createImageData(sc.w, sc.h);
    if (S.mode === 'cls' && window.PCX && window.PCX.classImage) window.PCX.classImage(sc, id.data); else PE.renderBase(sc, S.mode, S.gamma, id.data);
    g.putImageData(id, 0, 0);
  }
  function paintOverlay() {
    var sc = S.scene, w = sc.w, h = sc.h, N = w * h, L = S.res.labels;
    var gf = fill.getContext('2d'), ge = edge.getContext('2d'), f = gf.createImageData(w, h), e = ge.createImageData(w, h), fd = f.data, ed = e.data;
    for (var i = 0; i < N; i++) {
      var l = L[i]; if (!l) continue;
      var j = i * 4, sel = l === S.sel;
      fd[j] = sel ? 255 : 25; fd[j + 1] = sel ? 221 : 227; fd[j + 2] = sel ? 51 : 255; fd[j + 3] = 255;
      var x = i % w, y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || L[i - 1] !== l || L[i + 1] !== l || L[i - w] !== l || L[i + w] !== l) {
        ed[j] = sel ? 255 : 210; ed[j + 1] = sel ? 240 : 250; ed[j + 2] = sel ? 120 : 255; ed[j + 3] = 255;
      }
    }
    gf.putImageData(f, 0, 0); ge.putImageData(e, 0, 0);
  }

  /* ---------- resultados ---------- */
  function lonlat(px, py) { var g = S.scene.geo; if (!g) return null; var c = PE.pxToCRS(g, px, py); return PE.toLonLat(g, c[0], c[1]); }
  function fmtLL(ll) {
    function dm(v, pos, neg) { var a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60; return d + '°' + (m < 10 ? '0' : '') + m.toFixed(3) + '′ ' + (v < 0 ? neg : pos); }
    return dm(ll[1], 'N', 'S') + ' ' + dm(ll[0], 'E', 'O');
  }
  function totals() {
    var sc = S.scene, px = 0; S.res.comps.forEach(function (c) { px += c.area; });
    return { px: px, m2: px * sc.pxArea };
  }
  function updateResults(warn) {
    if (warn === undefined) warn = S.warn; else S.warn = warn;
    var sc = S.scene, g = PE.gsd(sc), t = totals(), comps = S.res.comps, ap = $('aptitude');
    var cls = 'mid', txt;
    if (!g) { txt = 'Sin escala: las superficies quedan en píxeles y no hay estimación de parejas.'; }
    else if (g <= 0.15) { cls = 'ok'; txt = 'Píxel de ' + fmtLen(g) + ': se distinguen aves. Sirve para delinear grupos y contar individuos.'; }
    else if (g <= 0.8) { cls = 'ok'; txt = 'Píxel de ' + fmtLen(g) + ': muy alta resolución. Se delinean los grupos reproductivos; las aves no se resuelven.'; }
    else if (g <= 5) { txt = 'Píxel de ' + fmtLen(g) + ': se ve la colonia, pero los grupos chicos se funden o se pierden.'; }
    else if (g <= 15) { txt = 'Píxel de ' + fmtLen(g) + ': resolución media. Sólo aparecen manchas de varias decenas de metros; la superficie sale sobreestimada por mezcla de píxeles.'; }
    else { cls = 'bad'; txt = 'Píxel de ' + fmtLen(g) + ': resolución gruesa. Indica presencia de colonias grandes, no su tamaño.'; }
    ap.className = 'pill ' + cls; ap.textContent = txt;

    $('kArea').textContent = g ? nf0.format(t.m2) + ' m²' : nf0.format(t.px) + ' px';
    var tru = 0, hasT = comps.some(function (c) { return c.slope !== undefined; }), hasSea = comps.some(function (c) { return c.sea !== undefined; });
    comps.forEach(function (c) { tru += (c.trueArea || c.area) * sc.pxArea; });
    $('kAreaSub').textContent = g ? nf2.format(t.m2 / 10000) + ' ha' + (hasT ? ' · ' + nf0.format(tru) + ' m² sobre la pendiente' : '') : '';
    $('kGroups').textContent = nf0.format(comps.length);
    $('kGroupsSub').textContent = comps.length ? 'el mayor: ' + (g ? nf0.format(comps[0].area * sc.pxArea) + ' m²' : nf0.format(comps[0].area) + ' px') : '';
    if (g) {
      $('kPairs').textContent = nf0.format(t.m2 * S.dens.mid);
      $('kPairsSub').textContent = S.dens.lo !== S.dens.hi ? 'entre ' + nf0.format(t.m2 * S.dens.lo) + ' y ' + nf0.format(t.m2 * S.dens.hi) + ' · ' + nf2.format(S.dens.mid) + ' parejas/m²' : nf3.format(S.dens.mid) + ' parejas/m² (calibrada)';
    } else { $('kPairs').textContent = '—'; $('kPairsSub').textContent = 'falta la escala de la imagen'; }
    $('kIndWrap').hidden = !S.blobs; $('exInd').hidden = !S.blobs;
    if (S.blobs) { $('kInd').textContent = nf0.format(S.blobs.length); $('kIndSub').textContent = t.m2 > 0 ? nf2.format(S.blobs.length / t.m2) + ' aves/m² de guano' : ''; }

    var tr = $('truth');
    if (sc.truth) {
      var inter = 0, uni = 0, T = sc.truth.mask, M = S.res.mask;
      for (var i = 0; i < T.length; i++) { if (T[i] && M[i]) inter++; if (T[i] || M[i]) uni++; }
      var s = 'Verdad de la escena sintética: ' + nf0.format(sc.truth.areaM2) + ' m² de guano fresco en ' + sc.truth.groups + ' grupos. Coincidencia con la detección: ' + nf0.format(uni ? 100 * inter / uni : 0) + ' %.';
      if (S.blobs && sc.truth.individuals) s += ' Aves dibujadas: ' + sc.truth.individuals + '.';
      tr.textContent = s; tr.hidden = false;
    } else tr.hidden = true;
    var w = $('warn'); w.textContent = warn || ''; w.hidden = !warn;
    $('relNote').textContent = S.method === 'rule' && S.rule.rel && sc.thrUsed ? 'En esta escena equivale a enrojecimiento ≥ ' + nf3.format(sc.thrUsed.ri) + ' y tinte rosado ≥ ' + nf3.format(sc.thrUsed.ax) + '.' : '';

    var tb = $('tbl').tBodies[0]; tb.innerHTML = '';
    var hr = $('tbl').tHead.rows[0]; hr.innerHTML = '';
    ['N.º', 'Superficie', 'Parejas'].concat(hasT ? ['Cota', 'Pend.', 'Mira al'] : [], hasSea ? ['Al mar'] : [], comps.length > 1 && g ? ['Vecino'] : [], [sc.geo && lonlat(0, 0) ? 'Centro (lat, lon)' : 'Centro (px)']).forEach(function (h) { var th = document.createElement('th'); th.textContent = h; hr.appendChild(th); });
    comps.slice(0, 60).forEach(function (c) {
      var row = tb.insertRow(); if (c.id === S.sel) row.className = 'sel';
      var ll = lonlat(c.cx, c.cy);
      [String(c.id), g ? nf0.format(c.area * sc.pxArea) + ' m²' : nf0.format(c.area) + ' px', g ? nf0.format(c.area * sc.pxArea * S.dens.mid) : '—'].concat(
        hasT ? [c.elev !== undefined ? nf0.format(c.elev) + ' m' : '—', c.slope !== undefined ? nf0.format(c.slope) + '°' : '—', c.aspect !== undefined ? PE.compass(c.aspect) : '—'] : [],
        hasSea ? [c.sea !== undefined ? nf0.format(c.sea) + ' m' : '—'] : [], comps.length > 1 && g ? [c.nn !== undefined ? nf0.format(c.nn) + ' m' : '—'] : [],
        [ll ? ll[1].toFixed(5) + ', ' + ll[0].toFixed(5) : Math.round(c.cx) + ', ' + Math.round(c.cy)]).forEach(function (v) { row.insertCell().textContent = v; });
      row.addEventListener('click', function () { selectComp(c.id, true); });
    });
    $('tblNote').textContent = comps.length > 60 ? 'Se muestran los 60 grupos mayores de ' + comps.length + '. La exportación los incluye todos.' : (comps.length ? 'Tocar una fila para ir al grupo.' : 'Todavía no hay grupos detectados.');
  }
  function selectComp(id, zoom) {
    S.sel = S.sel === id && !zoom ? 0 : id;
    paintOverlay();
    Array.prototype.forEach.call($('tbl').tBodies[0].rows, function (r) { r.className = +r.cells[0].textContent === S.sel ? 'sel' : ''; });
    if (zoom && S.sel) {
      var c = S.res.comps[S.sel - 1], r = cv.getBoundingClientRect(), bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
      var k = Math.min(r.width / (bw * 3), r.height / (bh * 3), 12);
      S.view.k = Math.max(k, minK()); S.view.x = r.width / 2 - c.cx * S.view.k; S.view.y = r.height / 2 - c.cy * S.view.k;
    }
    draw();
  }

  /* ---------- visor ---------- */
  function minK() { var r = cv.getBoundingClientRect(), sc = S.scene; return Math.min(r.width / sc.w, r.height / sc.h) * (sc.geo ? 0.003 : 0.5); } // con georreferencia se puede alejar hasta ver el entorno sobre la base
  function fitView(zone) {
    var r = cv.getBoundingClientRect(), sc = S.scene; if (!sc || !r.width) return;
    var bx = [0, 0, sc.w, sc.h];
    if (zone === true && sc.roi && sc.roiOn && sc.roiBox) { // encuadra la zona analizada con aire alrededor
      var b = sc.roiBox, mx = (b[2] - b[0]) * 0.45, my = (b[3] - b[1]) * 0.45;
      bx = [Math.max(0, b[0] - mx), Math.max(0, b[1] - my), Math.min(sc.w, b[2] + mx), Math.min(sc.h, b[3] + my)];
    }
    var k = Math.min(r.width / (bx[2] - bx[0]), r.height / (bx[3] - bx[1]));
    S.view = { k: k, x: (r.width - (bx[0] + bx[2]) * k) / 2, y: (r.height - (bx[1] + bx[3]) * k) / 2 };
    draw();
  }
  function zoomAt(f, sx, sy) {
    var v = S.view, k = Math.max(minK(), Math.min(60, v.k * f));
    v.x = sx - (sx - v.x) * (k / v.k); v.y = sy - (sy - v.y) * (k / v.k); v.k = k; draw();
  }
  function toImg(sx, sy) { return [(sx - S.view.x) / S.view.k, (sy - S.view.y) / S.view.k]; }
  var drawQ = false;
  function draw() { if (drawQ) return; drawQ = true; requestAnimationFrame(function () { drawQ = false; paint(); }); }
  function paint() {
    var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    var sc = S.scene; if (!sc) return;
    var v = S.view;
    ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.x, dpr * v.y);
    if (window.PCX) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); window.PCX.under(ctx, r); ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.x, dpr * v.y); }
    ctx.imageSmoothingEnabled = v.k < 3;
    ctx.globalAlpha = S.imgA === undefined ? 1 : S.imgA; ctx.drawImage(base, 0, 0); ctx.globalAlpha = 1;
    if (S.ovOn && S.res) { ctx.globalAlpha = S.ovStyle === 'edge' ? 0 : S.ovA; ctx.drawImage(fill, 0, 0); ctx.globalAlpha = Math.min(1, S.ovA + 0.45); ctx.drawImage(edge, 0, 0); ctx.globalAlpha = 1; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    function P(x, y) { return [x * v.k + v.x, y * v.k + v.y]; }
    if (S.ovOn && S.res) {
      ctx.font = '500 11px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      S.res.comps.forEach(function (c) {
        if ((c.x1 - c.x0) * v.k < 22 && c.id !== S.sel) return;
        var p = P(c.cx, c.cy); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,13,16,.85)'; ctx.strokeText(c.id, p[0], p[1]); ctx.fillStyle = c.id === S.sel ? '#ffe45c' : '#fff'; ctx.fillText(c.id, p[0], p[1]);
      });
    }
    if (S.blobs && S.ovOn) {
      var rad = Math.max(2.5, (S.ind.diam / PE.gsd(sc)) * v.k * 0.6);
      ctx.strokeStyle = '#ffe45c'; ctx.lineWidth = 1.25;
      S.blobs.forEach(function (b) { var p = P(b.x, b.y); if (p[0] < -9 || p[1] < -9 || p[0] > r.width + 9 || p[1] > r.height + 9) return; ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 6.2832); ctx.stroke(); });
    }
    if (S.method === 'ml') S.samples.forEach(function (s) {
      var p = P(s.x + 0.5, s.y + 0.5), c = CLASSES.filter(function (k) { return k.id === s.cls; })[0];
      ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(3, (s.r + 0.5) * v.k), 0, 6.2832); ctx.fillStyle = c.color + '55'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = c.color; ctx.stroke();
      ctx.lineWidth = 0.75; ctx.strokeStyle = '#000'; ctx.stroke();
    });
    if (sc.roi && sc.roiOn && sc.roiBox) { var ra = P(sc.roiBox[0], sc.roiBox[1]), rb2 = P(sc.roiBox[2], sc.roiBox[3]); ctx.setLineDash([6, 4]); ctx.strokeStyle = '#ffe45c'; ctx.lineWidth = 1.25; ctx.strokeRect(ra[0], ra[1], rb2[0] - ra[0], rb2[1] - ra[1]); ctx.setLineDash([]); }
    if (window.PCX) window.PCX.over(ctx, P);
    if (S.measure.length) {
      ctx.strokeStyle = '#ffe45c'; ctx.fillStyle = '#ffe45c'; ctx.lineWidth = 2; ctx.beginPath();
      S.measure.forEach(function (m, i) { var p = P(m[0], m[1]); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.stroke();
      S.measure.forEach(function (m) { var p = P(m[0], m[1]); ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 6.2832); ctx.fill(); });
    }
    scaleBar();
  }
  function scaleBar() {
    var g = PE.gsd(S.scene), el = $('scalebar');
    if (!g) { el.hidden = true; return; }
    var mPerCss = g / S.view.k, target = mPerCss * 110, p = Math.pow(10, Math.floor(Math.log10(target))), n = target / p, nice = (n >= 5 ? 5 : n >= 2 ? 2 : 1) * p;
    $('scaleLine').style.width = (nice / mPerCss) + 'px'; $('scaleTxt').textContent = nice >= 1 ? nf0.format(nice) + ' m' : nf0.format(nice * 100) + ' cm';
    el.hidden = false;
  }

  /* ---------- interacción ---------- */
  var ptrs = new Map(), drag = null, pinch = null;
  function local(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function addSample(ix, iy) {
    var sc = S.scene; if (ix < 0 || iy < 0 || ix >= sc.w || iy >= sc.h) return;
    S.samples.push({ cls: S.cls, x: Math.floor(ix), y: Math.floor(iy), r: S.brush }); renderChips(); draw(); schedule(350);
  }
  cv.addEventListener('pointerdown', function (e) {
    if (!S.scene) return;
    cv.setPointerCapture(e.pointerId); var p = local(e); ptrs.set(e.pointerId, p);
    if (ptrs.size === 2) { var a = Array.from(ptrs.values()); pinch = { d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) }; drag = null; return; }
    var im = toImg(p[0], p[1]);
    if (window.PCX && window.PCX.down(p, im)) { drag = { ext: true }; return; }
    drag = { sx: p[0], sy: p[1], vx: S.view.x, vy: S.view.y, moved: false, pan: true, last: im };
  });
  cv.addEventListener('pointermove', function (e) {
    if (!S.scene) return;
    var p = local(e);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
    if (pinch && ptrs.size === 2) {
      var a = Array.from(ptrs.values()), d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
      if (pinch.d > 0) zoomAt(d / pinch.d, (a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2);
      pinch.d = d; return;
    }
    if (drag && drag.ext) { window.PCX.move(p, toImg(p[0], p[1])); return; }
    if (drag) {
      if (Math.hypot(p[0] - drag.sx, p[1] - drag.sy) > 4) drag.moved = true;
      if (drag.pan) { S.view.x = drag.vx + p[0] - drag.sx; S.view.y = drag.vy + p[1] - drag.sy; draw(); }
    } else readout(p);
  });
  function endPtr(e) {
    var p = local(e), d = drag; ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
    if (!d || !S.scene) { drag = null; return; }
    drag = null;
    if (d.ext) { window.PCX.up(); return; }
    if (d.moved) return;
    var im = toImg(p[0], p[1]), sc = S.scene, inside = im[0] >= 0 && im[1] >= 0 && im[0] < sc.w && im[1] < sc.h;
    if (S.tool === 'measure' && inside) {
      if (S.measure.length >= 2) S.measure = [];
      S.measure.push(im);
      if (S.measure.length === 2) {
        var px = Math.hypot(S.measure[0][0] - S.measure[1][0], S.measure[0][1] - S.measure[1][1]);
        $('measureTxt').textContent = 'Distancia marcada: ' + nf1.format(px * S.down) + ' píxeles de la imagen original. Escribir cuánto mide en el terreno.';
        $('measureBox').hidden = false; $('measureM').focus();
      } else { $('measureTxt').textContent = 'Marcar el segundo punto.'; $('measureBox').hidden = false; }
      draw();
    } else if (inside && window.PCX && window.PCX.tap && window.PCX.tap(im)) {
      /* nido agregado o quitado a mano */
    } else if (S.method === 'ml' && inside) {
      addSample(im[0], im[1]);
    } else if (inside && S.res) {
      selectComp(S.res.labels[Math.floor(im[1]) * sc.w + Math.floor(im[0])] || 0, false);
    }
  }
  cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('wheel', function (e) { if (!S.scene) return; e.preventDefault(); var p = local(e); zoomAt(Math.exp(-e.deltaY * 0.0016), p[0], p[1]); }, { passive: false });
  cv.addEventListener('keydown', function (e) {
    if (!S.scene) return; var r = cv.getBoundingClientRect(), st = 60, hit = true;
    if (e.key === 'ArrowLeft') S.view.x += st; else if (e.key === 'ArrowRight') S.view.x -= st; else if (e.key === 'ArrowUp') S.view.y += st; else if (e.key === 'ArrowDown') S.view.y -= st;
    else if (e.key === '+' || e.key === '=') zoomAt(1.3, r.width / 2, r.height / 2); else if (e.key === '-') zoomAt(1 / 1.3, r.width / 2, r.height / 2); else if (e.key === '0') fitView(false); else hit = false;
    if (hit) { e.preventDefault(); draw(); }
  });
  function readout(p) {
    var sc = S.scene, im = toImg(p[0], p[1]), x = Math.floor(im[0]), y = Math.floor(im[1]);
    if (x < 0 || y < 0 || x >= sc.w || y >= sc.h) return;
    var i = y * sc.w + x, o = PE.indicesAt(sc, i), ll = lonlat(im[0], im[1]), parts = [];
    parts.push(ll ? fmtLL(ll) : 'píxel ' + x + ', ' + y);
    parts.push('R ' + nf3.format(o.r) + ' V ' + nf3.format(o.g) + ' A ' + nf3.format(o.b) + (o.nir !== undefined ? ' IR ' + nf3.format(o.nir) : ''));
    parts.push('enrojecimiento ' + nf3.format(o.RI) + ' · tinte rosado ' + nf3.format(o.AX) + (o.NDVI !== undefined ? ' · NDVI ' + nf2.format(o.NDVI) : '') + (o.NDSI !== undefined ? ' · NDSI ' + nf2.format(o.NDSI) : ''));
    var l = S.res ? S.res.labels[i] : 0; if (l) parts.push('grupo ' + l);
    $('readout').textContent = parts.join('  |  ');
  }

  /* ---------- controles ---------- */
  function onNum(id, fn) { $(id).addEventListener('input', function () { var v = parseFloat(String(this.value).replace(',', '.')); if (isFinite(v)) fn(v); }); }
  [['pRi', 'ri'], ['pAx', 'ax'], ['pLmin', 'lmin'], ['pLmax', 'lmax'], ['pNdvi', 'ndvi'], ['pNdwi', 'ndwi'], ['pNdsi', 'ndsi']].forEach(function (d) {
    onNum(d[0], function (v) { S.rule[d[1]] = v; $('o' + d[0].slice(1)).textContent = nf3.format(v); schedule(); });
  });
  $('pRel').addEventListener('change', function () { S.rule.rel = this.checked; syncControls(); schedule(0); });
  onNum('pKri', function (v) { S.rule.kri = v; $('oKri').textContent = nf1.format(v); schedule(); });
  onNum('pKax', function (v) { S.rule.kax = v; $('oKax').textContent = nf1.format(v); schedule(); });
  $('roiOn').addEventListener('change', function () { if (S.scene) { S.scene.roiOn = this.checked; schedule(0); } });
  $('ruleReset').addEventListener('click', function () { S.rule = S.scene && S.scene.rule ? Object.assign(PE.defaultRule(), S.scene.rule) : PE.defaultRule(); syncControls(); schedule(0); });
  onNum('brush', function (v) { S.brush = v; $('oBrush').textContent = v + ' px'; });
  onNum('tol', function (v) { S.tol = v; $('oTol').textContent = v; schedule(250); });
  onNum('open', function (v) { S.open = v; $('oOpen').textContent = v + ' px'; schedule(); });
  onNum('close', function (v) { S.close = v; $('oClose').textContent = v + ' px'; schedule(); });
  onNum('minArea', function (v) { S.minArea = Math.max(0, v); schedule(200); });
  onNum('gamma', function (v) { S.gamma = v; if (S.scene) { renderBase(); draw(); } });
  onNum('ovA', function (v) { S.ovA = v; draw(); });
  $('ovOn').addEventListener('change', function () { S.ovOn = this.checked; draw(); });
  $('mode').addEventListener('change', function () { S.mode = this.value; renderBase(); draw(); });
  $('mRule').addEventListener('click', function () { setMethod('rule'); }); $('mML').addEventListener('click', function () { setMethod('ml'); });
  $('toolPan').addEventListener('click', function () { setTool('pan'); }); $('toolSample').addEventListener('click', function () { setTool('sample'); });
  $('toolMeasure').addEventListener('click', function () { setTool(S.tool === 'measure' ? 'pan' : 'measure'); if (S.tool === 'measure') { S.measure = []; $('measureTxt').textContent = 'Marcar en la imagen los dos extremos de una distancia conocida, por ejemplo la barra de escala de la captura.'; $('measureBox').hidden = false; } });
  $('undoSample').addEventListener('click', function () { S.samples.pop(); renderChips(); schedule(0); });
  $('clearSamples').addEventListener('click', function () { S.samples = []; renderChips(); schedule(0); });
  $('zIn').addEventListener('click', function () { var r = cv.getBoundingClientRect(); zoomAt(1.4, r.width / 2, r.height / 2); });
  $('zOut').addEventListener('click', function () { var r = cv.getBoundingClientRect(); zoomAt(1 / 1.4, r.width / 2, r.height / 2); });
  $('zFit').addEventListener('click', function () { fitView(false); });
  $('zZone').addEventListener('click', function () { fitView(true); });

  function mapChanged() { var sc = S.scene; sc._sea = undefined; PE.prepare(sc); if ((S.mode === 'cir' || S.mode === 'ndvi') && sc.map.nir < 0) S.mode = 'rgb'; syncControls(); renderBase(); schedule(0); }
  $('preset').addEventListener('change', function () {
    var sc = S.scene, p = PRESETS[this.value]; if (!sc || !p) return;
    var m = Object.assign({}, p);
    ['r', 'g', 'b'].forEach(function (k) { if (m[k] >= sc.n) m[k] = Math.min(sc.n - 1, { r: 0, g: 1, b: 2 }[k]); });
    if (m.nir >= sc.n) m.nir = -1; if (m.swir >= sc.n) m.swir = -1;
    sc.map = m; buildBandSelects(); mapChanged();
  });
  [['bR', 'r'], ['bG', 'g'], ['bB', 'b'], ['bN', 'nir'], ['bS', 'swir']].forEach(function (d) {
    $(d[0]).addEventListener('change', function () { S.scene.map[d[1]] = parseInt(this.value, 10); $('preset').value = 'custom'; mapChanged(); });
  });
  function setGsd(gOrig, source) {
    var sc = S.scene; if (!sc) return;
    var g = gOrig * S.down; sc.pxArea = g > 0 ? g * g : 0; sc.gsdSource = source; computeTerrain(); syncControls(); schedule(0);
  }
  $('gsd').addEventListener('change', function () { var v = parseFloat(String(this.value).replace(',', '.')); setGsd(isFinite(v) && v > 0 ? v : 0, 'ingresado a mano'); });
  $('measureApply').addEventListener('click', function () {
    var m = parseFloat(String($('measureM').value).replace(',', '.'));
    if (S.measure.length < 2 || !(m > 0)) { toast('Marcar dos puntos en la imagen y escribir la distancia real en metros.'); return; }
    var px = Math.hypot(S.measure[0][0] - S.measure[1][0], S.measure[0][1] - S.measure[1][1]);
    if (px < 2) { toast('Los dos puntos están demasiado cerca.'); return; }
    setGsd(m / px / S.down, 'medido en la imagen'); S.measure = []; $('measureBox').hidden = true; setTool('pan');
  });

  $('species').addEventListener('change', function () { if (this.value === 'adelia') { S.dens = { lo: 0.33, mid: 0.63, hi: 0.93 }; syncControls(); updateResults(); } });
  [['dLo', 'lo'], ['dMid', 'mid'], ['dHi', 'hi']].forEach(function (d) { onNum(d[0], function (v) { S.dens[d[1]] = Math.max(0, v); $('species').value = 'custom'; if (S.res) updateResults(); }); });
  $('calib').addEventListener('click', function () {
    var n = parseFloat($('known').value), t = S.res ? totals() : { m2: 0 };
    if (!(n > 0)) { toast('Escribir cuántas parejas se contaron en terreno.'); return; }
    if (!(t.m2 > 0)) { toast('Hace falta una superficie detectada en metros cuadrados: revisar la escala y la detección.'); return; }
    var d = +(n / t.m2).toPrecision(3); S.dens = { lo: d, mid: d, hi: d }; $('species').value = 'custom'; syncControls(); updateResults();
    toast('Densidad calibrada: ' + nf3.format(d) + ' parejas por m². Vale para esta imagen y esta fecha.');
  });
  $('indOn').addEventListener('change', function () { S.ind.on = this.checked; $('indBox').hidden = !S.ind.on; schedule(0); });
  onNum('indDiam', function (v) { S.ind.diam = v; $('oDiam').textContent = nf2.format(v) + ' m'; schedule(250); });
  onNum('indK', function (v) { S.ind.k = v; $('oK').textContent = nf1.format(v); schedule(250); });
  $('indGuano').addEventListener('change', function () { S.ind.guano = this.checked; schedule(0); });

  $('file').addEventListener('change', function () { loadFile(this.files[0]); this.value = ''; });
  $('demFile').addEventListener('change', function () { loadDEM(this.files[0]); this.value = ''; });
  $('maxpx').addEventListener('change', function () { S.maxPx = parseFloat(this.value) * 1e6; toast('Se aplica a la próxima imagen que se cargue.'); });
  $('terrOn').addEventListener('change', function () { S.terr.on = this.checked; schedule(0); });
  onNum('tSlope', function (v) { S.terr.slope = v; $('oTSlope').textContent = v + '°'; if (S.terr.on) schedule(200); });
  onNum('tElev', function (v) { S.terr.elev = v; $('oTElev').textContent = v + ' m'; if (S.terr.on) schedule(200); });
  var vp = $('viewport'), dragN = 0;
  vp.addEventListener('dragenter', function (e) { e.preventDefault(); dragN++; $('drop').hidden = false; });
  vp.addEventListener('dragover', function (e) { e.preventDefault(); });
  vp.addEventListener('dragleave', function () { if (--dragN <= 0) { dragN = 0; $('drop').hidden = true; } });
  vp.addEventListener('drop', function (e) { e.preventDefault(); dragN = 0; $('drop').hidden = true; if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
  function demo(fn, label, arg) { busy(label); later(function () { var sc = fn(arg); sc.down = 1; sc.orig = [sc.w, sc.h]; sc.preset = sc.n === 4 ? 'custom' : 'rgb'; setScene(sc); busy(null); }); }
  $('demoSat').addEventListener('click', function () { demo(PE.demoSatellite, 'Generando la escena satelital…'); });
  $('demoDrone').addEventListener('click', function () { demo(PE.demoDrone, 'Generando la escena de dron…'); });
  $('demoSat2').addEventListener('click', function () { demo(PE.demoSatellite, 'Generando la temporada posterior…', 1); });

  /* ---------- exportación ---------- */
  function downloads() { return window.claude && window.claude.use ? window.claude.use('downloads').catch(function () { return null; }) : Promise.resolve(null); }
  function showCopy(name, text) {
    $('modalTitle').textContent = name; $('modalHint').textContent = 'Esta vista no permite guardar archivos. Copiar el contenido y pegarlo en un archivo con ese nombre.';
    $('modalText').value = text; $('modal').hidden = false; $('modalCopy').focus();
  }
  async function save(name, data) {
    if (window.PC_WEB && !(window.claude && window.claude.use)) { // sitio web: descarga directa del navegador
      var blob = data instanceof Blob ? data : new Blob([data], { type: /\.csv$/.test(name) ? 'text/csv' : /\.json$/.test(name) ? 'application/json' : 'application/octet-stream' });
      var a = document.createElement('a'), url = URL.createObjectURL(blob); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000); toast('Descargado: ' + name); return;
    }
    var dl = await downloads();
    if (!dl) { if (typeof data === 'string') showCopy(name, data); else toast('Esta vista no permite guardar imágenes. Abrir la página completa de la herramienta y volver a intentar.'); return; }
    try { await dl.save({ filename: name, data: data }); toast('Guardado: ' + name); }
    catch (e) { if (e && e.code === 'declined') return; if (typeof data === 'string') showCopy(name, data); else toast('No se pudo guardar el archivo.'); }
  }
  $('modalClose').addEventListener('click', function () { $('modal').hidden = true; });
  $('modalCopy').addEventListener('click', function () {
    var ta = $('modalText');
    navigator.clipboard.writeText(ta.value).then(function () { toast('Copiado.'); }, function () { ta.select(); toast('Seleccionado: copiar con el teclado.'); });
  });
  function stem() { return (S.scene.name || 'escena').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\.[a-z0-9]+$/i, '').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'escena'; }
  function need() { if (!S.scene || !S.res || !S.res.comps.length) { toast('Todavía no hay grupos detectados para exportar.'); return false; } return true; }
  $('exCsv').addEventListener('click', function () {
    if (!need()) return;
    var sc = S.scene, g = sc.geo, rows = ['grupo,area_px,area_m2,parejas_central,parejas_min,parejas_max,centro_x_px,centro_y_px,x_src,y_src,lon,lat,cota_m,pendiente_grados,orientacion_grados,area_sobre_pendiente_m2,distancia_mar_m,vecino_mas_cercano_m'];
    S.res.comps.forEach(function (c) {
      var a = c.area * sc.pxArea, xy = g ? PE.pxToCRS(g, c.cx, c.cy) : null, ll = lonlat(c.cx, c.cy);
      rows.push([c.id, c.area, a ? a.toFixed(2) : '', a ? (a * S.dens.mid).toFixed(0) : '', a ? (a * S.dens.lo).toFixed(0) : '', a ? (a * S.dens.hi).toFixed(0) : '',
        (c.cx * S.down).toFixed(1), (c.cy * S.down).toFixed(1), xy ? xy[0].toFixed(4) : '', xy ? xy[1].toFixed(4) : '', ll ? ll[0].toFixed(7) : '', ll ? ll[1].toFixed(7) : '',
        c.elev !== undefined ? c.elev.toFixed(1) : '', c.slope !== undefined ? c.slope.toFixed(1) : '', c.aspect !== undefined ? c.aspect.toFixed(0) : '', c.trueArea !== undefined && a ? (c.trueArea * sc.pxArea).toFixed(2) : '', c.sea !== undefined ? c.sea.toFixed(1) : '', c.nn !== undefined ? c.nn.toFixed(1) : ''].join(','));
    });
    save(stem() + '_grupos.csv', rows.join('\n') + '\n');
  });
  $('exGeo').addEventListener('click', function () {
    if (!need()) return;
    var sc = S.scene, g = sc.geo, kind = g ? (PE.toLonLat(g, g.ox, g.oy) ? 'll' : 'crs') : 'px';
    function tr(p) {
      if (kind === 'px') return [+(p[0] * S.down).toFixed(2), +(-p[1] * S.down).toFixed(2)];
      var c = PE.pxToCRS(g, p[0], p[1]); if (kind === 'crs') return [+c[0].toFixed(3), +c[1].toFixed(3)];
      var ll = PE.toLonLat(g, c[0], c[1]); return [+ll[0].toFixed(7), +ll[1].toFixed(7)];
    }
    var feats = S.res.comps.map(function (c) {
      var polys = PE.polygonsOf(S.res.labels, sc.w, sc.h, c).map(function (poly) { return poly.map(function (ring) { var o = ring.map(tr); o.push(o[0]); return o; }); });
      var a = c.area * sc.pxArea;
      return { type: 'Feature', properties: { grupo: c.id, area_m2: a ? +a.toFixed(2) : null, parejas: a ? Math.round(a * S.dens.mid) : null, parejas_min: a ? Math.round(a * S.dens.lo) : null, parejas_max: a ? Math.round(a * S.dens.hi) : null },
        geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys } };
    });
    var fc = { type: 'FeatureCollection', name: stem() + '_guano', features: feats };
    if (kind === 'crs' && g.epsg) fc.crs = { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::' + g.epsg } };
    fc.metadatos = { metodo: S.method === 'rule' ? 'regla espectral' : 'máxima verosimilitud con muestras', densidad_parejas_m2: S.dens, pixel_analisis_m: PE.gsd(sc) || null,
      coordenadas: kind === 'll' ? 'longitud y latitud WGS 84' : kind === 'crs' ? 'sistema de la imagen' : 'píxeles de la imagen original, eje Y invertido', escena: sc.name, sintetica: !!sc.synthetic };
    save(stem() + '_guano.json', JSON.stringify(fc));
  });
  $('exInd').addEventListener('click', function () {
    if (!S.blobs || !S.blobs.length) { toast('No hay individuos contados.'); return; }
    var rows = ['id,x_px,y_px,lon,lat,contraste'];
    S.blobs.forEach(function (b, i) { var ll = lonlat(b.x, b.y); rows.push([i + 1, (b.x * S.down).toFixed(1), (b.y * S.down).toFixed(1), ll ? ll[0].toFixed(7) : '', ll ? ll[1].toFixed(7) : '', b.s.toFixed(1)].join(',')); });
    save(stem() + '_individuos.csv', rows.join('\n') + '\n');
  });
  $('exPng').addEventListener('click', function () {
    if (!S.scene) return;
    var sc = S.scene, c = document.createElement('canvas'); c.width = sc.w; c.height = sc.h; var g = c.getContext('2d');
    g.drawImage(base, 0, 0);
    if (S.res) { g.globalAlpha = S.ovA; g.drawImage(fill, 0, 0); g.globalAlpha = 1; g.drawImage(edge, 0, 0); }
    if (S.blobs) { g.strokeStyle = '#ffe45c'; g.lineWidth = 1; var rad = Math.max(2, S.ind.diam / PE.gsd(sc) * 0.6); S.blobs.forEach(function (b) { g.beginPath(); g.arc(b.x, b.y, rad, 0, 6.2832); g.stroke(); }); }
    c.toBlob(function (blob) { if (blob) save(stem() + '_deteccion.png', blob); else toast('No se pudo generar la imagen.'); }, 'image/png');
  });

  /* ---------- arranque ---------- */
  if (window.ResizeObserver) new ResizeObserver(function () { draw(); }).observe(vp);
  window.addEventListener('resize', draw);
  if (!window.PC_WEB) { demo(PE.demoSatellite, 'Generando la escena de ejemplo…'); setTimeout(function () { fitView(true); }, 400); }
  window.__app = { S: S, loadFile: loadFile, loadDEM: loadDEM, fitView: fitView };
  async function cutFull(win) { // recorte de la imagen original a resolución completa
    var sc = S.scene, src = sc && sc.src; if (!src) return;
    busy('Leyendo la zona a resolución completa…');
    try { var nsc = await loadTiff(src.file, { tiff: src.tiff, win: win }); nsc.parent = sc.parent || sc; nsc.name = sc.name; nsc.date = sc.date; setScene(nsc); }
    catch (e) { toast(e && e.message ? e.message : 'No se pudo leer el recorte.'); }
    busy(null);
  }
  window.PCApp = { renderBase: renderBase, loadFile: loadFile, S: S, draw: draw, schedule: schedule, selectComp: selectComp, lonlat: lonlat, layers: { base: base, fill: fill, edge: edge }, cutFull: cutFull, cv: cv, nf0: nf0, toast: toast, save: save, fmtLen: fmtLen, busy: busy, setScene: setScene, ensureGeoTIFF: ensureGeoTIFF, fitView: fitView,
    demo: function () { demo(PE.demoSatellite, 'Generando la escena de ejemplo…'); setTimeout(function () { fitView(true); }, 400); },
    current: function () { if (!S.scene || !S.res) return null; var t = totals(); return { scene: S.scene, res: S.res, px: t.px, m2: t.m2, dens: S.dens, method: S.method, gsd: PE.gsd(S.scene), samples: S.samples, cls: S.cls, blobs: S.blobs }; } };
})();
