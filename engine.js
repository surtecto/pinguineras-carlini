/* Motor de detección de pingüineras por guano. Funciones puras, sin DOM. */
(function (root) {
  'use strict';
  var PE = {};
  var EPS = 1e-6;

  /* ---------- utilidades ---------- */
  PE.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  function sampleValues(arrs, valid, maxN) {
    var N = arrs[0].length, step = Math.max(1, Math.floor((N * arrs.length) / maxN));
    var out = [];
    for (var k = 0; k < arrs.length; k++) {
      var a = arrs[k];
      for (var i = (k * 7) % step; i < N; i += step) {
        if (valid && !valid[i]) continue;
        var v = a[i];
        if (v === v) out.push(v);
      }
    }
    var f = Float32Array.from(out);
    f.sort();
    return f;
  }
  function pct(sorted, p) {
    if (!sorted.length) return 0;
    var i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
    return sorted[i];
  }
  PE.pct = pct;

  /* ---------- escena ---------- */
  PE.makeScene = function (o) {
    var s = {
      w: o.w, h: o.h, bands: o.bands, n: o.bands.length,
      map: o.map || { r: 0, g: Math.min(1, o.bands.length - 1), b: Math.min(2, o.bands.length - 1), nir: -1, swir: -1 },
      eightBit: !!o.eightBit, valid: o.valid || null,
      pxArea: o.pxArea || 0, gsdSource: o.gsdSource || '', geo: o.geo || null,
      truth: o.truth || null, name: o.name || '', synthetic: !!o.synthetic, note: o.note || '', dem: o.dem || null, date: o.date || ''
    };
    PE.prepare(s);
    return s;
  };

  /* Escala común para todas las bandas: conserva los cocientes entre bandas. */
  PE.prepare = function (s) {
    var m = s.map;
    if (s.eightBit) { s.ref = 255; s.lo = 0; return; }
    var vis = [];
    [m.r, m.g, m.b].forEach(function (i) { if (i >= 0 && vis.indexOf(s.bands[i]) < 0) vis.push(s.bands[i]); });
    var sv = sampleValues(vis, s.valid, 240000);
    var ref = pct(sv, 99.5);
    s.ref = ref > 0 ? ref : 1;
    s.lo = Math.max(0, pct(sv, 1) / s.ref);
  };

  PE.gsd = function (s) { return s.pxArea > 0 ? Math.sqrt(s.pxArea) : 0; };

  PE.indicesAt = function (s, i) {
    var m = s.map, inv = 1 / s.ref;
    var r = s.bands[m.r][i] * inv, g = s.bands[m.g][i] * inv, b = s.bands[m.b][i] * inv;
    var o = { r: r, g: g, b: b, L: (r + g + b) / 3, RI: (r - b) / (r + b + EPS) };
    var rb = (r + b) / 2;
    o.AX = (rb - g) / (rb + g + EPS);
    if (m.nir >= 0) {
      var nir = s.bands[m.nir][i] * inv;
      o.nir = nir; o.NDVI = (nir - r) / (nir + r + EPS); o.NDWI = (g - nir) / (g + nir + EPS);
    }
    if (m.swir >= 0) {
      var sw = s.bands[m.swir][i] * inv;
      o.swir = sw; o.NDSI = (g - sw) / (g + sw + EPS);
    }
    return o;
  };

  /* ---------- visualización ---------- */
  function ramp(t, out, j) { // 0 azul hielo -> 0.5 hueso -> 1 coral
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var r, g, b;
    if (t < 0.5) { var u = t * 2; r = 24 + u * 216; g = 62 + u * 172; b = 92 + u * 128; }
    else { var v = (t - 0.5) * 2; r = 240 - v * 22; g = 234 - v * 160; b = 220 - v * 150; }
    out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = 255;
  }
  PE.renderBase = function (s, mode, gamma, out) {
    var N = s.w * s.h, m = s.map, inv = 1 / s.ref, lo = s.lo, span = 1 / Math.max(1e-6, 1 - lo);
    var R = s.bands[m.r], G = s.bands[m.g], B = s.bands[m.b];
    var NIR = m.nir >= 0 ? s.bands[m.nir] : null;
    var lut = new Uint8Array(1025);
    for (var k = 0; k <= 1024; k++) lut[k] = Math.round(255 * Math.pow(k / 1024, gamma));
    function st(v) { var t = (v * inv - lo) * span; t = t < 0 ? 0 : t > 1 ? 1 : t; return lut[(t * 1024) | 0]; }
    var EL = s.elev || null, TR = s.terrain || null, e0 = 0, e1 = 1;
    if (EL && mode === 'elev') { var se = sampleValues([EL], s.valid, 60000); e0 = pct(se, 1); e1 = Math.max(e0 + 1e-3, pct(se, 99)); }
    for (var i = 0, j = 0; i < N; i++, j += 4) {
      if (s.valid && !s.valid[i]) { out[j] = 20; out[j + 1] = 28; out[j + 2] = 36; out[j + 3] = 255; continue; }
      if (mode === 'cir' && NIR) { out[j] = st(NIR[i]); out[j + 1] = st(R[i]); out[j + 2] = st(G[i]); out[j + 3] = 255; }
      else if (mode === 'ri') { ramp(0.5 + 1.6 * (R[i] - B[i]) / (R[i] + B[i] + EPS), out, j); }
      else if (mode === 'ax') { var rb = (R[i] + B[i]) / 2; ramp(0.5 + 6 * (rb - G[i]) / (rb + G[i] + EPS), out, j); }
      else if (mode === 'elev' && EL) { ramp((EL[i] - e0) / (e1 - e0), out, j); }
      else if (mode === 'slope' && TR) { ramp(TR.slope[i] / 45, out, j); }
      else if (mode === 'shade' && TR) { var sh = TR.shade[i]; out[j] = out[j + 1] = out[j + 2] = sh; out[j + 3] = 255; }
      else if (mode === 'ndvi' && NIR) { ramp(0.5 + 0.9 * (NIR[i] - R[i]) / (NIR[i] + R[i] + EPS), out, j); }
      else { out[j] = st(R[i]); out[j + 1] = st(G[i]); out[j + 2] = st(B[i]); out[j + 3] = 255; }
    }
  };

  /* ---------- clasificación por regla espectral ---------- */
  PE.defaultRule = function () {
    return { ri: 0.08, ax: 0.0, lmin: 0.10, lmax: 0.92, ndvi: 0.35, ndwi: 0.10, ndsi: 0.40, rel: false, kri: 3.5, kax: 2.0 };
  };
  /* mediana y dispersión robusta del enrojecimiento y del tinte rosado sobre el suelo sin agua ni nieve */
  PE.landStats = function (s) {
    var N = s.w * s.h, m = s.map, inv = 1 / s.ref, R = s.bands[m.r], G = s.bands[m.g], B = s.bands[m.b];
    var NIR = m.nir >= 0 ? s.bands[m.nir] : null, SW = m.swir >= 0 ? s.bands[m.swir] : null, V = s.valid, ri = [], ax = [], step = Math.max(1, Math.floor(N / 120000));
    for (var i = 0; i < N; i += step) {
      if (V && !V[i]) continue;
      var r = R[i] * inv, g = G[i] * inv, b = B[i] * inv, L = (r + g + b) / 3;
      if (L < 0.03 || L > 0.6) continue;
      if (NIR) { var n = NIR[i] * inv; if ((g - n) / (g + n + EPS) > 0) continue; if (n < 0.04) continue; }
      if (SW) { var w = SW[i] * inv; if ((g - w) / (g + w + EPS) > 0.4) continue; }
      ri.push((r - b) / (r + b + EPS)); var rb = (r + b) / 2; ax.push((rb - g) / (rb + g + EPS));
    }
    function ms(a) { var f = Float32Array.from(a); f.sort(); var med = pct(f, 50), d = Float32Array.from(f, function (v) { return Math.abs(v - med); }); d.sort(); return [med, Math.max(0.004, 1.4826 * pct(d, 50))]; }
    if (ri.length < 200) return null;
    var a = ms(ri), c = ms(ax);
    return { riMed: a[0], riMad: a[1], axMed: c[0], axMad: c[1], n: ri.length };
  };
  PE.classifyRule = function (s, p) {
    var N = s.w * s.h, m = s.map, inv = 1 / s.ref, mask = new Uint8Array(N);
    var R = s.bands[m.r], G = s.bands[m.g], B = s.bands[m.b];
    var NIR = m.nir >= 0 ? s.bands[m.nir] : null, SW = m.swir >= 0 ? s.bands[m.swir] : null;
    var V = s.valid, tRi = p.ri, tAx = p.ax;
    if (p.rel) { var st = PE.landStats(s); s.landStats = st; if (st) { tRi = st.riMed + p.kri * st.riMad; tAx = st.axMed + p.kax * st.axMad; } }
    s.thrUsed = { ri: tRi, ax: tAx };
    for (var i = 0; i < N; i++) {
      if (V && !V[i]) continue;
      var r = R[i] * inv, g = G[i] * inv, b = B[i] * inv;
      var L = (r + g + b) / 3;
      if (L < p.lmin || L > p.lmax) continue;
      if ((r - b) / (r + b + EPS) < tRi) continue;
      var rb = (r + b) / 2;
      if ((rb - g) / (rb + g + EPS) < tAx) continue;
      if (NIR) {
        var n = NIR[i] * inv;
        if ((n - r) / (n + r + EPS) > p.ndvi) continue;
        if ((g - n) / (g + n + EPS) > p.ndwi) continue;
      }
      if (SW) { var w = SW[i] * inv; if ((g - w) / (g + w + EPS) > p.ndsi) continue; }
      mask[i] = 1;
    }
    return mask;
  };

  /* suelo desnudo: ni agua, ni nieve, ni vegetación, ni sombra o brillo extremos (los mismos filtros de la regla, sin el color) */
  PE.groundMask = function (s, p) {
    var N = s.w * s.h, m = s.map, inv = 1 / s.ref, mask = new Uint8Array(N);
    var R = s.bands[m.r], G = s.bands[m.g], B = s.bands[m.b];
    var NIR = m.nir >= 0 ? s.bands[m.nir] : null, SW = m.swir >= 0 ? s.bands[m.swir] : null, V = s.valid;
    for (var i = 0; i < N; i++) {
      if (V && !V[i]) continue;
      var r = R[i] * inv, g = G[i] * inv, b = B[i] * inv, L = (r + g + b) / 3;
      if (L < p.lmin || L > p.lmax) continue;
      if (NIR) { var n = NIR[i] * inv; if ((n - r) / (n + r + EPS) > p.ndvi) continue; if ((g - n) / (g + n + EPS) > p.ndwi) continue; }
      if (SW) { var w = SW[i] * inv; if ((g - w) / (g + w + EPS) > p.ndsi) continue; }
      mask[i] = 1;
    }
    return mask;
  };

  /* ---------- clasificación supervisada: máxima verosimilitud gaussiana ---------- */
  PE.featureBands = function (s) {
    var m = s.map, idx = [];
    [m.r, m.g, m.b, m.nir, m.swir].forEach(function (i) { if (i >= 0 && idx.indexOf(i) < 0) idx.push(i); });
    return idx;
  };
  function invertSPD(A, d) { // Gauss-Jordan; devuelve {inv, logdet}
    var M = new Float64Array(d * 2 * d), i, j, k;
    for (i = 0; i < d; i++) { for (j = 0; j < d; j++) M[i * 2 * d + j] = A[i * d + j]; M[i * 2 * d + d + i] = 1; }
    var logdet = 0;
    for (i = 0; i < d; i++) {
      var p = i, best = Math.abs(M[i * 2 * d + i]);
      for (k = i + 1; k < d; k++) { var v = Math.abs(M[k * 2 * d + i]); if (v > best) { best = v; p = k; } }
      if (best < 1e-14) return null;
      if (p !== i) for (j = 0; j < 2 * d; j++) { var t = M[i * 2 * d + j]; M[i * 2 * d + j] = M[p * 2 * d + j]; M[p * 2 * d + j] = t; }
      var piv = M[i * 2 * d + i];
      logdet += Math.log(Math.abs(piv));
      for (j = 0; j < 2 * d; j++) M[i * 2 * d + j] /= piv;
      for (k = 0; k < d; k++) {
        if (k === i) continue;
        var f = M[k * 2 * d + i];
        if (f !== 0) for (j = 0; j < 2 * d; j++) M[k * 2 * d + j] -= f * M[i * 2 * d + j];
      }
    }
    var inv = new Float64Array(d * d);
    for (i = 0; i < d; i++) for (j = 0; j < d; j++) inv[i * d + j] = M[i * 2 * d + d + j];
    return { inv: inv, logdet: logdet };
  }
  /* samples: [{cls, x, y, r}] en píxeles de la escena */
  PE.trainML = function (s, samples) {
    var fb = PE.featureBands(s), d = fb.length, inv = 1 / s.ref, w = s.w, h = s.h;
    var byCls = {};
    samples.forEach(function (sm) {
      var acc = byCls[sm.cls] || (byCls[sm.cls] = { n: 0, sum: new Float64Array(d), sq: new Float64Array(d * d) });
      var r = Math.max(0, sm.r | 0), x0 = Math.round(sm.x), y0 = Math.round(sm.y), v = new Float64Array(d);
      for (var y = y0 - r; y <= y0 + r; y++) {
        if (y < 0 || y >= h) continue;
        for (var x = x0 - r; x <= x0 + r; x++) {
          if (x < 0 || x >= w) continue;
          if ((x - x0) * (x - x0) + (y - y0) * (y - y0) > r * r + 0.5) continue;
          var i = y * w + x;
          if (s.valid && !s.valid[i]) continue;
          for (var a = 0; a < d; a++) { v[a] = s.bands[fb[a]][i] * inv; acc.sum[a] += v[a]; }
          for (a = 0; a < d; a++) for (var b = 0; b < d; b++) acc.sq[a * d + b] += v[a] * v[b];
          acc.n++;
        }
      }
    });
    var model = { fb: fb, d: d, cls: [] };
    Object.keys(byCls).forEach(function (id) {
      var acc = byCls[id];
      if (acc.n < d + 3) return;
      var mean = new Float64Array(d), cov = new Float64Array(d * d), a, b;
      for (a = 0; a < d; a++) mean[a] = acc.sum[a] / acc.n;
      for (a = 0; a < d; a++) for (b = 0; b < d; b++) cov[a * d + b] = acc.sq[a * d + b] / acc.n - mean[a] * mean[b];
      for (a = 0; a < d; a++) cov[a * d + a] += 4e-5; // piso de varianza: evita clases degeneradas
      var iv = invertSPD(cov, d);
      if (!iv) return;
      model.cls.push({ id: id, n: acc.n, mean: mean, icov: iv.inv, logdet: iv.logdet });
    });
    return model;
  };
  PE.classifyML = function (s, model, tol, guanoId) {
    var N = s.w * s.h, mask = new Uint8Array(N), d = model.d, fb = model.fb, inv = 1 / s.ref;
    var C = model.cls, nc = C.length, gi = -1;
    for (var c = 0; c < nc; c++) if (C[c].id === guanoId) gi = c;
    if (gi < 0) return mask;
    var B = fb.map(function (i) { return s.bands[i]; }), v = new Float64Array(d), V = s.valid;
    for (var i = 0; i < N; i++) {
      if (V && !V[i]) continue;
      for (var a = 0; a < d; a++) v[a] = B[a][i] * inv;
      var best = Infinity, bi = -1, dg = 0;
      for (c = 0; c < nc; c++) {
        var cl = C[c], mu = cl.mean, ic = cl.icov, q = 0;
        for (a = 0; a < d; a++) {
          var da = v[a] - mu[a], acc = 0;
          for (var b = 0; b < d; b++) acc += ic[a * d + b] * (v[b] - mu[b]);
          q += da * acc;
        }
        if (c === gi) dg = q;
        var sc = q + cl.logdet;
        if (sc < best) { best = sc; bi = c; }
      }
      if (bi === gi && dg <= tol) mask[i] = 1;
    }
    return mask;
  };

  /* ---------- morfología binaria (ventana cuadrada) ---------- */
  function boxPass(src, w, h, r, erode) {
    var tmp = new Uint8Array(w * h), out = new Uint8Array(w * h), x, y, s, a, b, len;
    for (y = 0; y < h; y++) {
      var row = y * w; s = 0;
      for (x = 0; x <= Math.min(r, w - 1); x++) s += src[row + x];
      for (x = 0; x < w; x++) {
        a = Math.max(0, x - r); b = Math.min(w - 1, x + r); len = b - a + 1;
        tmp[row + x] = erode ? (s === len ? 1 : 0) : (s > 0 ? 1 : 0);
        if (x + r + 1 < w) s += src[row + x + r + 1];
        if (x - r >= 0) s -= src[row + x - r];
      }
    }
    for (x = 0; x < w; x++) {
      s = 0;
      for (y = 0; y <= Math.min(r, h - 1); y++) s += tmp[y * w + x];
      for (y = 0; y < h; y++) {
        a = Math.max(0, y - r); b = Math.min(h - 1, y + r); len = b - a + 1;
        out[y * w + x] = erode ? (s === len ? 1 : 0) : (s > 0 ? 1 : 0);
        if (y + r + 1 < h) s += tmp[(y + r + 1) * w + x];
        if (y - r >= 0) s -= tmp[(y - r) * w + x];
      }
    }
    return out;
  }
  PE.dilate = function (m, w, h, r) { return r > 0 ? boxPass(m, w, h, r, false) : m; };
  PE.erode = function (m, w, h, r) { return r > 0 ? boxPass(m, w, h, r, true) : m; };
  PE.morph = function (mask, w, h, open, close) {
    var m = mask;
    if (open > 0) m = PE.dilate(PE.erode(m, w, h, open), w, h, open);
    if (close > 0) m = PE.erode(PE.dilate(m, w, h, close), w, h, close);
    return m;
  };

  /* ---------- componentes conexos (8 vecinos) ---------- */
  PE.components = function (mask, w, h, minPx) {
    var N = w * h, labels = new Int32Array(N), stack = new Int32Array(N), raw = [];
    for (var i0 = 0; i0 < N; i0++) {
      if (!mask[i0] || labels[i0]) continue;
      var id = raw.length + 1, sp = 0, area = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      stack[sp++] = i0; labels[i0] = id;
      while (sp > 0) {
        var i = stack[--sp], x = i % w, y = (i - x) / w;
        area++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (var dy = -1; dy <= 1; dy++) {
          var yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx; if (xx < 0 || xx >= w) continue;
            var j = yy * w + xx;
            if (mask[j] && !labels[j]) { labels[j] = id; stack[sp++] = j; }
          }
        }
      }
      raw.push({ area: area, cx: sx / area + 0.5, cy: sy / area + 0.5, x0: x0, y0: y0, x1: x1, y1: y1 });
    }
    var order = raw.map(function (c, k) { return k; }).filter(function (k) { return raw[k].area >= minPx; });
    order.sort(function (a, b) { return raw[b].area - raw[a].area; });
    var remap = new Int32Array(raw.length + 1), comps = [];
    order.forEach(function (k, n) { remap[k + 1] = n + 1; var c = raw[k]; c.id = n + 1; comps.push(c); });
    var clean = new Uint8Array(N);
    for (var q = 0; q < N; q++) { var l = remap[labels[q]]; labels[q] = l; if (l) clean[q] = 1; }
    return { labels: labels, comps: comps, mask: clean };
  };

  /* ---------- contornos de un componente como anillos de polígono (coordenadas de píxel) ---------- */
  PE.traceRings = function (labels, w, h, comp) {
    var id = comp.id, W1 = w + 1, from = [], to = [], dir = [], start = new Map();
    function lab(x, y) { return x < 0 || y < 0 || x >= w || y >= h ? 0 : labels[y * w + x]; }
    function add(ax, ay, bx, by, d) {
      var k = ay * W1 + ax, e = from.length;
      from.push(k); to.push(by * W1 + bx); dir.push(d);
      var l = start.get(k); if (l) l.push(e); else start.set(k, [e]);
    }
    for (var y = comp.y0; y <= comp.y1; y++) for (var x = comp.x0; x <= comp.x1; x++) {
      if (labels[y * w + x] !== id) continue;
      if (lab(x, y - 1) !== id) add(x, y, x + 1, y, 0);         // este
      if (lab(x + 1, y) !== id) add(x + 1, y, x + 1, y + 1, 1); // sur
      if (lab(x, y + 1) !== id) add(x + 1, y + 1, x, y + 1, 2); // oeste
      if (lab(x - 1, y) !== id) add(x, y + 1, x, y, 3);         // norte
    }
    var used = new Uint8Array(from.length), rings = [];
    for (var e0 = 0; e0 < from.length; e0++) {
      if (used[e0]) continue;
      var pts = [], cur = e0, v0 = from[e0], guard = 0;
      while (cur >= 0 && guard++ < from.length + 2) {
        used[cur] = 1;
        var k = from[cur];
        pts.push([k % W1, (k / W1) | 0, dir[cur]]);
        var t = to[cur];
        if (t === v0) break;
        var outs = start.get(t) || [], next = -1, pref = [(dir[cur] + 1) % 4, dir[cur], (dir[cur] + 3) % 4];
        for (var p = 0; p < 3 && next < 0; p++) for (var q = 0; q < outs.length; q++) {
          if (!used[outs[q]] && dir[outs[q]] === pref[p]) { next = outs[q]; break; }
        }
        cur = next;
      }
      var ring = [];
      for (var n = 0; n < pts.length; n++) { // descartar vértices colineales
        var prev = pts[(n + pts.length - 1) % pts.length];
        if (prev[2] !== pts[n][2]) ring.push([pts[n][0], pts[n][1]]);
      }
      if (ring.length < 4) continue;
      var A = 0;
      for (n = 0; n < ring.length; n++) { var a = ring[n], b = ring[(n + 1) % ring.length]; A += a[0] * b[1] - b[0] * a[1]; }
      rings.push({ pts: ring, area: A / 2, probe: [pts[0][0] + [0.5, -0.5, -0.5, 0.5][pts[0][2]], pts[0][1] + [0.5, 0.5, -0.5, -0.5][pts[0][2]]] });
    }
    return rings;
  };
  function pointInRing(pt, ring) {
    var inside = false, x = pt[0], y = pt[1];
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  /* Devuelve una lista de polígonos: cada uno = [exterior, hueco, hueco...] */
  PE.polygonsOf = function (labels, w, h, comp) {
    var rings = PE.traceRings(labels, w, h, comp);
    var outers = rings.filter(function (r) { return r.area > 0; }), holes = rings.filter(function (r) { return r.area < 0; });
    var polys = outers.map(function (o) { return [o.pts]; });
    holes.forEach(function (hl) {
      for (var k = 0; k < outers.length; k++) if (pointInRing(hl.probe, outers[k].pts)) { polys[k].push(hl.pts); return; }
    });
    return polys;
  };

  /* ---------- conteo de individuos: manchas oscuras compactas ---------- */
  function boxBlur(src, w, h, r) {
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h), x, y, s, a, b;
    for (y = 0; y < h; y++) {
      var row = y * w; s = 0;
      for (x = 0; x <= Math.min(r, w - 1); x++) s += src[row + x];
      for (x = 0; x < w; x++) {
        a = Math.max(0, x - r); b = Math.min(w - 1, x + r);
        tmp[row + x] = s / (b - a + 1);
        if (x + r + 1 < w) s += src[row + x + r + 1];
        if (x - r >= 0) s -= src[row + x - r];
      }
    }
    for (x = 0; x < w; x++) {
      s = 0;
      for (y = 0; y <= Math.min(r, h - 1); y++) s += tmp[y * w + x];
      for (y = 0; y < h; y++) {
        a = Math.max(0, y - r); b = Math.min(h - 1, y + r);
        out[y * w + x] = s / (b - a + 1);
        if (y + r + 1 < h) s += tmp[(y + r + 1) * w + x];
        if (y - r >= 0) s -= tmp[(y - r) * w + x];
      }
    }
    return out;
  }
  PE.boxBlur = boxBlur;
  /* o: {diamPx, k, within: Uint8Array|null} */
  PE.detectBlobs = function (s, o) {
    var w = s.w, h = s.h, N = w * h, m = s.map, inv = 1 / s.ref;
    var R = s.bands[m.r], G = s.bands[m.g], B = s.bands[m.b], L = new Float32Array(N);
    for (var i = 0; i < N; i++) L[i] = (R[i] + G[i] + B[i]) * inv / 3;
    var d = Math.max(2, o.diamPx), r1 = Math.max(1, Math.round(d / 4)), r2 = Math.max(r1 + 2, Math.round(d * 1.5));
    var core = boxBlur(boxBlur(L, w, h, r1), w, h, r1), bg = boxBlur(boxBlur(L, w, h, r2), w, h, r2);
    var resp = new Float32Array(N), smp = [];
    var step = Math.max(1, Math.floor(N / 60000));
    for (i = 0; i < N; i++) { resp[i] = bg[i] - core[i]; }
    for (i = 0; i < N; i += step) if (!s.valid || s.valid[i]) smp.push(resp[i]);
    var sv = Float32Array.from(smp); sv.sort();
    var med = pct(sv, 50), dev = Float32Array.from(sv, function (v) { return Math.abs(v - med); }); dev.sort();
    var sigma = Math.max(1e-4, 1.4826 * pct(dev, 50)), thr = med + o.k * sigma;
    var rn = Math.max(1, Math.round(d / 2)), pts = [];
    for (var y = rn; y < h - rn; y++) for (var x = rn; x < w - rn; x++) {
      i = y * w + x;
      var v = resp[i];
      if (v < thr) continue;
      if (o.within && !o.within[i]) continue;
      if (s.valid && !s.valid[i]) continue;
      var isMax = true;
      for (var dy = -rn; dy <= rn && isMax; dy++) for (var dx = -rn; dx <= rn; dx++) {
        var u = resp[i + dy * w + dx];
        if (u > v || (u === v && (dy < 0 || (dy === 0 && dx < 0)))) { isMax = false; break; }
      }
      if (isMax) pts.push({ x: x + 0.5, y: y + 0.5, s: (v - med) / sigma });
    }
    return pts;
  };

  /* ---------- georreferencia ---------- */
  var WGS_A = 6378137, WGS_F = 1 / 298.257223563, E2 = WGS_F * (2 - WGS_F), E1 = Math.sqrt(E2);
  var D2R = Math.PI / 180;
  PE.utmToLonLat = function (e, n, zone, south) {
    var k0 = 0.9996, x = e - 500000, y = south ? n - 10000000 : n, ep2 = E2 / (1 - E2);
    var M = y / k0, mu = M / (WGS_A * (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 * E2 * E2 / 256));
    var e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
    var p1 = mu + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
      + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu) + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    var sp = Math.sin(p1), cp = Math.cos(p1), tp = Math.tan(p1);
    var C1 = ep2 * cp * cp, T1 = tp * tp, N1 = WGS_A / Math.sqrt(1 - E2 * sp * sp), R1 = WGS_A * (1 - E2) / Math.pow(1 - E2 * sp * sp, 1.5), D = x / (N1 * k0);
    var lat = p1 - (N1 * tp / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4) / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);
    var lon = (D - (1 + 2 * T1 + C1) * D * D * D / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / cp;
    return [(zone - 1) * 6 - 180 + 3 + lon / D2R, lat / D2R];
  };
  function psT(phi) { var sn = Math.sin(phi); return Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - E1 * sn) / (1 + E1 * sn), E1 / 2); }
  function psM(phi) { var sn = Math.sin(phi); return Math.cos(phi) / Math.sqrt(1 - E2 * sn * sn); }
  /* EPSG:3031, estereográfica polar antártica, latitud de escala verdadera 71° S */
  PE.ps3031ToLonLat = function (x, y) {
    var pc = 71 * D2R, rho = Math.sqrt(x * x + y * y);
    if (rho < 1e-9) return [0, -90];
    var t = rho * psT(pc) / (WGS_A * psM(pc)), chi = Math.PI / 2 - 2 * Math.atan(t);
    var e4 = E2 * E2, e6 = e4 * E2, e8 = e4 * e4;
    var phi = chi + (E2 / 2 + 5 * e4 / 24 + e6 / 12 + 13 * e8 / 360) * Math.sin(2 * chi) + (7 * e4 / 48 + 29 * e6 / 240 + 811 * e8 / 11520) * Math.sin(4 * chi)
      + (7 * e6 / 120 + 81 * e8 / 1120) * Math.sin(6 * chi) + (4279 * e8 / 161280) * Math.sin(8 * chi);
    return [Math.atan2(x, y) / D2R, -phi / D2R];
  };
  /* factor de escala lineal de EPSG:3031 a una latitud dada (grados, negativa al sur) */
  PE.ps3031Scale = function (latDeg) {
    var phi = Math.abs(latDeg) * D2R, pc = 71 * D2R;
    return (psM(pc) / psT(pc)) * (psT(phi) / psM(phi));
  };
  PE.pxToCRS = function (geo, px, py) { return [geo.ox + px * geo.rx, geo.oy + py * geo.ry]; };
  PE.crsKind = function (epsg) {
    if (epsg === 4326 || epsg === 4979) return 'geo';
    if (epsg === 3031) return 'ps';
    if (epsg >= 32601 && epsg <= 32660) return 'utmN';
    if (epsg >= 32701 && epsg <= 32760) return 'utmS';
    return null;
  };
  PE.toLonLat = function (geo, X, Y) {
    var k = PE.crsKind(geo.epsg);
    if (k === 'geo') return [X, Y];
    if (k === 'ps') return PE.ps3031ToLonLat(X, Y);
    if (k === 'utmN') return PE.utmToLonLat(X, Y, geo.epsg - 32600, false);
    if (k === 'utmS') return PE.utmToLonLat(X, Y, geo.epsg - 32700, true);
    return null;
  };
  /* área de terreno de un píxel (m²) según el sistema de referencia */
  PE.pixelArea = function (geo, w, h) {
    var k = PE.crsKind(geo.epsg), ax = Math.abs(geo.rx), ay = Math.abs(geo.ry);
    var c = PE.pxToCRS(geo, w / 2, h / 2);
    if (k === 'geo') {
      var lat = c[1] * D2R;
      var mLat = 111132.92 - 559.82 * Math.cos(2 * lat) + 1.175 * Math.cos(4 * lat);
      var mLon = 111412.84 * Math.cos(lat) - 93.5 * Math.cos(3 * lat);
      return ax * mLon * ay * mLat;
    }
    if (k === 'ps') { var ll = PE.ps3031ToLonLat(c[0], c[1]), sc = PE.ps3031Scale(ll[1]); return (ax / sc) * (ay / sc); }
    return ax * ay; // UTM u otro sistema métrico: distorsión despreciable a esta escala
  };

  /* ---------- escenas sintéticas de demostración ---------- */
  function makeNoise(seed) {
    var rnd = PE.rng(seed), S = 64, lat = new Float32Array(S * S);
    for (var i = 0; i < S * S; i++) lat[i] = rnd();
    function v(x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      var x0 = ((xi % S) + S) % S, y0 = ((yi % S) + S) % S, x1 = (x0 + 1) % S, y1 = (y0 + 1) % S;
      var a = lat[y0 * S + x0], b = lat[y0 * S + x1], c = lat[y1 * S + x0], d = lat[y1 * S + x1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }
    return function (x, y) { return (v(x, y) + 0.5 * v(x * 2.03, y * 2.03) + 0.25 * v(x * 4.1, y * 4.1) + 0.125 * v(x * 8.2, y * 8.2)) / 1.875; };
  }
  function inBlob(x, y, b, nz) {
    var c = Math.cos(b.rot), sn = Math.sin(b.rot), dx = x - b.cx, dy = y - b.cy;
    var u = (dx * c + dy * sn) / b.rx, v = (-dx * sn + dy * c) / b.ry;
    return u * u + v * v < 1 + 0.7 * (nz(x / 22 + b.cx, y / 22 + b.cy) - 0.5);
  }
  PE.demoSatellite = function (variant) {
    var W = 900, H = 620, N = W * H, rnd = PE.rng(132), n1 = makeNoise(7), n2 = makeNoise(21), n3 = makeNoise(58), n4 = makeNoise(90);
    // reflectancias de base [R, G, B, NIR] y amplitud de textura
    var K = {
      mar: [0.06, 0.10, 0.14, 0.02, 0.15], playa: [0.33, 0.33, 0.34, 0.36, 0.14], roca: [0.20, 0.20, 0.21, 0.22, 0.34],
      nieve: [0.93, 0.95, 0.98, 0.80, 0.03], musgo: [0.20, 0.30, 0.14, 0.55, 0.22], guano: [0.62, 0.47, 0.42, 0.58, 0.10],
      barro: [0.36, 0.292, 0.215, 0.30, 0.10], liquen: [0.55, 0.40, 0.18, 0.40, 0.16], antiguo: [0.50, 0.458, 0.40, 0.47, 0.08]
    };
    var guano = [
      { cx: 250, cy: 170, rx: 62, ry: 34, rot: 0.3 }, { cx: 395, cy: 235, rx: 44, ry: 26, rot: -0.5 }, { cx: 530, cy: 300, rx: 58, ry: 30, rot: 0.15 },
      { cx: 150, cy: 300, rx: 30, ry: 20, rot: 0.9 }, { cx: 660, cy: 372, rx: 36, ry: 22, rot: -0.2 }, { cx: 330, cy: 352, rx: 22, ry: 15, rot: 0.6 },
      { cx: 472, cy: 402, rx: 15, ry: 11, rot: 0 }, { cx: 602, cy: 250, rx: 11, ry: 9, rot: 0.4 }, { cx: 215, cy: 395, rx: 9, ry: 7, rot: 0 }
    ];
    var barro = [{ cx: 742, cy: 470, rx: 40, ry: 20, rot: -0.35 }], liquen = [{ cx: 110, cy: 120, rx: 26, ry: 16, rot: 0.2 }, { cx: 760, cy: 210, rx: 20, ry: 14, rot: 1.0 }];
    var antiguo = [{ cx: 455, cy: 130, rx: 34, ry: 20, rot: -0.3 }];
    if (variant === 1) { // temporada posterior: dos grupos abandonados, uno crece, uno nuevo
      antiguo.push(guano[3], guano[7]); guano = guano.filter(function (g, k) { return k !== 3 && k !== 7; });
      guano[2] = { cx: 536, cy: 304, rx: 74, ry: 39, rot: 0.15 }; guano.push({ cx: 712, cy: 300, rx: 24, ry: 15, rot: 0.5 });
    }
    var dem = new Float32Array(N);
    var cls = new Uint8Array(N), truth = new Uint8Array(N), names = ['mar', 'playa', 'roca', 'nieve', 'musgo', 'guano', 'barro', 'liquen', 'antiguo'];
    var bands = [new Float32Array(N), new Float32Array(N), new Float32Array(N), new Float32Array(N)];
    function any(list, x, y) { for (var k = 0; k < list.length; k++) if (inBlob(x, y, list[k], n4)) return true; return false; }
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var u = x / W, v = y / H, i = y * W + x;
      var coast = 0.80 + 0.07 * Math.sin(u * 5.2 + 0.6) + 0.10 * (n1(u * 3.1, v * 3.1) - 0.5);
      var c = 2;
      if (v > coast) c = 0;
      else if (any(guano, x, y)) c = 5;
      else if (any(barro, x, y)) c = 6;
      else if (any(liquen, x, y)) c = 7;
      else if (any(antiguo, x, y)) c = 8;
      else if (v < 0.5 && n2(u * 2.4 + 3, v * 2.4) > 0.60 + v * 0.25) c = 3;
      else if (v > coast - 0.055) c = 1;
      else if (n3(u * 3.6, v * 3.6 + 9) > 0.63) c = 4;
      cls[i] = c; if (c === 5) truth[i] = 1;
      dem[i] = c === 0 ? 0 : Math.max(0.4, (coast - v) * 78 + (n2(u * 5 + 1, v * 5) - 0.5) * 16 + 1.5);
      var k = K[names[c]], tex = 1 + k[4] * ((rnd() - 0.5) * 1.1 + (n1(x / 9, y / 9) - 0.5) * 1.3);
      for (var b = 0; b < 4; b++) bands[b][i] = k[b] * tex;
    }
    var area = 0;
    for (var q = 0; q < N; q++) area += truth[q];
    for (b = 0; b < 4; b++) { // función de dispersión del sensor + reflectancia en enteros x10000
      var bl = boxBlur(bands[b], W, H, 1);
      for (q = 0; q < N; q++) bl[q] = Math.round(bl[q] * 10000);
      bands[b] = bl;
    }
    return PE.makeScene({
      w: W, h: H, bands: bands, map: { r: 0, g: 1, b: 2, nir: 3, swir: -1 }, pxArea: 0.25, gsdSource: 'de la escena sintética',
      truth: { mask: truth, areaM2: area * 0.25, groups: guano.length }, synthetic: true, dem: boxBlur(boxBlur(dem, W, H, 3), W, H, 3), date: variant === 1 ? '2024-12-30' : '2019-12-28',
      name: variant === 1 ? 'Escena sintética, temporada posterior (0,5 m/píxel)' : 'Escena satelital sintética (0,5 m/píxel, 4 bandas)',
      note: (variant === 1 ? 'La misma escena sintética cinco temporadas después: dos grupos abandonados, uno que creció y uno nuevo.' : 'Escena generada por computadora para probar el método: nueve grupos con guano fresco, un revolcadero de elefantes marinos, dos afloramientos con líquenes y un grupo abandonado con guano antiguo.') + ' Incluye un relieve inventado. No es una imagen real de Punta Stranger.'
    });
  };
  PE.demoDrone = function () {
    var W = 800, H = 560, N = W * H, rnd = PE.rng(2026), n1 = makeNoise(11), n2 = makeNoise(33);
    var R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), gu = new Uint8Array(N);
    var blobs = [{ cx: 300, cy: 250, rx: 215, ry: 140, rot: 0.2 }, { cx: 640, cy: 400, rx: 110, ry: 80, rot: -0.4 }];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x, g = inBlob(x, y, blobs[0], n2) || inBlob(x, y, blobs[1], n2);
      var tex = 1 + (g ? 0.10 : 0.26) * ((rnd() - 0.5) + (n1(x / 14, y / 14) - 0.5) * 1.5);
      gu[i] = g ? 1 : 0;
      if (g) { R[i] = 186 * tex; G[i] = 148 * tex; B[i] = 132 * tex; } else { R[i] = 112 * tex; G[i] = 112 * tex; B[i] = 116 * tex; }
    }
    function stamp(cx, cy, len, wid, rot, dark, belly) {
      var c = Math.cos(rot), sn = Math.sin(rot), r = Math.ceil(len);
      for (var yy = Math.floor(cy - r); yy <= cy + r; yy++) for (var xx = Math.floor(cx - r); xx <= cx + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        var dx = xx - cx, dy = yy - cy, u = (dx * c + dy * sn) / (len / 2), v = (-dx * sn + dy * c) / (wid / 2), d2 = u * u + v * v;
        if (d2 > 1) continue;
        var i2 = yy * W + xx, a = d2 > 0.7 ? 0.6 : 1;
        var isB = belly && u > 0.35 && Math.abs(v) < 0.45;
        var tr = isB ? 232 : dark, tg = isB ? 232 : dark, tb = isB ? 228 : dark + 4;
        R[i2] = R[i2] * (1 - a) + tr * a; G[i2] = G[i2] * (1 - a) + tg * a; B[i2] = B[i2] * (1 - a) + tb * a;
      }
    }
    var pts = [], tries = 0;
    while (pts.length < 150 && tries++ < 40000) {
      var px = 14 + rnd() * (W - 28), py = 14 + rnd() * (H - 28), on = gu[Math.floor(py) * W + Math.floor(px)];
      if (!on && rnd() > 0.02) continue;
      var ok = true;
      for (var k = 0; k < pts.length; k++) { var ddx = pts[k][0] - px, ddy = pts[k][1] - py; if (ddx * ddx + ddy * ddy < 15 * 15) { ok = false; break; } }
      if (ok) pts.push([px, py]);
    }
    pts.forEach(function (p) { stamp(p[0], p[1], 8.5 + rnd() * 1.5, 5 + rnd(), rnd() * Math.PI * 2, 28 + rnd() * 14, rnd() > 0.5); });
    for (var s = 0; s < 14; s++) { // piedras oscuras fuera de la colonia: confusores
      var sx = rnd() * W, sy = rnd() * H;
      if (gu[Math.floor(sy) * W + Math.floor(sx)]) continue;
      stamp(sx, sy, 10 + rnd() * 5, 7 + rnd() * 3, rnd() * 3, 50 + rnd() * 12, false);
    }
    var bands = [R, G, B].map(function (a) { var o = boxBlur(a, W, H, 1); for (var q = 0; q < N; q++) o[q] = Math.max(0, Math.min(255, Math.round(o[q]))); return o; });
    var area = 0; for (var q2 = 0; q2 < N; q2++) area += gu[q2];
    return PE.makeScene({
      w: W, h: H, bands: bands, eightBit: true, map: { r: 0, g: 1, b: 2, nir: -1, swir: -1 }, pxArea: 0.0025, gsdSource: 'de la escena sintética',
      truth: { mask: gu, areaM2: area * 0.0025, groups: 2, individuals: pts.length, points: pts }, synthetic: true, name: 'Escena de dron sintética (5 cm/píxel, color)',
      note: 'Escena generada por computadora: ' + pts.length + ' pingüinos dibujados sobre dos manchas de guano y algunas piedras oscuras fuera de la colonia. Sirve para probar el conteo de individuos, que sólo tiene sentido con píxeles de pocos centímetros.'
    });
  };

  /* ---------- proyecciones directas (longitud, latitud -> sistema de la imagen) ---------- */
  PE.lonLatToUTM = function (lon, lat, zone, south) {
    var k0 = 0.9996, phi = lat * D2R, lam = (lon - ((zone - 1) * 6 - 180 + 3)) * D2R, ep2 = E2 / (1 - E2);
    var sp = Math.sin(phi), cp = Math.cos(phi), tp = Math.tan(phi), Nn = WGS_A / Math.sqrt(1 - E2 * sp * sp), T = tp * tp, C = ep2 * cp * cp, A = lam * cp;
    var e4 = E2 * E2, e6 = e4 * E2;
    var M = WGS_A * ((1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
      + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi) - (35 * e6 / 3072) * Math.sin(6 * phi));
    var x = k0 * Nn * (A + (1 - T + C) * A * A * A / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5) / 120) + 500000;
    var y = k0 * (M + Nn * tp * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6) / 720));
    return [x, south ? y + 10000000 : y];
  };
  PE.lonLatToPS3031 = function (lon, lat) {
    var pc = 71 * D2R, rho = WGS_A * psM(pc) * psT(Math.abs(lat) * D2R) / psT(pc), l = lon * D2R;
    return [rho * Math.sin(l), rho * Math.cos(l)];
  };
  PE.fromLonLat = function (geo, lon, lat) {
    var k = PE.crsKind(geo.epsg);
    if (k === 'geo') return [lon, lat];
    if (k === 'ps') return PE.lonLatToPS3031(lon, lat);
    if (k === 'utmN') return PE.lonLatToUTM(lon, lat, geo.epsg - 32600, false);
    if (k === 'utmS') return PE.lonLatToUTM(lon, lat, geo.epsg - 32700, true);
    return null;
  };
  /* función que lleva un píxel de la grilla B a la grilla A, o null si no son comparables */
  PE.gridMapper = function (A, B) {
    if (A.geo && B.geo) {
      var a = A.geo, b = B.geo;
      if (a.epsg === b.epsg) return function (x, y) { return [(b.ox + x * b.rx - a.ox) / a.rx, (b.oy + y * b.ry - a.oy) / a.ry]; };
      if (!PE.crsKind(a.epsg) || !PE.crsKind(b.epsg)) return null;
      return function (x, y) { var ll = PE.toLonLat(b, b.ox + x * b.rx, b.oy + y * b.ry), c = PE.fromLonLat(a, ll[0], ll[1]); return [(c[0] - a.ox) / a.rx, (c[1] - a.oy) / a.ry]; };
    }
    if (!A.geo && !B.geo && Math.abs(A.w / A.h - B.w / B.h) < 0.01) { var f = A.w / B.w; return function (x, y) { return [x * f, y * f]; }; }
    return null;
  };

  /* ---------- relieve ---------- */
  /* dem: {w, h, data, geo, nodata}; devuelve la elevación en la grilla de la escena */
  PE.resampleDEM = function (dem, s) {
    var map = PE.gridMapper(dem, { w: s.w, h: s.h, geo: s.geo });
    if (!map) return null;
    var out = new Float32Array(s.w * s.h), D = dem.data, dw = dem.w, dh = dem.h, nd = dem.nodata, hit = 0;
    for (var y = 0; y < s.h; y++) for (var x = 0; x < s.w; x++) {
      var p = map(x + 0.5, y + 0.5), fx = p[0] - 0.5, fy = p[1] - 0.5, i = y * s.w + x;
      if (fx < -0.5 || fy < -0.5 || fx > dw - 0.5 || fy > dh - 0.5) { out[i] = NaN; continue; }
      var x0 = Math.max(0, Math.min(dw - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(dh - 1, Math.floor(fy))), x1 = Math.min(dw - 1, x0 + 1), y1 = Math.min(dh - 1, y0 + 1);
      var tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
      var a = D[y0 * dw + x0], b = D[y0 * dw + x1], c = D[y1 * dw + x0], d = D[y1 * dw + x1];
      if (a !== a || b !== b || c !== c || d !== d || a === nd || b === nd || c === nd || d === nd) { out[i] = NaN; continue; }
      out[i] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty; hit++;
    }
    return hit ? out : null;
  };
  /* pendiente (grados), orientación (grados desde el norte verdadero, sentido horario, hacia donde baja) y sombreado */
  PE.terrain = function (elev, w, h, cell, northRot) {
    var N = w * h, slope = new Float32Array(N), aspect = new Float32Array(N), shade = new Uint8Array(N), rot = northRot || 0;
    var zs = Math.cos(45 * D2R), zc = Math.sin(45 * D2R), az = 315 * D2R;
    for (var y = 0; y < h; y++) {
      var ym = y > 0 ? y - 1 : y, yp = y < h - 1 ? y + 1 : y;
      for (var x = 0; x < w; x++) {
        var xm = x > 0 ? x - 1 : x, xp = x < w - 1 ? x + 1 : x, i = y * w + x;
        var a = elev[ym * w + xm], b = elev[ym * w + x], c = elev[ym * w + xp], d = elev[y * w + xm], f = elev[y * w + xp], g = elev[yp * w + xm], hh = elev[yp * w + x], k = elev[yp * w + xp];
        var dzdx = ((c + 2 * f + k) - (a + 2 * d + g)) / (8 * cell), dzdy = ((g + 2 * hh + k) - (a + 2 * b + c)) / (8 * cell);
        if (dzdx !== dzdx || dzdy !== dzdy) { slope[i] = NaN; aspect[i] = NaN; shade[i] = 40; continue; }
        var sl = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)), as = Math.atan2(-dzdx, dzdy);
        slope[i] = sl / D2R;
        aspect[i] = (((as / D2R) - rot) % 360 + 360) % 360;
        var v = zc * Math.cos(sl) + zs * Math.sin(sl) * Math.cos(az - as);
        shade[i] = v < 0 ? 0 : Math.round(255 * v);
      }
    }
    return { slope: slope, aspect: aspect, shade: shade };
  };
  /* distancia en píxeles a la celda marcada más cercana (transformada de chaflán 3-4) */
  PE.distanceTo = function (mask, w, h) {
    var N = w * h, d = new Float32Array(N), BIG = 1e9, x, y, i, v;
    for (i = 0; i < N; i++) d[i] = mask[i] ? 0 : BIG;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; v = d[i]; if (v === 0) continue;
      if (x > 0 && d[i - 1] + 3 < v) v = d[i - 1] + 3;
      if (y > 0) { if (d[i - w] + 3 < v) v = d[i - w] + 3; if (x > 0 && d[i - w - 1] + 4 < v) v = d[i - w - 1] + 4; if (x < w - 1 && d[i - w + 1] + 4 < v) v = d[i - w + 1] + 4; }
      d[i] = v;
    }
    for (y = h - 1; y >= 0; y--) for (x = w - 1; x >= 0; x--) {
      i = y * w + x; v = d[i]; if (v === 0) continue;
      if (x < w - 1 && d[i + 1] + 3 < v) v = d[i + 1] + 3;
      if (y < h - 1) { if (d[i + w] + 3 < v) v = d[i + w] + 3; if (x < w - 1 && d[i + w + 1] + 4 < v) v = d[i + w + 1] + 4; if (x > 0 && d[i + w - 1] + 4 < v) v = d[i + w - 1] + 4; }
      d[i] = v;
    }
    for (i = 0; i < N; i++) d[i] = d[i] >= BIG ? NaN : d[i] / 3;
    return d;
  };
  /* agua: por infrarrojo (NDWI) o, si hay relieve, por cota al nivel del mar */
  PE.waterMask = function (s) {
    var N = s.w * s.h, m = s.map, out = new Uint8Array(N), n = 0, i;
    if (m.nir >= 0) {
      var G = s.bands[m.g], NIR = s.bands[m.nir], R = s.bands[m.r], inv = 1 / s.ref;
      for (i = 0; i < N; i++) { if (s.valid && !s.valid[i]) continue; var g = G[i], q = NIR[i]; if ((g - q) / (g + q + EPS) > 0.25 && (R[i] + g) * inv / 2 < 0.35) { out[i] = 1; n++; } }
    } else if (s.elev) { for (i = 0; i < N; i++) if (s.elev[i] <= 0.3) { out[i] = 1; n++; } }
    else return null;
    if (n < 50) return null;
    return PE.morph(out, s.w, s.h, 1, 0);
  };
  /* estadísticas por grupo: cota, pendiente, orientación, superficie real y distancia al mar */
  PE.zonal = function (s, res, seaDist) {
    var K = res.comps.length, L = res.labels, N = s.w * s.h, EL = s.elev, TR = s.terrain, g = PE.gsd(s);
    var se = new Float64Array(K + 1), ss = new Float64Array(K + 1), sx = new Float64Array(K + 1), sy = new Float64Array(K + 1), st = new Float64Array(K + 1), n = new Float64Array(K + 1), md = new Float64Array(K + 1).fill(Infinity);
    for (var i = 0; i < N; i++) {
      var l = L[i]; if (!l) continue;
      if (seaDist) { var dd = seaDist[i]; if (dd === dd && dd < md[l]) md[l] = dd; }
      if (!TR) continue;
      var sl = TR.slope[i]; if (sl !== sl) continue;
      n[l]++; se[l] += EL[i]; ss[l] += sl; st[l] += 1 / Math.cos(Math.min(80, sl) * D2R);
      var a = TR.aspect[i] * D2R, wgt = Math.sin(sl * D2R); sx[l] += Math.sin(a) * wgt; sy[l] += Math.cos(a) * wgt;
    }
    res.comps.forEach(function (c) {
      var k = c.id;
      if (TR && n[k]) {
        c.elev = se[k] / n[k]; c.slope = ss[k] / n[k]; c.trueArea = c.area * (st[k] / n[k]);
        c.aspect = ((Math.atan2(sx[k], sy[k]) / D2R) + 360) % 360;
      }
      if (seaDist && md[k] < Infinity && g) c.sea = md[k] * g;
    });
  };
  PE.compass = function (deg) { return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(deg / 45) % 8]; };
  PE.nearest = function (comps, gsd) {
    comps.forEach(function (c) {
      var best = Infinity;
      comps.forEach(function (o) { if (o !== c) { var d = Math.hypot(o.cx - c.cx, o.cy - c.cy); if (d < best) best = d; } });
      c.nn = best < Infinity && gsd ? best * gsd : undefined;
    });
  };

  /* ---------- tiempo: temporadas, ciclo reproductivo, comparación entre fechas ---------- */
  PE.season = function (date) { var p = String(date).split('-'), y = +p[0], m = +p[1]; return y && m ? (m >= 7 ? y : y - 1) : null; };
  PE.seasonLabel = function (y) { return y + '/' + String((y + 1) % 100).padStart(2, '0'); };
  /* fases aproximadas por mes para Punta Stranger; se corren hasta cinco semanas según la nieve */
  PE.PHASES = {
    adelia: { 10: 'Arribo y nidos', 11: 'Puesta e incubación', 12: 'Eclosión y guarda', 1: 'Guardería', 2: 'Emplume y partida', 3: 'Muda', 4: 'Muda', 5: 'En el mar', 6: 'En el mar', 7: 'En el mar', 8: 'En el mar', 9: 'En el mar' },
    papua: { 10: 'Ocupación de nidos', 11: 'Puesta e incubación', 12: 'Incubación y eclosión', 1: 'Guarda y guardería', 2: 'Guardería y emplume', 3: 'Muda', 4: 'Muda', 5: 'Invierno cerca', 6: 'Invierno cerca', 7: 'Invierno cerca', 8: 'Invierno cerca', 9: 'Invierno cerca' },
    signal: { 10: 1, 11: 2, 12: 3, 1: 3, 2: 2, 3: 1, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 }
  };
  PE.SIGNAL = ['Sin señal útil', 'Débil: poco guano o nieve', 'Media: guano en formación o ya difuso', 'Máxima: guano rosado y bordes nítidos'];
  PE.phase = function (date) {
    var m = +String(date).split('-')[1];
    return m ? { season: PE.season(date), adelia: PE.PHASES.adelia[m], papua: PE.PHASES.papua[m], signal: PE.PHASES.signal[m] } : null;
  };
  PE.rle = function (mask) {
    var out = [], cur = 0, run = 0;
    for (var i = 0; i < mask.length; i++) { var v = mask[i] ? 1 : 0; if (v === cur) run++; else { out.push(run.toString(36)); cur = v; run = 1; } }
    out.push(run.toString(36));
    return out.join(',');
  };
  PE.unrle = function (str, n) {
    var m = new Uint8Array(n), parts = str.split(','), pos = 0, cur = 0;
    for (var k = 0; k < parts.length && pos < n; k++) { var run = parseInt(parts[k], 36); if (cur) m.fill(1, pos, Math.min(n, pos + run)); pos += run; cur = 1 - cur; }
    return m;
  };
  /* A = fecha anterior, B = fecha posterior; cada uno {w, h, mask, geo, pxArea}. Resultado en la grilla de B. */
  PE.changeMap = function (A, B) {
    var map = PE.gridMapper(A, B);
    if (!map) return null;
    var N = B.w * B.h, cls = new Uint8Array(N), st = 0, ga = 0, lo = 0;
    for (var y = 0; y < B.h; y++) for (var x = 0; x < B.w; x++) {
      var p = map(x + 0.5, y + 0.5), ax = Math.floor(p[0]), ay = Math.floor(p[1]), i = y * B.w + x;
      var a = ax >= 0 && ay >= 0 && ax < A.w && ay < A.h ? A.mask[ay * A.w + ax] : 0, b = B.mask[i];
      if (a && b) { cls[i] = 1; st++; } else if (b) { cls[i] = 2; ga++; } else if (a) { cls[i] = 3; lo++; }
    }
    return { w: B.w, h: B.h, cls: cls, stable: st * B.pxArea, gain: ga * B.pxArea, loss: lo * B.pxArea, px: [st, ga, lo] };
  };

  root.PE = PE;
  if (typeof module !== 'undefined' && module.exports) module.exports = PE;
})(typeof window !== 'undefined' ? window : globalThis);
