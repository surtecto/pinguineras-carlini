/* Capa extra del visor: base satelital bajo la imagen, zona de análisis editable, fichas por grupo y ortomosaicos de dron. */
(function () {
  'use strict';
  var A = window.PCApp, PE = window.PE, $ = function (id) { return document.getElementById(id); };
  if (!A) return;
  var S = A.S, nf0 = A.nf0, nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
  var X = { base: true, edit: false, fresh: false, act: null, tiles: new Map() };
  var TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/', ZMAX = 13;

  /* ---------- base Esri reproyectada tesela por tesela ---------- */
  function ll(px, py) { var g = S.scene.geo; if (!g || !PE.crsKind(g.epsg)) return null; var c = PE.pxToCRS(g, px, py); return PE.toLonLat(g, c[0], c[1]); }
  function toPx(lon, lat) { var g = S.scene.geo, c = PE.fromLonLat(g, lon, lat); return [(c[0] - g.ox) / g.rx, (c[1] - g.oy) / g.ry]; }
  function tx(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
  function ty(lat, z) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z); }
  function lonOf(x, z) { return x / Math.pow(2, z) * 360 - 180; }
  function latOf(y, z) { var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }
  function tile(z, x, y) {
    var k = z + '/' + y + '/' + x, t = X.tiles.get(k);
    if (!t) { t = { img: new Image(), ok: false }; t.img.crossOrigin = 'anonymous'; t.img.onload = function () { t.ok = true; A.draw(); }; t.img.src = TILE + k; X.tiles.set(k, t); if (X.tiles.size > 400) X.tiles.delete(X.tiles.keys().next().value); }
    return t;
  }
  function under(ctx, r) {
    var sc = S.scene, on = X.base && sc && sc.geo && ll(0, 0);
    $('baseGroup').hidden = !(sc && sc.geo && ll(0, 0)); $('baseCredit').hidden = !on; $('gmaps').hidden = !(sc && sc.geo && ll(0, 0));
    if (!on) return;
    var v = S.view, cs = [[0, 0], [r.width, 0], [0, r.height], [r.width, r.height]].map(function (p) { return ll((p[0] - v.x) / v.k, (p[1] - v.y) / v.k); });
    var lat = cs[0][1], mpp = PE.gsd(sc) / v.k, z = Math.max(6, Math.min(ZMAX, Math.round(Math.log2(156543.03 * Math.cos(lat * Math.PI / 180) / mpp))));
    var xs = cs.map(function (c) { return tx(c[0], z); }), ys = cs.map(function (c) { return ty(c[1], z); });
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.floor(Math.max.apply(null, xs)), y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.floor(Math.max.apply(null, ys));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 60) return;
    function scr(xt, yt) { var p = toPx(lonOf(xt, z), latOf(yt, z)); return [p[0] * v.k + v.x, p[1] * v.k + v.y]; }
    ctx.save(); ctx.imageSmoothingEnabled = true;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var t = tile(z, x, y); if (!t.ok) continue;
      var a = scr(x, y), b = scr(x + 1, y), c = scr(x, y + 1), d = window.devicePixelRatio || 1;
      ctx.setTransform(d * (b[0] - a[0]) / 256, d * (b[1] - a[1]) / 256, d * (c[0] - a[0]) / 256, d * (c[1] - a[1]) / 256, d * a[0], d * a[1]);
      ctx.drawImage(t.img, 0, 0, 256.5, 256.5);
    }
    ctx.restore();
  }
  $('baseOn').addEventListener('change', function () { X.base = this.checked; A.draw(); });
  $('imgA').addEventListener('input', function () { S.imgA = +this.value; A.draw(); });
  $('ovStyle').addEventListener('change', function () { S.ovStyle = this.value; A.draw(); });
  $('gmaps').addEventListener('click', function () {
    var r = A.cv.getBoundingClientRect(), v = S.view, c = ll((r.width / 2 - v.x) / v.k, (r.height / 2 - v.y) / v.k); if (!c) return;
    this.href = 'https://www.google.com/maps/@' + c[1].toFixed(5) + ',' + c[0].toFixed(5) + ',' + Math.max(150, Math.round(PE.gsd(S.scene) / v.k * r.height * 1.2)) + 'm/data=!3m1!1e3';
  });

  /* ---------- zona de análisis editable ---------- */
  function setBox(b, final) {
    var sc = S.scene, x0 = Math.max(0, Math.min(sc.w - 1, Math.round(Math.min(b[0], b[2])))), x1 = Math.max(1, Math.min(sc.w, Math.round(Math.max(b[0], b[2])))),
      y0 = Math.max(0, Math.min(sc.h - 1, Math.round(Math.min(b[1], b[3])))), y1 = Math.max(1, Math.min(sc.h, Math.round(Math.max(b[1], b[3]))));
    if (!final) { sc.roiBox = b; if (!sc.roi) sc.roi = new Uint8Array(sc.w * sc.h).fill(1); sc.roiOn = true; A.draw(); return; }
    if (x1 - x0 < 4 || y1 - y0 < 4) { x1 = Math.min(sc.w, x0 + 4); y1 = Math.min(sc.h, y0 + 4); }
    var roi = new Uint8Array(sc.w * sc.h); for (var y = y0; y < y1; y++) roi.fill(1, y * sc.w + x0, y * sc.w + x1);
    sc.roi = roi; sc.roiBox = [x0, y0, x1, y1]; sc.roiOn = true; if (!sc.roiName) sc.roiName = 'la zona marcada';
    sync(); A.schedule(0); A.draw();
  }
  function sync() {
    var sc = S.scene; if (!sc) return;
    $('roiRow').hidden = !sc.roi; $('roiOn').checked = !!sc.roiOn; if (sc.roi) $('roiLbl').textContent = 'Analizar sólo ' + (sc.roiName || 'la zona marcada');
    $('roiEdit').setAttribute('aria-pressed', String(X.edit)); $('roiEdit').textContent = X.edit ? 'Listo' : (sc.roi ? 'Editar la zona' : 'Marcar una zona');
    $('roiReset').hidden = !sc.roiBox0; $('roiNew').hidden = !sc.roi;
    var red = sc.src && sc.down > 1.2 && sc.roi && sc.roiOn && sc.roiBox;
    $('cutFull').hidden = !red; $('cutBack').hidden = !sc.parent;
    if (red) { var b = sc.roiBox, px = (b[2] - b[0]) * (b[3] - b[1]) * sc.down * sc.down; $('cutFull').textContent = 'Ver la zona a resolución completa (' + nf1.format(px / 1e6) + ' MP' + (px > 9e6 ? ', se reduce a 9' : '') + ')'; }
  }
  function mode(edit, fresh) { X.edit = edit; X.fresh = !!fresh; sync(); A.draw(); document.dispatchEvent(new CustomEvent('pc:result')); }
  $('roiEdit').addEventListener('click', function () { var sc = S.scene; if (!sc) return; if (sc.roiBox && !sc.roiBox0) sc.roiBox0 = sc.roiBox.slice(); var was = X.edit; mode(!X.edit, !sc.roi); if (was && sc.roiBox) A.fitView(true); }); // al terminar, encuadra la zona entera
  $('roiNew').addEventListener('click', function () { var sc = S.scene; if (!sc) return; if (sc.roiBox && !sc.roiBox0) sc.roiBox0 = sc.roiBox.slice(); mode(true, true); });
  $('roiReset').addEventListener('click', function () { var sc = S.scene; if (sc && sc.roiBox0) { setBox(sc.roiBox0, true); mode(false); } });
  $('cutFull').addEventListener('click', function () {
    var sc = S.scene, b = sc.roiBox, w = sc.src.win, d = sc.down;
    A.cutFull([Math.round(w[0] + b[0] * d), Math.round(w[1] + b[1] * d), Math.round(w[0] + b[2] * d), Math.round(w[1] + b[3] * d)]);
  });
  $('cutBack').addEventListener('click', function () { if (S.scene.parent) A.setScene(S.scene.parent); });
  function hit(p) { // qué parte del recuadro quedó bajo el puntero
    var sc = S.scene, b = sc.roiBox, v = S.view; if (!b) return null;
    var l = b[0] * v.k + v.x, t = b[1] * v.k + v.y, r = b[2] * v.k + v.x, bt = b[3] * v.k + v.y, m = 11;
    if (p[0] < l - m || p[0] > r + m || p[1] < t - m || p[1] > bt + m) return null;
    var e = { l: Math.abs(p[0] - l) <= m, r: Math.abs(p[0] - r) <= m, t: Math.abs(p[1] - t) <= m, b: Math.abs(p[1] - bt) <= m };
    return e.l || e.r || e.t || e.b ? e : { move: true };
  }
  function down(p, im) {
    if (!X.edit || !S.scene) return false;
    var sc = S.scene, h = X.fresh || !sc.roiBox ? null : hit(p);
    if (X.fresh || !sc.roiBox) { X.act = { kind: 'new', ax: im[0], ay: im[1] }; return true; }
    if (!h) return false;
    X.act = h.move ? { kind: 'move', dx: im[0] - sc.roiBox[0], dy: im[1] - sc.roiBox[1], w: sc.roiBox[2] - sc.roiBox[0], h: sc.roiBox[3] - sc.roiBox[1] } : { kind: 'size', e: h };
    return true;
  }
  function move(p, im) {
    var a = X.act, sc = S.scene, b = sc.roiBox ? sc.roiBox.slice() : [0, 0, 0, 0]; if (!a) return;
    if (a.kind === 'new') b = [a.ax, a.ay, im[0], im[1]];
    else if (a.kind === 'move') { var x = Math.max(0, Math.min(sc.w - a.w, im[0] - a.dx)), y = Math.max(0, Math.min(sc.h - a.h, im[1] - a.dy)); b = [x, y, x + a.w, y + a.h]; }
    else { if (a.e.l) b[0] = im[0]; if (a.e.r) b[2] = im[0]; if (a.e.t) b[1] = im[1]; if (a.e.b) b[3] = im[1]; }
    setBox(b, false);
  }
  function up() { if (!X.act) return; X.act = null; X.fresh = false; setBox(S.scene.roiBox, true); A.toast('Zona cambiada: se vuelve a detectar dentro del recuadro.'); }
  function over(ctx, P) {
    var sc = S.scene;
    if (sc && S.res && S.ovOn) S.res.comps.forEach(function (k) { if (!k.isNew) return; var p0 = P(k.x0, k.y0), p1 = P(k.x1 + 1, k.y1 + 1), r = Math.max(14, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 2 + 8); ctx.beginPath(); ctx.arc((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, r, 0, 6.2832); ctx.strokeStyle = '#ff9d2e'; ctx.lineWidth = 2.5; ctx.stroke(); });
    if (!X.edit || !sc || !sc.roiBox) return;
    var b = sc.roiBox, a = P(Math.min(b[0], b[2]), Math.min(b[1], b[3])), c = P(Math.max(b[0], b[2]), Math.max(b[1], b[3])), mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
    ctx.strokeStyle = '#ffe45c'; ctx.lineWidth = 2; ctx.strokeRect(a[0], a[1], c[0] - a[0], c[1] - a[1]);
    ctx.fillStyle = '#ffe45c'; ctx.strokeStyle = '#0a161b'; ctx.lineWidth = 1;
    [[a[0], a[1]], [mx, a[1]], [c[0], a[1]], [a[0], my], [c[0], my], [a[0], c[1]], [mx, c[1]], [c[0], c[1]]].forEach(function (h) { ctx.fillRect(h[0] - 5, h[1] - 5, 10, 10); ctx.strokeRect(h[0] - 5, h[1] - 5, 10, 10); });
    var g = PE.gsd(sc); if (g) { var t = nf0.format(Math.abs(b[2] - b[0]) * g) + ' × ' + nf0.format(Math.abs(b[3] - b[1]) * g) + ' m'; ctx.font = '500 11px "IBM Plex Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,13,16,.85)'; ctx.strokeText(t, a[0] + 2, a[1] - 4); ctx.fillStyle = '#ffe45c'; ctx.fillText(t, a[0] + 2, a[1] - 4); }
  }
  /* ---------- nidos en imágenes de dron: borrador automático más corrección a mano ---------- */
  var NEST = { on: false, diam: 0.65, c: 0.14, add: [], del: [], auto: 0 };
  function nests(sc) {
    var g = PE.gsd(sc); if (!NEST.on || !g || g > 0.15) return null;
    var within = sc.roi && sc.roiOn ? sc.roi : null, rad = NEST.diam / g * 0.6;
    var pts = PE.detectNests(sc, { diamPx: NEST.diam / g, c: NEST.c, within: within }); NEST.auto = pts.length;
    pts = pts.filter(function (p) { return !NEST.del.some(function (d) { return Math.hypot(d[0] - p.x, d[1] - p.y) < rad; }); });
    NEST.add.forEach(function (a) { pts.push({ x: a[0], y: a[1], s: 0, manual: true }); });
    S.ind.diam = NEST.diam; return pts;
  }
  function tap(im) { // tocar un círculo lo quita; tocar fuera agrega un nido
    if (!NEST.on || !S.blobs) return false;
    var g = PE.gsd(S.scene), rad = NEST.diam / g * 0.6, best = -1, bd = rad;
    S.blobs.forEach(function (b, i) { var d = Math.hypot(b.x - im[0], b.y - im[1]); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { var b = S.blobs[best]; if (b.manual) NEST.add = NEST.add.filter(function (a) { return a[0] !== b.x || a[1] !== b.y; }); else NEST.del.push([b.x, b.y]); }
    else NEST.add.push([im[0], im[1]]);
    A.schedule(0); return true;
  }
  function nestUI() {
    var sc = S.scene, g = sc && PE.gsd(sc), can = !!g && g <= 0.15;
    $('nestBox').hidden = !can; $('nestOn').checked = NEST.on; $('nestCtl').hidden = !NEST.on;
    $('oNestD').textContent = String(NEST.diam.toFixed(2)).replace('.', ',') + ' m'; $('oNestC').textContent = String(NEST.c.toFixed(2)).replace('.', ',');
    if (NEST.on && S.blobs) $('nestSum').textContent = nf0.format(S.blobs.length) + ' nidos marcados: ' + nf0.format(NEST.auto) + ' del borrador automático, ' + NEST.del.length + ' quitados y ' + NEST.add.length + ' agregados a mano.';
  }
  $('nestOn').addEventListener('change', function () { NEST.on = this.checked; if (NEST.on) { S.ovStyle = 'edge'; $('ovStyle').value = 'edge'; } nestUI(); A.schedule(0); });
  $('nestDiam').addEventListener('input', function () { NEST.diam = +this.value; nestUI(); A.schedule(150); });
  $('nestC').addEventListener('input', function () { NEST.c = +this.value; nestUI(); A.schedule(150); });
  $('nestClear').addEventListener('click', function () { NEST.add = []; NEST.del = []; A.schedule(0); });
  $('nestCsv').addEventListener('click', function () {
    if (!S.blobs || !S.blobs.length) { A.toast('No hay nidos marcados.'); return; }
    var rows = ['n,x_px,y_px,lon,lat,origen']; S.blobs.forEach(function (b, i) { var p = A.lonlat(b.x, b.y); rows.push([i + 1, (b.x * S.down).toFixed(1), (b.y * S.down).toFixed(1), p ? p[0].toFixed(7) : '', p ? p[1].toFixed(7) : '', b.manual ? 'a mano' : 'automático'].join(',')); });
    A.save('nidos.csv', rows.join('\n'), 'text/csv');
  });
  document.addEventListener('pc:scene', function () { var sc = S.scene, g = sc && PE.gsd(sc); NEST.add = []; NEST.del = []; NEST.on = !!g && g <= 0.05; if (NEST.on) { S.ovStyle = 'edge'; $('ovStyle').value = 'edge'; } nestUI(); });
  document.addEventListener('pc:result', function () { setTimeout(nestUI, 0); });

  /* ---------- cobertura: cada píxel en una clase, con sus referencias ---------- */
  var CLS = [
    { k: 'nodata', n: 'Sin dato', c: [20, 26, 30] },
    { k: 'agua', n: 'Agua: mar y lagunas', c: [38, 98, 168] },
    { k: 'nieve', n: 'Nieve y hielo', c: [236, 244, 250] },
    { k: 'veg', n: 'Vegetación: musgos y líquenes', c: [74, 158, 74] },
    { k: 'roca', n: 'Roca y suelo sin nieve', c: [150, 128, 104] },
    { k: 'guano', n: 'Color de guano', c: [255, 95, 162] },
    { k: 'nube', n: 'Nubes y sus sombras', c: [150, 150, 160] }
  ];
  function classify(sc) { // reglas simples y explícitas; con infrarrojo usa NDVI, NDWI y NDSI, sin él sólo el color
    var N = sc.w * sc.h, m = sc.map, inv = 1 / sc.ref, out = new Uint8Array(N), cnt = [0, 0, 0, 0, 0, 0, 0];
    var R = sc.bands[m.r], G = sc.bands[m.g], B = sc.bands[m.b], NIR = m.nir >= 0 ? sc.bands[m.nir] : null, SW = m.swir >= 0 ? sc.bands[m.swir] : null;
    var mask = S.res && S.res.mask, scl = sc.scl, V = sc.valid, ru = S.rule;
    for (var i = 0; i < N; i++) {
      var r = R[i] * inv, g = G[i] * inv, b = B[i] * inv, L = (r + g + b) / 3, c;
      if (scl && (scl[i] === 3 || scl[i] === 8 || scl[i] === 9 || scl[i] === 10)) c = 6;
      else if ((V && !V[i] && !(scl && scl[i])) || (r === 0 && g === 0 && b === 0)) c = 0;
      else if (mask && mask[i]) c = 5;
      else if (NIR) {
        var n = NIR[i] * inv, ndvi = (n - r) / (n + r + 1e-9), ndwi = (g - n) / (g + n + 1e-9), ndsi = SW ? (g - SW[i] * inv) / (g + SW[i] * inv + 1e-9) : -1;
        if ((scl && scl[i] === 11) || (ndsi > 0.4 && L > 0.25)) c = 2;
        else if ((scl && scl[i] === 6) || ndwi > ru.ndwi) c = 1;
        else if (ndvi > ru.ndvi) c = 3; else c = 4;
      } else {
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = (mx - mn) / (mx + 1e-6);
        if (L > 0.5 && sat < 0.2) c = 2;
        else if (L > 0.15 && (2 * g - r - b) / (r + g + b + 1e-6) > 0.08) c = 3;
        else if (L > 0.12 && L < 0.5 && b > r * 1.2 && b > g * 1.04) c = 1; else c = 4; // lo muy oscuro es suelo: su tinte no alcanza para decidir
      }
      out[i] = c; cnt[c]++;
    }
    return { map: out, cnt: cnt };
  }
  var CL = null;
  function classImage(sc, d) { // color de la clase modulado por el brillo, para que se siga leyendo el relieve
    CL = classify(sc); var N = sc.w * sc.h, m = sc.map, inv = 1 / sc.ref, R = sc.bands[m.r], G = sc.bands[m.g], B = sc.bands[m.b];
    for (var i = 0; i < N; i++) { var c = CLS[CL.map[i]].c, L = Math.min(1, (R[i] + G[i] + B[i]) * inv / 3), k = CL.map[i] === 2 ? 0.8 + 0.2 * L : 0.55 + 0.6 * Math.sqrt(L), j = i * 4; d[j] = Math.min(255, c[0] * k); d[j + 1] = Math.min(255, c[1] * k); d[j + 2] = Math.min(255, c[2] * k); d[j + 3] = 255; }
  }
  function sw(css, txt, cls) { var r = document.createElement('div'); r.className = 'legrow'; var i = document.createElement('i'); i.className = cls || ''; i.style.cssText = css; r.appendChild(i); r.appendChild(document.createTextNode(txt)); return r; }
  function legend() {
    var c = A.current(), box = $('legBody'); box.innerHTML = ''; if (!c) return;
    var sc = c.scene, on = S.mode === 'cls'; $('clsBtn').setAttribute('aria-pressed', String(on)); $('clsBtn').textContent = on ? 'Volver a la imagen en color' : 'Clasificar toda la imagen';
    if (on) {
      if (!CL || CL.map.length !== sc.w * sc.h) CL = classify(sc);
      var tot = sc.w * sc.h - CL.cnt[0], g = PE.gsd(sc);
      CLS.forEach(function (k, i) { if (!i || !CL.cnt[i]) return; var p = 100 * CL.cnt[i] / tot, a = g ? CL.cnt[i] * sc.pxArea : 0; box.appendChild(sw('background:rgb(' + k.c.join(',') + ')', k.n + ' · ' + (p < 0.1 ? 'menos de 0,1' : p < 1 ? nf1.format(p) : nf0.format(p)) + ' %' + (g ? ' · ' + (a >= 1e4 ? nf1.format(a / 1e4) + ' ha' : nf0.format(a) + ' m²') : ''))); });
      var n = document.createElement('p'); n.className = 'legnote'; n.textContent = (sc.map.nir >= 0 ? 'Con infrarrojo: índices de agua, nieve y vegetación' + (sc.scl ? ', y la clasificación de nubes de Sentinel-2' : '') + '.' : 'Imagen sin infrarrojo: clases sólo por color y brillo; son aproximadas.') + ' Porcentajes sobre toda la imagen.'; box.appendChild(n);
    } else box.appendChild(sw('background:#8fd8ea;border:1.5px solid #fff', 'Celeste: tiene color de guano'));
    if (c.blobs) box.appendChild(sw('border:2px solid #ffe45c;border-radius:50%;background:none', NEST.on ? 'Círculo amarillo: nido marcado' : 'Círculo amarillo: ave contada'));
    if (sc.roi && sc.roiOn) box.appendChild(sw('border:2px dashed #ffe45c;background:none', 'Recuadro de trazos: zona analizada'));
    if (c.res.comps.length) box.appendChild(sw('background:#f0c419', 'Amarillo: grupo elegido'));
    if (c.res.comps.some(function (k) { return k.isNew; })) box.appendChild(sw('border:2px solid #ff9d2e;border-radius:50%;background:none', 'Anillo naranja: grupo nuevo'));
    if (X.base && sc.geo) box.appendChild(sw('background:linear-gradient(135deg,#31404a,#6b7a80)', 'Alrededor: base satelital de Esri'));
  }
  $('clsBtn').addEventListener('click', function () { var m = $('mode'); m.value = S.mode === 'cls' ? 'rgb' : 'cls'; m.dispatchEvent(new Event('change', { bubbles: true })); m.dispatchEvent(new Event('input', { bubbles: true })); setTimeout(legend, 30); });
  $('mode').addEventListener('change', function () { setTimeout(legend, 30); });
  $('legToggle').addEventListener('click', function () { var o = this.getAttribute('aria-expanded') !== 'true'; this.setAttribute('aria-expanded', String(o)); $('legBody').hidden = !o; $('clsBtn').hidden = !o; });
  document.addEventListener('pc:result', function () { setTimeout(function () { if (S.mode === 'cls') { A.renderBase(); A.draw(); } legend(); }, 0); });

  /* ---------- ubicar: alejar hasta ver el entorno sobre la base ---------- */
  $('zWhere').addEventListener('click', function () {
    var sc = S.scene, g = sc && PE.gsd(sc); if (!sc || !sc.geo || !g) { A.toast('La imagen no tiene coordenadas: no se puede ubicar.'); return; }
    var r = A.cv.getBoundingClientRect(), span = Math.max(4000, sc.w * g * 3), k = r.width / (span / g);
    S.view = { k: k, x: r.width / 2 - sc.w / 2 * k, y: r.height / 2 - sc.h / 2 * k }; X.base = true; $('baseOn').checked = true; A.draw();
  });
  var over0 = over;
  over = function (ctx, P) { // cuando la imagen se ve chica, su contorno y su nombre
    var sc = S.scene; if (sc && sc.geo) { var a = P(0, 0), b = P(sc.w, sc.h); if (b[0] - a[0] < 260) { ctx.strokeStyle = '#ffe45c'; ctx.lineWidth = 2; ctx.strokeRect(a[0] - 3, a[1] - 3, b[0] - a[0] + 6, b[1] - a[1] + 6); ctx.font = '600 12px "IBM Plex Sans", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; var t = 'Acá está la imagen (' + nf0.format(sc.w * PE.gsd(sc)) + ' m de ancho)'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,13,16,.9)'; ctx.strokeText(t, a[0], a[1] - 8); ctx.fillStyle = '#ffe45c'; ctx.fillText(t, a[0], a[1] - 8); } }
    over0(ctx, P);
  };
  window.PCX = { classImage: classImage, classify: classify, under: under, over: function (c, P) { over(c, P); }, down: down, move: move, up: up, state: X, nests: nests, tap: tap, nest: NEST };

  /* ---------- fichas por grupo ---------- */
  function signal(sc, c, L) { // cuántos desvíos del suelo común se aparta el grupo en rojo y en rosado
    var st = sc.landStats || (sc.landStats = PE.landStats(sc)); if (!st || !st.riMad) return null;
    var m = sc.map, inv = 1 / sc.ref, R = sc.bands[m.r], G = sc.bands[m.g], B = sc.bands[m.b], ri = 0, ax = 0, n = 0;
    for (var y = c.y0; y <= c.y1; y++) for (var x = c.x0; x <= c.x1; x++) { var i = y * sc.w + x; if (L[i] !== c.id) continue; var r = R[i] * inv, g = G[i] * inv, b = B[i] * inv, rb = (r + b) / 2; ri += (r - b) / (r + b + 1e-9); ax += (rb - g) / (rb + g + 1e-9); n++; }
    return n ? { ri: (ri / n - st.riMed) / st.riMad, ax: (ax / n - st.axMed) / (st.axMad || 1) } : null;
  }
  function thumb(sc, c) {
    var pad = Math.max(3, Math.round(0.6 * Math.max(c.x1 - c.x0, c.y1 - c.y0))), x0 = Math.max(0, c.x0 - pad), y0 = Math.max(0, c.y0 - pad), x1 = Math.min(sc.w, c.x1 + 1 + pad), y1 = Math.min(sc.h, c.y1 + 1 + pad);
    var cv = document.createElement('canvas'), d = window.devicePixelRatio || 1; cv.width = cv.height = Math.round(84 * d); cv.className = 'thumb';
    var g = cv.getContext('2d'), k = cv.width / Math.max(x1 - x0, y1 - y0); g.imageSmoothingEnabled = k < 3;
    g.fillStyle = '#0a161b'; g.fillRect(0, 0, cv.width, cv.height);
    var ox = (cv.width - (x1 - x0) * k) / 2, oy = (cv.height - (y1 - y0) * k) / 2;
    g.drawImage(A.layers.base, x0, y0, x1 - x0, y1 - y0, ox, oy, (x1 - x0) * k, (y1 - y0) * k);
    g.drawImage(A.layers.edge, x0, y0, x1 - x0, y1 - y0, ox, oy, (x1 - x0) * k, (y1 - y0) * k);
    return cv;
  }
  function chip(k, v) { var s = document.createElement('span'); s.className = 'kv'; var b = document.createElement('b'); b.textContent = k; s.appendChild(b); s.appendChild(document.createTextNode(' ' + v)); return s; }
  function cards() {
    var c = A.current(), box = $('cards'); box.innerHTML = ''; sync(); if (!c) return;
    var sc = c.scene, g = PE.gsd(sc), L = c.res.labels, per = {};
    if (c.blobs) c.blobs.forEach(function (b) { var id = L[Math.round(b.y) * sc.w + Math.round(b.x)]; if (id) per[id] = (per[id] || 0) + 1; });
    if (!c.res.comps.length) { var e = document.createElement('p'); e.className = 'hint'; e.textContent = 'Todavía no hay grupos detectados.'; box.appendChild(e); return; }
    c.res.comps.slice(0, 40).forEach(function (cp) {
      var card = document.createElement('button'); card.type = 'button'; card.className = 'gcard' + (cp.id === S.sel ? ' sel' : ''); card.dataset.id = cp.id;
      card.appendChild(thumb(sc, cp));
      var body = document.createElement('div'), h = document.createElement('strong'), sg = signal(sc, cp, L);
      h.textContent = 'Grupo ' + cp.id + ' · ' + (g ? nf0.format(cp.area * sc.pxArea) + ' m²' : nf0.format(cp.area) + ' px'); body.appendChild(h);
      if (cp.isNew) { var nw = document.createElement('span'); nw.className = 'sigtag new'; nw.textContent = 'nuevo'; h.appendChild(nw); }
      if (sg) { var lvl = sg.ri >= 7 ? ['fuerte', 'ok'] : sg.ri >= 4.5 ? ['media', 'mid'] : ['débil', 'low'], t = document.createElement('span'); t.className = 'sigtag ' + lvl[1]; t.textContent = 'señal ' + lvl[0]; h.appendChild(t); }
      var kv = document.createElement('div'); kv.className = 'kvs';
      if (g) kv.appendChild(chip('parejas', '≈ ' + nf0.format(cp.area * sc.pxArea * c.dens.mid)));
      if (per[cp.id]) kv.appendChild(chip('aves contadas', nf0.format(per[cp.id])));
      if (g) kv.appendChild(chip('tamaño', nf0.format((cp.x1 - cp.x0 + 1) * g) + ' × ' + nf0.format((cp.y1 - cp.y0 + 1) * g) + ' m'));
      if (cp.elev !== undefined) kv.appendChild(chip('cota', nf0.format(cp.elev) + ' m'));
      if (cp.slope !== undefined) kv.appendChild(chip('pendiente', nf0.format(cp.slope) + '°' + (cp.aspect !== undefined ? ', mira al ' + PE.compass(cp.aspect) : '')));
      if (cp.sea !== undefined) kv.appendChild(chip('al mar', nf0.format(cp.sea) + ' m'));
      if (cp.nn !== undefined && c.res.comps.length > 1) kv.appendChild(chip('vecino', nf0.format(cp.nn) + ' m'));
      if (sg) kv.appendChild(chip('color', nf1.format(sg.ri) + ' desvíos más rojo, ' + nf1.format(sg.ax) + ' más rosado'));
      var p = A.lonlat(cp.cx, cp.cy); if (p) kv.appendChild(chip('centro', Math.abs(p[1]).toFixed(5).replace('.', ',') + '° S, ' + Math.abs(p[0]).toFixed(5).replace('.', ',') + '° O'));
      body.appendChild(kv); card.appendChild(body);
      card.addEventListener('click', function () { A.selectComp(cp.id, true); A.draw(); mark(); });
      box.appendChild(card);
    });
    if (c.res.comps.length > 40) { var n = document.createElement('p'); n.className = 'hint'; n.textContent = 'Se muestran los 40 grupos mayores de ' + c.res.comps.length + '. La tabla y la exportación los incluyen todos.'; box.appendChild(n); }
  }
  function mark() { Array.prototype.forEach.call($('cards').querySelectorAll('.gcard'), function (el) { el.classList.toggle('sel', +el.dataset.id === S.sel); }); }
  document.addEventListener('pc:result', function () { setTimeout(cards, 0); });
  document.addEventListener('pc:scene', function () { X.edit = false; X.fresh = false; sync(); });
  A.cv.addEventListener('pointerup', function () { setTimeout(mark, 0); });

  /* ---------- lista de ortomosaicos de dron (figshare) ---------- */
  var UAV = null;
  function uavList() {
    var box = $('uavList'), loc = $('uavLoc').value; box.innerHTML = '';
    if (!UAV) { box.textContent = 'Consultando figshare…'; return; }
    var fs = UAV.filter(function (f) { return f.name.indexOf(loc + '_') === 0; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    fs.forEach(function (f) {
      var m = /(\d{4})_(\d{2})_(\d{2})/.exec(f.name), row = document.createElement('div'), a = document.createElement('a'); row.className = 'uavrow';
      a.href = f.download_url; a.textContent = 'Bajar'; a.rel = 'noopener'; a.target = '_blank';
      var star = /Potter_Peninsula_2022_10_14|Lions_Rump_2024_10_23|Patelnia_2019_11_20/.test(f.name);
      row.appendChild(document.createTextNode((m ? m[3] + '/' + m[2] + '/' + m[1] : f.name) + ' · ' + (f.size > 1e9 ? nf1.format(f.size / 1e9) + ' GB' : nf0.format(f.size / 1e6) + ' MB') + (star ? ' · con pingüinos' : '')));
      row.appendChild(a); box.appendChild(row);
    });
    if (!fs.length) box.textContent = 'Sin archivos para este lugar.';
  }
  $('uavBox').addEventListener('toggle', function () {
    if (!this.open || UAV) return; uavList();
    fetch('https://api.figshare.com/v2/articles/29561684').then(function (r) { return r.json(); }).then(function (j) { UAV = (j.files || []).filter(function (f) { return /orthomosaic\.tif$/i.test(f.name); }); uavList(); })
      .catch(function () { $('uavList').innerHTML = 'No se pudo consultar figshare desde esta red. La lista completa está en <a href="https://doi.org/10.6084/m9.figshare.29561684" target="_blank" rel="noopener">doi:10.6084/m9.figshare.29561684</a>.'; });
  });
  $('uavLoc').addEventListener('change', uavList);
  Array.prototype.forEach.call(document.querySelectorAll('[data-uav]'), function (b) {
    b.addEventListener('click', function () {
      var url = b.dataset.uav; A.busy('Bajando el recorte de dron…');
      fetch(url).then(function (r) { if (!r.ok) throw new Error('sin archivo'); return r.blob(); })
        .then(function (bl) { return A.loadFile(new File([bl], url.split('/').pop(), { type: 'image/tiff' })); })
        .catch(function () { A.busy(null); A.toast('No se pudo bajar el recorte.'); });
    });
  });
  sync();
})();
