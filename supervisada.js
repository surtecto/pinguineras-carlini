/* Clasificación supervisada: el usuario marca ejemplos de cada clase y la app clasifica toda la imagen. */
(function () {
  'use strict';
  var A = window.PCApp, PE = window.PE, $ = function (id) { return document.getElementById(id); };
  if (!A) return;
  var S = A.S, nf0 = A.nf0, nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
  var BASE = [['agua', 'Agua', '#2662a8'], ['nieve', 'Nieve y hielo', '#ecf4fa'], ['roca', 'Roca y suelo', '#96806a'], ['veg', 'Vegetación', '#4a9e4a'], ['guano', 'Guano', '#ff4096'], ['nido', 'Nidos', '#ffc400'], ['pinguino', 'Pingüinos', '#ff6a14']];
  var EXTRA = ['#8e5bd6', '#19b3a6', '#d9482b', '#7a8a2a', '#c05fa0'];
  var U = { cls: [], cur: 'agua', samples: [], brush: 2, show: true, a: 0.75, map: null, cnt: null, used: [], canvas: document.createElement('canvas'), use: false, t: 0 };
  function reset() { U.cls = BASE.map(function (b) { return { id: b[0], n: b[1], c: b[2] }; }); U.cur = 'agua'; U.samples = []; U.map = null; U.cnt = null; U.used = []; var g = S.scene && PE.gsd(S.scene); U.brush = g && g >= 5 ? 2 : 4; $('supBrush').value = U.brush; }
  function active() { return !$('p-clasificar').hidden && !$('v-detectar').hidden; }
  function rgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
  function count(id) { return U.samples.filter(function (s) { return s.cls === id; }).length; }

  function classify() {
    var sc = S.scene; U.map = null; U.cnt = null; U.used = [];
    var ids = U.cls.filter(function (c) { return count(c.id); }).map(function (c) { return c.id; });
    if (!sc || ids.length < 2) { ui(); A.draw(); if (U.use) A.schedule(0); return; }
    var model = PE.trainML(sc, U.samples), C = model.cls, nc = C.length;
    if (nc < 2) { ui('Los ejemplos son muy pocos o muy chicos: agrandar el toque o marcar más lugares por clase.'); A.draw(); return; }
    var N = sc.w * sc.h, d = model.d, B = model.fb.map(function (i) { return sc.bands[i]; }), inv = 1 / sc.ref, v = new Float64Array(d), V = sc.valid, map = new Uint8Array(N).fill(255), cnt = new Array(nc).fill(0);
    for (var i = 0; i < N; i++) {
      if (V && !V[i] && !(sc.scl && sc.scl[i] === 11)) continue;
      for (var a = 0; a < d; a++) v[a] = B[a][i] * inv;
      var best = Infinity, bi = 0;
      for (var c = 0; c < nc; c++) { var cl = C[c], mu = cl.mean, ic = cl.icov, q = 0; for (a = 0; a < d; a++) { var da = v[a] - mu[a], acc = 0; for (var b = 0; b < d; b++) acc += ic[a * d + b] * (v[b] - mu[b]); q += da * acc; } q += cl.logdet; if (q < best) { best = q; bi = c; } }
      map[i] = bi; cnt[bi]++;
    }
    U.map = map; U.cnt = cnt; U.used = C.map(function (c) { return c.id; });
    var cv = U.canvas; cv.width = sc.w; cv.height = sc.h; var g = cv.getContext('2d'), im = g.createImageData(sc.w, sc.h), D = im.data, cols = U.used.map(function (id) { return rgb(byId(id).c); });
    for (i = 0; i < N; i++) { if (map[i] === 255) continue; var k = cols[map[i]], j = i * 4; D[j] = k[0]; D[j + 1] = k[1]; D[j + 2] = k[2]; D[j + 3] = 255; }
    g.putImageData(im, 0, 0);
    ui(); A.draw(); if (window.PCX && window.PCX.legend) window.PCX.legend(); if (U.use) A.schedule(0);
  }
  function byId(id) { return U.cls.filter(function (c) { return c.id === id; })[0]; }
  function later() { clearTimeout(U.t); U.t = setTimeout(classify, 60); ui(); A.draw(); document.dispatchEvent(new CustomEvent('pc:result')); }

  function ui(msg) {
    var box = $('supClasses'); box.innerHTML = '';
    U.cls.forEach(function (c) {
      var b = document.createElement('button'), i = document.createElement('i'), n = document.createElement('span'); b.type = 'button'; b.className = 'supbtn'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(c.id === U.cur));
      i.style.background = c.c; n.className = 'cnt'; n.textContent = count(c.id); b.appendChild(i); b.appendChild(document.createTextNode(c.n)); b.appendChild(n);
      b.addEventListener('click', function () { U.cur = c.id; ui(); document.dispatchEvent(new CustomEvent('pc:result')); }); box.appendChild(b);
    });
    $('oSupBrush').textContent = (2 * U.brush + 1) + ' px' + (S.scene && PE.gsd(S.scene) ? ' · ' + nf1.format((2 * U.brush + 1) * PE.gsd(S.scene)) + ' m' : '');
    var withS = U.cls.filter(function (c) { return count(c.id); });
    $('supMsg').textContent = msg || (!U.samples.length ? 'Todavía no hay ejemplos. Elegir una clase y tocar la imagen.' : withS.length < 2 ? 'Hay ejemplos de «' + withS[0].n + '». Falta marcar al menos otra clase para poder clasificar.' : U.map ? 'Imagen clasificada en ' + U.used.length + ' clases con ' + U.samples.length + ' ejemplos. Si una clase invade a otra, agregar ejemplos de la clase correcta justo ahí.' : 'Clasificando…');
    var tb = $('supTbl').tBodies[0]; tb.innerHTML = ''; var sc = S.scene, g = sc && PE.gsd(sc), tot = U.cnt ? U.cnt.reduce(function (a, b) { return a + b; }, 0) : 0;
    U.cls.forEach(function (c) {
      var n = count(c.id); if (!n) return; var k = U.used.indexOf(c.id), px = k >= 0 && U.cnt ? U.cnt[k] : 0, r = tb.insertRow(), a = g ? px * sc.pxArea : 0;
      var t0 = r.insertCell(), i = document.createElement('i'); i.className = 'swatch'; i.style.background = c.c; t0.appendChild(i); t0.appendChild(document.createTextNode(c.n));
      r.insertCell().textContent = n; r.insertCell().textContent = !U.cnt ? '—' : k < 0 ? 'faltan ejemplos' : g ? (a >= 1e4 ? nf1.format(a / 1e4) + ' ha' : nf0.format(a) + ' m²') : nf0.format(px) + ' px'; r.insertCell().textContent = tot && k >= 0 ? nf1.format(100 * px / tot) : '—';
    });
    $('supUse').disabled = !(U.map && U.used.indexOf('guano') >= 0); if ($('supUse').disabled && U.use) { U.use = false; $('supUse').checked = false; }
  }
  $('supAdd').addEventListener('click', function () { var n = $('supName').value.trim(); if (!n) { A.toast('Escribir el nombre de la clase.'); return; } var id = 'c' + Date.now(); U.cls.push({ id: id, n: n, c: EXTRA[(U.cls.length - BASE.length) % EXTRA.length] }); U.cur = id; $('supName').value = ''; ui(); document.dispatchEvent(new CustomEvent('pc:result')); });
  $('supBrush').addEventListener('input', function () { U.brush = +this.value; ui(); });
  $('supUndo').addEventListener('click', function () { U.samples.pop(); later(); });
  $('supClear').addEventListener('click', function () { U.samples = []; later(); });
  $('supShow').addEventListener('change', function () { U.show = this.checked; A.draw(); if (window.PCX.legend) window.PCX.legend(); });
  $('supA').addEventListener('input', function () { U.a = +this.value; A.draw(); });
  $('supUse').addEventListener('change', function () { U.use = this.checked; A.schedule(0); });
  $('supCsv').addEventListener('click', function () {
    if (!U.map) { A.toast('Todavía no hay clasificación.'); return; } var sc = S.scene, g = PE.gsd(sc), tot = U.cnt.reduce(function (a, b) { return a + b; }, 0), rows = ['clase,ejemplos,pixeles,superficie_m2,porcentaje'];
    U.used.forEach(function (id, k) { rows.push(['"' + byId(id).n + '"', count(id), U.cnt[k], g ? (U.cnt[k] * sc.pxArea).toFixed(1) : '', (100 * U.cnt[k] / tot).toFixed(2)].join(',')); }); A.save('clasificacion_superficies.csv', rows.join('\n'));
  });
  $('supJson').addEventListener('click', function () {
    if (!U.samples.length) { A.toast('No hay ejemplos.'); return; } var sc = S.scene;
    A.save('clasificacion_ejemplos.json', JSON.stringify({ imagen: sc.name, fecha: sc.date || null, clases: U.cls.filter(function (c) { return count(c.id); }).map(function (c) { return { id: c.id, nombre: c.n, color: c.c }; }), ejemplos: U.samples.map(function (s) { var p = A.lonlat(s.x, s.y); return { clase: s.cls, x: +(s.x * S.down).toFixed(1), y: +(s.y * S.down).toFixed(1), radio_px: s.r, lon: p ? +p[0].toFixed(7) : null, lat: p ? +p[1].toFixed(7) : null }; }) }, null, 1));
  });
  $('supPng').addEventListener('click', function () { if (!U.map) { A.toast('Todavía no hay clasificación.'); return; } U.canvas.toBlob(function (b) { A.save('clasificacion.png', b); }, 'image/png'); });

  window.PCSup = {
    tap: function (im) { if (!active() || !S.scene) return false; U.samples.push({ cls: U.cur, x: im[0], y: im[1], r: U.brush }); later(); return true; },
    hint: function () { if (!active()) return null; var c = byId(U.cur); return [c.c, 'Clasificación supervisada: tocar lugares que sean «' + c.n + '». Arrastrar sigue moviendo la imagen.']; },
    paint: function (ctx, P) {
      var sc = S.scene; if (!sc) return;
      if (U.map && U.show && U.canvas.width === sc.w) { var a = P(0, 0), b = P(sc.w, sc.h); ctx.save(); ctx.globalAlpha = U.a; ctx.imageSmoothingEnabled = S.view.k < 3; ctx.drawImage(U.canvas, a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.restore(); }
      if (U.samples.length && (active() || (U.map && U.show))) U.samples.forEach(function (s) { var p = P(s.x, s.y), r = Math.max(4, (s.r + 0.5) * S.view.k); ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832); ctx.fillStyle = byId(s.cls).c; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#0a161b'; ctx.stroke(); ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke(); });
    },
    legend: function (box, sw) {
      if (!U.map || !U.show) return; var tot = U.cnt.reduce(function (a, b) { return a + b; }, 0), t = document.createElement('p'); t.className = 'legnote'; t.textContent = 'Clasificación supervisada (con sus ejemplos):'; box.appendChild(t);
      U.used.forEach(function (id, k) { var c = byId(id), p = 100 * U.cnt[k] / tot; box.appendChild(sw('background:' + c.c, c.n + ' · ' + (p < 1 ? nf1.format(p) : nf0.format(p)) + ' %')); });
    },
    mask: function (sc) { if (!U.use || !U.map || U.map.length !== sc.w * sc.h) return null; var k = U.used.indexOf('guano'); if (k < 0) return null; var m = new Uint8Array(U.map.length); for (var i = 0; i < m.length; i++) if (U.map[i] === k) m[i] = 1; return m; },
    state: U
  };
  document.addEventListener('pc:scene', function () { reset(); ui(); });
  document.addEventListener('pc:pane', function () { document.dispatchEvent(new CustomEvent('pc:result')); A.draw(); });
  reset(); ui();
})();
