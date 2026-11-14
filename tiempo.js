/* Seguimiento por temporadas: mapa del sector, series de censos, registro de detecciones y mapa de cambios. */
(function () {
  'use strict';
  var R = window.PC_REGION, A = window.PCApp, $ = function (id) { return document.getElementById(id); };
  if (!R || !A) return;
  var SP = { ADPE: { n: 'Adelia', v: '--krill' }, GEPE: { n: 'Papúa', v: '--ice' }, CHPE: { n: 'Barbijo', v: '--muted' }, MCPE: { n: 'Macaroni', v: '--warnc' } };
  var TY = { n: 'nidos', c: 'pichones', a: 'adultos' };
  var KEY = 'pc_serie_v1', NOW = 2026;
  var nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  var byId = {}; R.sites.forEach(function (s) { byId[s.id] = s; });
  var T = { site: 'STRA', recs: [], mapPts: [], pts: [] };
  try { var raw = localStorage.getItem(KEY); if (raw) T.recs = JSON.parse(raw).filter(function (r) { return r && r.date && r.id; }); } catch (e) { T.recs = []; }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(T.recs)); } catch (e) { /* sin almacenamiento: la serie vive en la página */ } }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888'; }
  function setup(cv, ratio) {
    var w = cv.parentElement.clientWidth, h = Math.round(w * ratio), dpr = window.devicePixelRatio || 1;
    if (!w) return null;
    cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    return { g: g, w: w, h: h };
  }
  function latest(site) { // último conteo por especie, prefiriendo nidos
    var out = {};
    Object.keys(site.sp).forEach(function (k) {
      var o = site.sp[k], nests = o.filter(function (r) { return r[1] === 'n'; }), last = (nests.length ? nests : o).slice(-1)[0];
      out[k] = last;
    });
    return out;
  }
  function mainSp(site) { var l = latest(site), best = null; Object.keys(l).forEach(function (k) { if (!best || l[k][2] > l[best][2]) best = k; }); return [best, l[best][2]]; }

  /* ---------- mapa del sector ---------- */
  var bb = R.bbox, COS = Math.cos(62.2 * Math.PI / 180);
  function drawMap() {
    var c = setup($('regMap'), (bb[3] - bb[1]) / ((bb[2] - bb[0]) * COS)); if (!c) return;
    var g = c.g, k = c.w / ((bb[2] - bb[0]) * COS);
    function P(lon, lat) { return [(lon - bb[0]) * COS * k, (bb[3] - lat) * k]; }
    var ink = css('--ink'), muted = css('--muted'), line = css('--line'), paper = css('--paper');
    g.fillStyle = css('--surface'); g.fillRect(0, 0, c.w, c.h);
    g.strokeStyle = line; g.lineWidth = 1; g.fillStyle = muted; g.font = '10px "IBM Plex Mono", monospace';
    for (var lo = -59.5; lo <= -57.4; lo += 0.5) { var p = P(lo, bb[3]); g.beginPath(); g.moveTo(p[0], 0); g.lineTo(p[0], c.h); g.stroke(); g.fillText(Math.abs(lo).toFixed(1).replace('.', ',') + '° O', p[0] + 3, c.h - 5); }
    for (var la = -62.4; la <= -61.85; la += 0.2) { var q = P(bb[0], la); g.beginPath(); g.moveTo(0, q[1]); g.lineTo(c.w, q[1]); g.stroke(); g.fillText(Math.abs(la).toFixed(1).replace('.', ',') + '° S', 4, q[1] - 3); }
    g.fillStyle = paper; g.strokeStyle = muted; g.lineWidth = 1;
    R.coast.forEach(function (ring) { g.beginPath(); ring.forEach(function (pt, i) { var p2 = P(pt[0], pt[1]); if (i) g.lineTo(p2[0], p2[1]); else g.moveTo(p2[0], p2[1]); }); g.closePath(); g.fill(); g.stroke(); });
    T.mapPts = [];
    R.sites.slice().sort(function (a, b) { return mainSp(b)[1] - mainSp(a)[1]; }).forEach(function (s) {
      var m = mainSp(s), p3 = P(s.lo, s.la), r = 2.5 + 1.7 * Math.log10(1 + m[1]);
      g.beginPath(); g.arc(p3[0], p3[1], r, 0, 6.2832); g.globalAlpha = 0.78; g.fillStyle = css(SP[m[0]].v); g.fill(); g.globalAlpha = 1; g.lineWidth = 1; g.strokeStyle = css('--surface'); g.stroke();
      T.mapPts.push({ id: s.id, x: p3[0], y: p3[1], r: r });
    });
    var base = P(-58.667, -62.238); g.fillStyle = ink; g.fillRect(base[0] - 3.5, base[1] - 3.5, 7, 7);
    g.font = '600 11px "IBM Plex Sans", sans-serif'; g.fillStyle = ink; g.fillText('Base Carlini', base[0] + 7, base[1] - 5);
    var sel = byId[T.site], ps = P(sel.lo, sel.la);
    g.beginPath(); g.arc(ps[0], ps[1], 2.5 + 1.7 * Math.log10(1 + mainSp(sel)[1]) + 4, 0, 6.2832); g.lineWidth = 2; g.strokeStyle = ink; g.stroke();
    var tw = g.measureText(sel.n).width, tx = Math.min(c.w - tw - 6, Math.max(4, ps[0] + 12)), ty = ps[1] + 16 > c.h - 8 ? ps[1] - 12 : ps[1] + 18;
    g.fillStyle = css('--surface'); g.globalAlpha = 0.85; g.fillRect(tx - 3, ty - 11, tw + 6, 15); g.globalAlpha = 1; g.fillStyle = ink; g.fillText(sel.n, tx, ty);
  }
  $('regMap').addEventListener('click', function (e) {
    var r = this.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd = 1e9;
    T.mapPts.forEach(function (p) { var d = Math.hypot(p.x - x, p.y - y) - p.r; if (d < bd) { bd = d; best = p; } });
    if (best && bd < 12) selectSite(best.id);
  });
  function selectSite(id) { T.site = id; drawMap(); siteInfo(); drawChart(); renderRecs(); }

  function el(tag, txt, cls) { var e = document.createElement(tag); if (txt !== undefined) e.textContent = txt; if (cls) e.className = cls; return e; }
  function siteInfo() {
    var s = byId[T.site], box = $('siteInfo'), l = latest(s); box.innerHTML = '';
    box.appendChild(el('h3', s.n));
    box.appendChild(el('p', Math.abs(s.la).toFixed(3).replace('.', ',') + '° S  ' + Math.abs(s.lo).toFixed(3).replace('.', ',') + '° O · código MAPPPD ' + s.id, 'coord'));
    var t = el('table'), hd = t.createTHead().insertRow();
    ['Especie', 'Último conteo', 'Temporada', 'Primer registro', 'Cambio en nidos'].forEach(function (h) { hd.appendChild(el('th', h)); });
    var tb = t.createTBody();
    Object.keys(s.sp).forEach(function (k) {
      var o = s.sp[k], nests = o.filter(function (r) { return r[1] === 'n'; }), row = tb.insertRow(), last = l[k];
      var chg = nests.length > 1 && nests[0][2] > 0 ? Math.round(100 * (nests[nests.length - 1][2] - nests[0][2]) / nests[0][2]) : null;
      [SP[k].n, nf0.format(last[2]) + ' ' + TY[last[1]], PE.seasonLabel(last[0]), PE.seasonLabel(o[0][0]),
        chg === null ? '—' : (chg > 0 ? '+' : '') + nf0.format(chg) + ' % desde ' + PE.seasonLabel(nests[0][0])].forEach(function (v) { row.insertCell().textContent = v; });
    });
    box.appendChild(t);
    if (T.site === 'STRA') box.appendChild(el('p', 'Los conteos de Adelia de 2007/08 a 2012/13 figuran así en la base de datos; el plan de gestión de la ZAEP 132 cita unas 3.000 parejas. Conviene confirmar con el Instituto Antártico Argentino si corresponden a toda la colonia o a los grupos monitoreados.', 'hint'));
  }

  /* ---------- gráfico de la serie ---------- */
  function siteRecs() { return T.recs.filter(function (r) { return r.site === T.site && r.pairs; }); }
  function drawChart() {
    var c = setup($('serie'), 0.5); if (!c) return;
    var g = c.g, s = byId[T.site], recs = siteRecs(), L = 56, Rm = 14, Tp = 16, B = 30;
    var x0 = 1e9, x1 = NOW, ymax = 1;
    Object.keys(s.sp).forEach(function (k) { if (k === 'MCPE') return; s.sp[k].forEach(function (o) { if (o[0] < x0) x0 = o[0]; if (o[2] > ymax) ymax = o[2]; }); });
    recs.forEach(function (r) { if (r.season < x0) x0 = r.season; if (r.pairs[2] > ymax) ymax = r.pairs[2]; });
    if (x0 > x1) x0 = x1 - 10; x0 -= 1;
    var mag = Math.pow(10, Math.floor(Math.log10(ymax))), step = ymax / mag > 5 ? mag : ymax / mag > 2 ? mag / 2 : mag / 5; ymax = Math.ceil(ymax / step) * step;
    function X(v) { return L + (v - x0) / (x1 - x0) * (c.w - L - Rm); } function Y(v) { return c.h - B - v / ymax * (c.h - B - Tp); }
    var muted = css('--muted'), line = css('--line'), ink = css('--ink');
    g.font = '10.5px "IBM Plex Mono", monospace'; g.fillStyle = muted; g.strokeStyle = line; g.lineWidth = 1; g.textBaseline = 'middle'; g.textAlign = 'right';
    for (var v = 0; v <= ymax + 1e-9; v += step) { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(c.w - Rm, Y(v)); g.stroke(); g.fillText(nf0.format(v), L - 6, Y(v)); }
    g.textAlign = 'center'; g.textBaseline = 'top';
    var xs = (x1 - x0) > 40 ? 10 : (x1 - x0) > 16 ? 5 : 2;
    for (var yr = Math.ceil(x0 / xs) * xs; yr <= x1; yr += xs) { g.beginPath(); g.moveTo(X(yr), c.h - B); g.lineTo(X(yr), c.h - B + 4); g.strokeStyle = muted; g.stroke(); g.fillText(PE.seasonLabel(yr), X(yr), c.h - B + 7); }
    T.pts = [];
    Object.keys(s.sp).forEach(function (k) {
      if (k === 'MCPE') return;
      var col = css(SP[k].v), o = s.sp[k], nests = o.filter(function (r) { return r[1] === 'n'; });
      g.strokeStyle = col; g.lineWidth = 1.75; g.beginPath();
      nests.forEach(function (r, i) { if (i) g.lineTo(X(r[0]), Y(r[2])); else g.moveTo(X(r[0]), Y(r[2])); }); g.stroke();
      o.forEach(function (r) {
        var px = X(r[0]), py = Y(r[2]);
        g.beginPath();
        if (r[1] === 'a') { g.moveTo(px, py - 4.5); g.lineTo(px + 4, py + 3.5); g.lineTo(px - 4, py + 3.5); g.closePath(); } else g.arc(px, py, 3.2, 0, 6.2832);
        if (r[1] === 'n') { g.fillStyle = col; g.fill(); } else { g.fillStyle = css('--surface'); g.fill(); g.lineWidth = 1.5; g.strokeStyle = col; g.stroke(); }
        T.pts.push({ x: px, y: py, t: SP[k].n + ' · ' + PE.seasonLabel(r[0]) + ' · ' + nf0.format(r[2]) + ' ' + TY[r[1]] });
      });
    });
    var dc = css('--warnc');
    recs.forEach(function (r) {
      var px = X(r.season) + 5, py = Y(r.pairs[1]);
      g.strokeStyle = dc; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px, Y(r.pairs[0])); g.lineTo(px, Y(r.pairs[2])); g.stroke();
      g.beginPath(); g.moveTo(px, py - 5.5); g.lineTo(px + 5.5, py); g.lineTo(px, py + 5.5); g.lineTo(px - 5.5, py); g.closePath();
      g.fillStyle = r.synth ? css('--surface') : dc; g.fill(); g.stroke();
      T.pts.push({ x: px, y: py, t: (r.synth ? 'Detección de escena sintética' : 'Detección en imagen') + ' · ' + r.date + ' · ' + nf0.format(r.pairs[1]) + ' parejas estimadas (' + nf0.format(r.pairs[0]) + ' a ' + nf0.format(r.pairs[2]) + ')' });
    });
    g.fillStyle = ink; g.font = '600 12px "IBM Plex Sans", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(s.n + ': conteos por temporada', L, 0);
    var lg = $('legend'); lg.innerHTML = '';
    Object.keys(s.sp).forEach(function (k) { if (k === 'MCPE') return; var sp = el('span'), i = el('i'); i.style.background = css(SP[k].v); sp.appendChild(i); sp.appendChild(document.createTextNode(SP[k].n)); lg.appendChild(sp); });
    [['', 'Nidos (línea)'], ['hollow', 'Pichones o adultos'], ['dia', 'Detección en imagen, con su rango']].forEach(function (d) {
      var sp = el('span'), i = el('i', undefined, d[0]); i.style.background = d[0] === 'dia' ? dc : muted; i.style.color = muted; sp.appendChild(i); sp.appendChild(document.createTextNode(d[1])); lg.appendChild(sp);
    });
  }
  $('serie').addEventListener('pointermove', function (e) {
    var r = this.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd = 16;
    T.pts.forEach(function (p) { var d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } });
    var tip = $('tip'); if (!best) { tip.hidden = true; return; }
    tip.textContent = best.t; tip.hidden = false;
    tip.style.left = Math.max(4, Math.min(r.width - 244, best.x + 10)) + 'px'; tip.style.top = Math.max(4, best.y - 34) + 'px';
  });
  $('serie').addEventListener('pointerleave', function () { $('tip').hidden = true; });

  /* ---------- calendario del ciclo ---------- */
  (function pheno() {
    var t = $('pheno'), order = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6], names = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    var hr = t.createTHead().insertRow(); hr.appendChild(el('th', 'Mes')); order.forEach(function (m) { hr.appendChild(el('th', names[m])); });
    var tb = t.createTBody();
    [['Adelia', 'adelia'], ['Papúa', 'papua']].forEach(function (d) {
      var row = tb.insertRow(); row.appendChild(el('td', d[0]));
      order.forEach(function (m) { row.appendChild(el('td', PE.PHASES[d[1]][m], 's' + (PE.PHASES.signal[m] ? 1 : 0))); });
    });
    var row = tb.insertRow(); row.appendChild(el('td', 'Señal del guano'));
    order.forEach(function (m) { var s = PE.PHASES.signal[m]; row.appendChild(el('td', ['—', 'Débil', 'Media', 'Máxima'][s], 's' + s)); });
  })();

  /* ---------- registro de detecciones ---------- */
  function renderRecs() {
    var tb = $('recs').tBodies[0]; tb.innerHTML = '';
    T.recs.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var mine = T.recs.filter(function (r) { return r.site === T.site; });
    mine.forEach(function (r) {
      var ph = PE.phase(r.date), row = tb.insertRow();
      [r.date + (r.synth ? ' (sintética)' : ''), PE.seasonLabel(r.season), ph.adelia + ' · ' + ph.papua].forEach(function (v) { row.insertCell().textContent = v; });
      var sc = row.insertCell(), bar = el('span', undefined, 'sig'); bar.style.setProperty('--f', Math.round(ph.signal / 3 * 100) + '%'); bar.title = PE.SIGNAL[ph.signal]; sc.appendChild(bar);
      [r.gsd ? A.fmtLen(r.gsd) : '—', r.nota && !r.pairs ? r.nota : (r.area ? nf0.format(r.area) + ' m²' : nf0.format(r.px) + ' px'), r.pairs ? nf0.format(r.pairs[1]) : '—'].forEach(function (v) { row.insertCell().textContent = v; });
      var del = el('button', 'Quitar', 'linkbtn'); del.type = 'button'; del.addEventListener('click', function () { T.recs = T.recs.filter(function (x) { return x.id !== r.id; }); persist(); renderRecs(); drawChart(); });
      row.insertCell().appendChild(del);
    });
    var other = T.recs.length - mine.length;
    $('recsNote').textContent = mine.length ? (other ? 'Hay ' + other + ' más guardadas en otras colonias.' : '') : 'Todavía no hay detecciones guardadas para ' + byId[T.site].n + '.' + (other ? ' Hay ' + other + ' en otras colonias.' : ' Probar con «Ejemplo satelital» y «Temporada posterior».');
    [$('cmpA'), $('cmpB')].forEach(function (sel, k) {
      var keep = sel.value; sel.innerHTML = '';
      mine.forEach(function (r) { sel.add(new Option(r.date + (r.label ? ' · ' + r.label : ''), r.id)); });
      if (mine.some(function (r) { return r.id === keep; })) sel.value = keep; else if (mine.length) sel.value = mine[k === 0 ? Math.max(0, mine.length - 2) : mine.length - 1].id;
    });
    var withMask = mine.filter(function (r) { return r.rle; }), ca = mine.filter(function (r) { return r.id === $('cmpA').value; })[0], cb = mine.filter(function (r) { return r.id === $('cmpB').value; })[0];
    if (withMask.length > 1 && (!ca || !cb || !ca.rle || !cb.rle || ca === cb)) { $('cmpA').value = withMask[withMask.length - 2].id; $('cmpB').value = withMask[withMask.length - 1].id; }
    $('recHint').textContent = 'Serie de ' + byId[T.site].n + '. Para ver o guardar en otra colonia, elegirla antes en el mapa de «Colonias y censos».';
  }
  $('recAdd').addEventListener('click', function () {
    var cur = A.current(), date = $('recDate').value;
    if (!cur || !cur.res.comps.length) { A.toast('No hay una detección para guardar: revisar la imagen y los umbrales.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { A.toast('Falta la fecha de la imagen: sin ella no se puede asignar la temporada ni la fase del ciclo.'); $('recDate').focus(); return; }
    var sc = cur.scene, d = cur.dens;
    var rec = { id: Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), date: date, season: PE.season(date), site: T.site, label: $('recLabel').value.trim() || sc.name,
      gsd: cur.gsd || 0, area: cur.m2 || 0, px: cur.px, groups: cur.res.comps.length, pairs: cur.m2 ? [Math.round(cur.m2 * d.lo), Math.round(cur.m2 * d.mid), Math.round(cur.m2 * d.hi)] : null,
      method: cur.method === 'rule' ? 'regla espectral' : 'muestras', w: sc.w, h: sc.h, geo: sc.geo ? { ox: sc.geo.ox, oy: sc.geo.oy, rx: sc.geo.rx, ry: sc.geo.ry, epsg: sc.geo.epsg } : null,
      pxArea: sc.pxArea || 0, rle: PE.rle(cur.res.mask), synth: !!sc.synthetic };
    T.recs.push(rec); persist(); renderRecs(); drawChart();
    var ph = PE.phase(date);
    A.toast('Guardada en la temporada ' + PE.seasonLabel(rec.season) + '. ' + PE.SIGNAL[ph.signal] + '.');
  });
  $('cmpRun').addEventListener('click', function () {
    var a = T.recs.filter(function (r) { return r.id === $('cmpA').value; })[0], b = T.recs.filter(function (r) { return r.id === $('cmpB').value; })[0];
    if (!a || !b || a === b) { A.toast('Elegir dos detecciones distintas de la misma colonia.'); return; }
    if (!a.rle || !b.rle) { A.toast('Una de las detecciones se importó sin su máscara: no se puede comparar píxel a píxel.'); return; }
    if (a.date > b.date) { var t = a; a = b; b = t; }
    var ch = PE.changeMap({ w: a.w, h: a.h, mask: PE.unrle(a.rle, a.w * a.h), geo: a.geo, pxArea: a.pxArea }, { w: b.w, h: b.h, mask: PE.unrle(b.rle, b.w * b.h), geo: b.geo, pxArea: b.pxArea || 1 });
    if (!ch) { A.toast('Las dos detecciones no son comparables: tienen que estar georreferenciadas o compartir el mismo encuadre.'); return; }
    var cv = $('cmpMap'), f = Math.max(1, Math.ceil(ch.w / 900)), w = Math.floor(ch.w / f), h = Math.floor(ch.h / f); cv.width = w; cv.height = h;
    var g = cv.getContext('2d'), id = g.createImageData(w, h), D = id.data, COL = [[16, 30, 36], [159, 216, 230], [61, 220, 132], [255, 107, 87]];
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var best = 0;
      for (var dy = 0; dy < f; dy++) for (var dx = 0; dx < f; dx++) { var v = ch.cls[(y * f + dy) * ch.w + x * f + dx]; if (v > best) best = v; }
      var j = (y * w + x) * 4, c = COL[best]; D[j] = c[0]; D[j + 1] = c[1]; D[j + 2] = c[2]; D[j + 3] = 255;
    }
    g.putImageData(id, 0, 0); $('cmpWrap').hidden = false;
    var u = b.pxArea ? ' m²' : ' px', before = ch.stable + ch.loss, net = before ? Math.round(100 * (ch.gain - ch.loss) / before) : null;
    var ps = PE.phase(a.date).signal !== PE.phase(b.date).signal;
    $('cmpTxt').textContent = 'De ' + a.date + ' a ' + b.date + ': se mantienen ' + nf0.format(ch.stable) + u + ', aparecen ' + nf0.format(ch.gain) + u + ' y desaparecen ' + nf0.format(ch.loss) + u +
      (net === null ? '.' : '. Cambio neto de superficie: ' + (net > 0 ? '+' : '') + net + ' %.') + (ps ? ' Las dos imágenes son de fases distintas del ciclo: parte del cambio puede ser estacional y no poblacional.' : '') +
      (a.gsd && b.gsd && Math.max(a.gsd, b.gsd) / Math.min(a.gsd, b.gsd) > 1.5 ? ' Los tamaños de píxel difieren mucho: los bordes de cada grupo no son comparables.' : '');
  });
  $('serCsv').addEventListener('click', function () {
    if (!T.recs.length) { A.toast('La serie está vacía.'); return; }
    var rows = ['fecha,temporada,colonia,codigo,etiqueta,fase_adelia,fase_papua,senal,pixel_m,superficie_m2,grupos,parejas_min,parejas_central,parejas_max,metodo,sintetica'];
    T.recs.forEach(function (r) {
      var ph = PE.phase(r.date);
      rows.push([r.date, PE.seasonLabel(r.season), '"' + byId[r.site].n + '"', r.site, '"' + String(r.label).replace(/"/g, "'") + '"', ph.adelia, ph.papua, ph.signal, r.gsd ? r.gsd.toFixed(3) : '', r.area ? r.area.toFixed(1) : '', r.groups,
        r.pairs ? r.pairs[0] : '', r.pairs ? r.pairs[1] : '', r.pairs ? r.pairs[2] : '', r.method, r.synth ? 'si' : 'no'].join(','));
    });
    A.save('serie_detecciones.csv', rows.join('\n') + '\n');
  });
  $('serJson').addEventListener('click', function () { if (!T.recs.length) { A.toast('La serie está vacía.'); return; } A.save('serie_detecciones.json', JSON.stringify({ formato: 'pinguineras-carlini-serie-1', detecciones: T.recs })); });
  $('serImport').addEventListener('change', function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    f.text().then(function (txt) {
      var d = JSON.parse(txt), list = Array.isArray(d) ? d : d.detecciones, n = 0;
      if (!Array.isArray(list)) throw new Error('formato');
      list.forEach(function (r) { if (r && r.id && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && byId[r.site] && !T.recs.some(function (x) { return x.id === r.id; })) { r.season = PE.season(r.date); T.recs.push(r); n++; } });
      persist(); renderRecs(); drawChart(); A.toast(n ? 'Se importaron ' + n + ' detecciones.' : 'El archivo no traía detecciones nuevas.');
    }).catch(function () { A.toast('El archivo no es una serie exportada por esta herramienta.'); });
  });
  document.addEventListener('pc:scene', function () { var c = A.current(), sc = c ? c.scene : (window.__app && window.__app.S.scene); if (sc) { $('recDate').value = sc.date || ''; $('recLabel').value = sc.synthetic ? 'escena sintética' : ''; } });

  /* ---------- arranque ---------- */
  var mn = 1e9; R.sites.forEach(function (s) { Object.keys(s.sp).forEach(function (k) { if (s.sp[k][0][0] < mn) mn = s.sp[k][0][0]; }); });
  var sy = $('spanYears'); if (sy) sy.textContent = 'desde ' + PE.seasonLabel(mn) + ' (Punta Stranger desde 1965/66)';
  function all() { drawMap(); drawChart(); }
  siteInfo(); renderRecs(); all();
  if (window.PC_WEB && !T.recs.length) fetch('datos/serie_potter.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (d && Array.isArray(d.detecciones) && !T.recs.length) { T.recs = d.detecciones; renderRecs(); drawChart(); }
  }).catch(function () {});
  if (window.ResizeObserver) new ResizeObserver(all).observe($('regMap').parentElement); else window.addEventListener('resize', all);
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', all);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(all);
  var sc0 = window.__app && window.__app.S.scene; if (sc0) { $('recDate').value = sc0.date || ''; }
  window.__tiempo = { T: T, selectSite: selectSite };
})();
