/* Lab type "curve": functions of x drawn as SVG, optionally controlled by sliders and an x marker.
   params: { x: { label, min, max }, y?: { label, min, max }, inputs?: [...slider-calc inputs],
             curves: [{ label, expr }], marker?: { label, value } } */
Lykeion.registerLab('curve', function (root, p, api) {
  var H = api.H, S = api.S, esc = api.esc;
  var X = p.x || { min: 0, max: 1, label: 'x' };
  var ids = ['x'].concat((p.inputs || []).map(function (i) { return i.id; }));
  var curves = (p.curves || []).map(function (c, i) { return { label: c.label, fn: LykeionMath.compile(c.expr, ids), color: 'var(--s' + (i % 3 + 1) + ')', dash: i >= 3 ? '6 4' : '' }; });
  if (!curves.length) throw new Error('curve needs "curves"');
  var state = {};
  var W = 560, Hh = 300, pad = { l: 46, r: 16, t: 14, b: 40 };
  var marker = p.marker ? { x: Number(p.marker.value != null ? p.marker.value : (X.min + X.max) / 2), label: p.marker.label || X.label } : null;

  var controls = H('div', { class: 'controls' });
  (p.inputs || []).forEach(function (inp) { state[inp.id] = Number(inp.value); controls.appendChild(slider(inp.id, inp.label, inp.min, inp.max, inp.step || 1, inp.value, function (v) { state[inp.id] = v; draw(); })); });
  if (marker) controls.appendChild(slider('__marker', marker.label, X.min, X.max, (X.max - X.min) / 100, marker.x, function (v) { marker.x = v; draw(); }));
  if (controls.children.length) root.appendChild(controls);

  var legend = H('div', { class: 'legend' }, curves.map(function (c) { return '<span><i style="background:' + c.color + '"></i>' + esc(c.label) + '</span>'; }).join(''));
  root.appendChild(legend);
  var wrap = H('div', { class: 'vizwrap' });
  var svg = S('svg', { class: 'viz', viewBox: '0 0 ' + W + ' ' + Hh, role: 'img', 'aria-label': (p.title || '') + ' ' + curves.map(function (c) { return c.label; }).join(', ') });
  wrap.appendChild(svg); root.appendChild(wrap);
  var ro = H('div', { class: 'readouts', 'aria-live': 'polite' });
  if (marker) { curves.forEach(function (c) { c.ro = H('div', { class: 'ro' }, '<span>' + esc(c.label) + '</span><b>—</b>'); ro.appendChild(c.ro); }); root.appendChild(ro); }

  function slider(id, label, min, max, step, value, on) {
    var uid = root.parentNode.id + '-' + id;
    var ctl = H('div', { class: 'ctl' }, '<label for="' + esc(uid) + '">' + esc(label) + ' <output>' + value + '</output></label><input type="range" id="' + esc(uid) + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '">');
    var r = ctl.querySelector('input'), o = ctl.querySelector('output');
    r.addEventListener('input', function () { o.textContent = (+r.value).toFixed(step < 1 ? 2 : 0); on(+r.value); });
    return ctl;
  }
  function draw() {
    var N = 200, pts = curves.map(function (c) {
      var a = [];
      for (var i = 0; i <= N; i++) { var x = X.min + (X.max - X.min) * i / N, v = c.fn(Object.assign({ x: x }, state)); a.push([x, Number.isFinite(v) ? v : NaN]); }
      return a;
    });
    var all = [].concat.apply([], pts).map(function (q) { return q[1]; }).filter(Number.isFinite);
    var ymin = p.y && p.y.min != null ? p.y.min : Math.min.apply(null, all.concat([0]));
    var ymax = p.y && p.y.max != null ? p.y.max : Math.max.apply(null, all.concat([1e-9]));
    if (ymax === ymin) ymax = ymin + 1;
    var sx = function (x) { return pad.l + (x - X.min) / (X.max - X.min) * (W - pad.l - pad.r); };
    var sy = function (y) { return Hh - pad.b - (y - ymin) / (ymax - ymin) * (Hh - pad.t - pad.b); };
    svg.innerHTML = '';
    var g = S('g', { class: 'grid' }, svg), ax = S('g', { class: 'axis' }, svg);
    for (var k = 0; k <= 4; k++) {
      var yv = ymin + (ymax - ymin) * k / 4, xv = X.min + (X.max - X.min) * k / 4;
      S('line', { x1: pad.l, x2: W - pad.r, y1: sy(yv), y2: sy(yv) }, g);
      S('text', { x: pad.l - 6, y: sy(yv) + 4, class: 'tick', 'text-anchor': 'end' }, svg).textContent = +yv.toFixed(2);
      S('text', { x: sx(xv), y: Hh - pad.b + 16, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = +xv.toFixed(2);
    }
    S('line', { x1: pad.l, x2: W - pad.r, y1: Hh - pad.b, y2: Hh - pad.b }, ax);
    S('line', { x1: pad.l, x2: pad.l, y1: pad.t, y2: Hh - pad.b }, ax);
    S('text', { x: (W + pad.l) / 2, y: Hh - 6, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = X.label || 'x';
    if (p.y && p.y.label) S('text', { x: 12, y: (Hh - pad.b + pad.t) / 2, class: 'tick', 'text-anchor': 'middle', transform: 'rotate(-90 12 ' + (Hh - pad.b + pad.t) / 2 + ')' }, svg).textContent = p.y.label;
    pts.forEach(function (a, i) {
      var d = '', pen = false;
      a.forEach(function (q) { if (!Number.isFinite(q[1])) { pen = false; return; } d += (pen ? 'L' : 'M') + sx(q[0]).toFixed(1) + ',' + sy(q[1]).toFixed(1); pen = true; });
      S('path', { d: d, fill: 'none', stroke: curves[i].color, 'stroke-width': 2.5, 'stroke-dasharray': curves[i].dash }, svg);
    });
    if (marker) {
      S('line', { x1: sx(marker.x), x2: sx(marker.x), y1: pad.t, y2: Hh - pad.b, stroke: 'var(--ink-2)', 'stroke-dasharray': '4 4' }, svg);
      curves.forEach(function (c) {
        var v = c.fn(Object.assign({ x: marker.x }, state));
        if (Number.isFinite(v)) S('circle', { cx: sx(marker.x), cy: sy(v), r: 5, fill: c.color, stroke: 'var(--card)', 'stroke-width': 2 }, svg);
        api.setVal(c.ro.querySelector('b'), api.fmt(v, 3));
      });
    }
  }
  draw();
});
