/* Pestañas, franja de estado y avisos: la capa que explica qué está pasando. */
(function () {
  'use strict';
  var A = window.PCApp, $ = function (id) { return document.getElementById(id); };
  if (!A) return;
  var BAD = { 0: 1, 1: 1, 3: 1, 8: 1, 9: 1, 10: 1 };

  /* ---------- pestañas ---------- */
  function showView(v) {
    Array.prototype.forEach.call($('mainTabs').querySelectorAll('button'), function (b) { b.setAttribute('aria-selected', String(b.dataset.view === v)); });
    ['detectar', 'censos', 'serie', 'ayuda', 'fuentes'].forEach(function (k) { $('v-' + k).hidden = k !== v; });
    try { if (v !== 'detectar') location.hash = v; else history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* sin historial */ }
    requestAnimationFrame(function () { window.dispatchEvent(new Event('resize')); });
  }
  function showPane(p) {
    Array.prototype.forEach.call($('subTabs').querySelectorAll('button'), function (b) { b.setAttribute('aria-selected', String(b.dataset.pane === p)); });
    ['imagen', 'deteccion', 'resultado', 'ajustes'].forEach(function (k) { $('p-' + k).hidden = k !== p; });
  }
  $('mainTabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) showView(b.dataset.view); });
  $('subTabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) showPane(b.dataset.pane); });
  $('goSerie').addEventListener('click', function () { showView('serie'); var d = $('recDate'); if (!d.value) d.focus(); else $('recAdd').focus(); });
  $('mML').addEventListener('click', function () { showPane('deteccion'); });
  $('toolMeasure').addEventListener('click', function () { setTimeout(update, 0); });
  var h0 = (location.hash || '').slice(1); if (['censos', 'serie', 'ayuda', 'fuentes'].indexOf(h0) >= 0) showView(h0);

  /* ---------- franja de estado ---------- */
  function cover(sc) { // fracción de tierra con nieve y con nubes dentro de la zona analizada
    if (!sc.scl) return null;
    var bx = sc.roi && sc.roiOn && sc.roiBox ? sc.roiBox : [0, 0, sc.w, sc.h], land = 0, snow = 0, cloud = 0;
    for (var y = bx[1]; y < bx[3]; y++) for (var x = bx[0]; x < bx[2]; x++) { var v = sc.scl[y * sc.w + x]; if (v === 6) continue; land++; if (v === 11) snow++; else if (BAD[v]) cloud++; }
    return land ? { snow: snow / land, cloud: cloud / land } : null;
  }
  function pct(v) { return Math.round(v * 100) + ' %'; }
  function update() {
    var c = A.current(), box = $('status'), sum = $('sumBar'), diag = $('diag'), hint = $('hintbar');
    if (!c) return;
    var sc = c.scene, n = c.res.comps.length, ml = c.method === 'ml', g = c.samples.filter(function (s) { return s.cls === 'guano'; }).length, no = c.samples.length - g;
    var NS = window.PCX && window.PCX.nest;
    var fine = PE.gsd(sc) && PE.gsd(sc) <= 0.035;
    function dron() { var t = ''; if (NS && NS.on && c.blobs && (fine || c.blobs.length)) t += c.blobs.length + (fine ? ' nidos · ' : ' nidos marcados a mano · '); if (NS && NS.birdOn && fine) t += NS.birds.length + ' pingüinos fuera del nido · '; return t; }
    box.className = 'status' + (n || dron() ? '' : ' zero');
    $('zZone').hidden = !(sc.roi && sc.roiBox);
    if (n) {
      sum.textContent = dron() + $('kArea').textContent + ' con color de guano · ' + n + (n === 1 ? ' grupo' : ' grupos') + (c.blobs && !(NS && NS.on) ? ' · ' + c.blobs.length + ' aves contadas' : '');
    } else sum.textContent = dron() ? dron() + 'sin color de guano' : 'No se detectó guano';
    var msg;
    if (ml) {
      if (!g) msg = 'Modo con ejemplos: tocar en la imagen una mancha de guano, rosada o rojiza. Arrastrar sigue moviendo la imagen.';
      else if (!no) msg = 'Lo celeste es lo que se parece al guano marcado y no al suelo que lo rodea. Si pintó de más, elegir «Esto no es guano» y tocar esas partes; si falta, tocar otra mancha.';
      else msg = 'Lleva ' + g + (g === 1 ? ' toque' : ' toques') + ' de guano y ' + no + ' de lo que no es. Seguir hasta que lo celeste coincida con las manchas.';
    } else if (!n) {
      var cv = cover(sc);
      if (cv && cv.snow > 0.4) msg = 'En esta fecha la nieve cubre el ' + pct(cv.snow) + ' de la zona y tapa la colonia: no hay guano a la vista. Elegir en «Imagen» una fecha marcada «colonia visible», como el 29/12/2021.';
      else if (cv && cv.cloud > 0.3) msg = 'Las nubes o sus sombras tapan el ' + pct(cv.cloud) + ' de la zona en esta fecha. Elegir en «Imagen» una fecha marcada «colonia visible».';
      else msg = $('warn').hidden ? 'La detección automática no encontró color de guano. En «Detección» se puede bajar la exigencia o enseñarle con ejemplos.' : $('warn').textContent;
    } else {
      msg = 'Detección automática lista: lo celeste tiene color de guano' + (sc.roi && sc.roiOn ? ', dentro del recuadro de trazos' : '') + '. Tocar una mancha muestra sus datos; en «Detección» se ajusta si sobra o falta.';
      if (sc.synthetic) msg = 'Imagen inventada para practicar. ' + msg;
    }
    if (NS && (NS.on || NS.birdOn) && PE.gsd(sc) && PE.gsd(sc) <= 0.15 && !fine) msg = 'Imagen de dron de conjunto: con este detalle sólo se detecta sola la mancha de guano. Para nidos y pingüinos, abrir el recorte de detalle (1,5 cm por píxel) o marcar los nidos a mano tocando la imagen.';
    else if (dron()) msg = 'Imagen de dron: círculos amarillos, nidos; círculos naranjas, posibles pingüinos fuera del nido, sobre la nieve; celeste, borde teñido de guano. Son borradores: tocar un círculo lo quita y tocar un nido sin marcar lo agrega. «Clasificar toda la imagen» los pinta junto con nieve, suelo y agua.';
    else if (sc.src && sc.down > 1.2) msg = 'Vista general: la imagen original se redujo ' + String(Math.round(sc.down * 10) / 10).replace('.', ',') + ' veces para entrar en pantalla. Para trabajar con todo el detalle, en «Detección» marcar una zona y pulsar «Ver la zona a resolución completa». ' + (n ? '' : '');
    else if (sc.parent) msg = 'Recorte a resolución completa de la zona marcada. ' + msg + ' «Volver a la imagen completa» está en «Detección».';
    diag.textContent = msg;
    hint.innerHTML = '';
    var px = window.PCX && window.PCX.state;
    if (px && px.edit) { hint.textContent = px.fresh ? 'Dibujar la zona: arrastrar sobre la imagen de una esquina a la opuesta.' : 'Editando la zona: arrastrar los cuadraditos para cambiar el tamaño, o el interior para moverla. Fuera del recuadro se mueve la imagen.'; hint.hidden = false; }
    else if ($('toolMeasure').getAttribute('aria-pressed') === 'true') { hint.textContent = 'Medir: tocar los dos extremos de una distancia conocida.'; hint.hidden = false; }
    else if (ml) {
      var dot = document.createElement('i'); dot.style.background = c.cls === 'guano' ? '#ff5fa2' : '#ffd23f'; hint.appendChild(dot);
      hint.appendChild(document.createTextNode(c.cls === 'guano' ? 'Marcando guano: tocar una mancha rosada o rojiza.' : 'Marcando lo que no es guano: tocar nieve, roca, agua o lo pintado de más.'));
      hint.hidden = false;
    } else hint.hidden = true;
  }
  /* ---------- cada detección se anuncia: barra mientras corre, y al terminar qué cambió ---------- */
  var RUN = { t0: 0, on: false, prev: null, timer: null }, nf0 = A.nf0;
  function zoneTxt(sc) { var g = PE.gsd(sc), b = sc.roi && sc.roiOn && sc.roiBox ? sc.roiBox : [0, 0, sc.w, sc.h]; return (sc.roi && sc.roiOn && sc.roiBox ? 'zona analizada: ' : 'se analizó toda la imagen: ') + (g ? nf0.format((b[2] - b[0]) * g) + ' × ' + nf0.format((b[3] - b[1]) * g) + ' m' : (b[2] - b[0]) + ' × ' + (b[3] - b[1]) + ' px'); }
  function area(c) { return PE.gsd(c.scene) ? nf0.format(c.m2) + ' m²' : nf0.format(c.px) + ' px'; }
  document.addEventListener('pc:run', function () {
    if (!RUN.on) { RUN.on = true; RUN.t0 = Date.now(); }
    $('status').classList.add('running'); $('runBar').hidden = false; $('stamp').hidden = true; $('rerun').disabled = true;
    $('sumBar').textContent = RUN.prev ? 'Detectando de nuevo…' : 'Analizando la imagen…'; $('diag').textContent = '';
  });
  function finish() {
    var c = A.current(); RUN.on = false; $('status').classList.remove('running'); $('runBar').hidden = true; $('rerun').disabled = false;
    update(); if (!c) return;
    var p = RUN.prev, n = c.res.comps.length, st = $('stamp'), dt = new Date(), now = [dt.getHours(), dt.getMinutes(), dt.getSeconds()].map(function (v) { return (v < 10 ? '0' : '') + v; }).join(':'), fresh = c.res.comps.filter(function (k) { return k.isNew; }).length, txt;
    if (!p || p.scene !== c.scene) txt = 'Detección hecha a las ' + now + ' · ' + zoneTxt(c.scene) + '.';
    else if (p.px === c.px && p.n === n) txt = 'Se volvió a detectar a las ' + now + ' y el resultado es el mismo (' + zoneTxt(c.scene) + ').' + (p.zone !== zoneTxt(c.scene) ? ' En la parte nueva de la zona no hay nada con color de guano.' : '');
    else { var d = (c.px - p.px) * (c.scene.pxArea || 1); txt = 'Se volvió a detectar a las ' + now + ' · ' + zoneTxt(c.scene) + '. Antes: ' + p.area + ' en ' + p.n + (p.n === 1 ? ' grupo' : ' grupos') + '. Ahora: ' + area(c) + ' en ' + n + ' (' + (d >= 0 ? '+' : '−') + nf0.format(Math.abs(d)) + (PE.gsd(c.scene) ? ' m²' : ' px') + (fresh ? ', ' + fresh + (fresh === 1 ? ' grupo nuevo, marcado' : ' grupos nuevos, marcados') + ' en naranja' : '') + ').'; }
    RUN.first = fresh ? c.res.comps.filter(function (k) { return k.isNew; })[0].id : 0;
    st.textContent = txt + (RUN.first ? ' Tocar acá para ir al nuevo.' : ''); st.hidden = false; st.classList.toggle('go', !!RUN.first);
    var box = $('status'); box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
    RUN.prev = { scene: c.scene, px: c.px, n: n, area: area(c), labels: c.res.labels, zone: zoneTxt(c.scene) };
  }
  document.addEventListener('pc:result', function (e) {
    if (!(e.detail && e.detail.run)) { if (!RUN.on) update(); return; }
    var c = A.current(), p = RUN.prev;
    if (c && p && p.scene === c.scene) { var L = c.res.labels, P = p.labels, w = c.scene.w; c.res.comps.forEach(function (k) { var hit = false; for (var y = k.y0; y <= k.y1 && !hit; y++) for (var x = k.x0; x <= k.x1; x++) { var i = y * w + x; if (L[i] === k.id && P[i]) { hit = true; break; } } k.isNew = !hit; }); A.draw(); }
    clearTimeout(RUN.timer); RUN.timer = setTimeout(finish, Math.max(0, 550 - (Date.now() - RUN.t0)));
  });
  $('rerun').addEventListener('click', function () { A.schedule(0); });
  $('stamp').addEventListener('click', function () { if (RUN.first) { A.selectComp(RUN.first, true); A.draw(); } });
  document.addEventListener('pc:scene', function () { RUN.prev = null; $('stamp').hidden = true; });
  window.PCUI = { showView: showView, showPane: showPane };
})();
