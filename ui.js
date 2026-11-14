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
    box.className = 'status' + (n ? '' : ' zero');
    $('zZone').hidden = !(sc.roi && sc.roiBox);
    if (n) {
      sum.textContent = $('kArea').textContent + ' con color de guano · ' + n + (n === 1 ? ' grupo' : ' grupos') + (c.blobs ? ' · ' + c.blobs.length + ' aves contadas' : '');
    } else sum.textContent = 'No se detectó guano';
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
    if (sc.src && sc.down > 1.2) msg = 'Vista general: la imagen original se redujo ' + Math.round(sc.down) + ' veces para entrar en pantalla. Para trabajar con todo el detalle, en «Detección» marcar una zona y pulsar «Ver la zona a resolución completa». ' + (n ? '' : '');
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
  document.addEventListener('pc:result', update);
  document.addEventListener('pc:scene', function () { $('sumBar').textContent = 'Analizando la imagen…'; $('diag').textContent = ''; });
  window.PCUI = { showView: showView, showPane: showPane };
})();
