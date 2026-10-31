/* Lab type "curve": functions of x drawn as SVG, optionally controlled by sliders and an x marker.
   params: { x: { label, min, max }, y?: { label, min, max }, inputs?: [...slider-calc inputs],
             curves: [{ label, expr }], marker?: { label, value },
             discrete?: true,                      one column per integer x instead of a line
             outputs?: [...slider-calc outputs],   readouts over the inputs (never x)
             verdict?: [{ when, text }] }          first true "when" shows its text
   `discrete` draws the curves as columns rising from y = 0, one slot per integer x, so a distribution
   can be shown in the fixed-height plot instead of a row list that would grow with n.
   `x.min` and `x.max` are numbers or expressions over the Lab's inputs (`max: "n"`), re-read on every
   draw, so a discrete axis can end at the input instead of at a fixed bound. */
Lykeion.registerLab('curve', function (root, p, api) {
  var H = api.H, S = api.S, esc = api.esc;
  var X = p.x || { min: 0, max: 1, label: 'x' };
  var inputs = p.inputs || [];
  var inIds = inputs.map(function (i) { return i.id; });
  var ids = ['x'].concat(inIds);
  var curves = (p.curves || []).map(function (c, i) { return { label: c.label, fn: LykeionMath.compile(c.expr, ids), color: 'var(--s' + (i % 3 + 1) + ')', dash: i >= 3 ? '6 4' : '' }; });
  if (!curves.length) throw new Error('curve needs "curves"');
  // The readouts and verdicts are slider-calc's: expressions over the inputs, never over x.
  var outs = (p.outputs || []).map(function (o) { return Object.assign({ fn: LykeionMath.compile(o.expr, inIds) }, o); });
  var verdicts = (p.verdict || []).map(function (v) { return { fn: LykeionMath.compile(v.when, inIds), text: v.text }; });
  var discrete = !!p.discrete;
  var state = {};
  // x.min / x.max are a number or an expression over the inputs, so `max: "n"` ends the axis at n and
  // follows the slider. Numbers keep working unchanged; an expression is re-read on every draw.
  var xBound = function (v, dflt) {
    if (v == null) return function () { return dflt; };
    if (typeof v === 'number') return function () { return v; };
    var fn = LykeionMath.compile(String(v), inIds);
    return function () { var n = fn(state); return Number.isFinite(n) ? n : dflt; };
  };
  var xMinOf = xBound(X.min, 0), xMaxOf = xBound(X.max, 1);
  // The chart's own coordinate system. A 560-unit-wide viewBox is scaled to ~310 CSS px on a phone,
  // which renders the 11px tick labels at ~6px: below 480px the plot draws a 300-unit-wide box instead,
  // so the scale stays near 1:1 and lab.css raises the in-SVG label size to match. Desktop keeps the
  // 560×300 box, its paddings and its 11px labels exactly as before.
  var NARROW = '(max-width: 480px)';
  function isNarrow() { return typeof matchMedia === 'function' && matchMedia(NARROW).matches; }
  function layout() {
    return isNarrow()
      ? { w: 300, h: 300, pad: { l: 40, r: 10, t: 16, b: 36 }, yTitleAbove: true }
      : { w: 560, h: 300, pad: { l: 46, r: 16, t: 14, b: 40 }, yTitleAbove: false };
  }
  var marker = null, markerInput = null;

  var controls = H('div', { class: 'controls' });
  inputs.forEach(function (inp) { state[inp.id] = Number(inp.value); controls.appendChild(slider(inp.id, inp.label, inp.min, inp.max, inp.step || 1, inp.value, function (v) { state[inp.id] = v; draw(); })); });
  if (p.marker) {
    // The marker opens inside the axis the Lab opens on, which may itself be an expression of the inputs.
    var xOpen = [xMinOf(), xMaxOf()];
    marker = { x: Number(p.marker.value != null ? p.marker.value : (xOpen[0] + xOpen[1]) / 2), label: p.marker.label || X.label };
    var mctl = slider('__marker', marker.label, xOpen[0], xOpen[1], Math.abs(xOpen[1] - xOpen[0]) / 100 || 1, marker.x, function (v) { marker.x = v; draw(); });
    markerInput = mctl.querySelector('input');
    controls.appendChild(mctl);
  }
  if (controls.children.length) root.appendChild(controls);

  var legend = H('div', { class: 'legend' }, curves.map(function (c) { return '<span><i style="background:' + c.color + '"></i>' + esc(c.label) + '</span>'; }).join(''));
  root.appendChild(legend);
  var wrap = H('div', { class: 'vizwrap' });
  var L0 = layout();
  var svg = S('svg', { class: 'viz', viewBox: '0 0 ' + L0.w + ' ' + L0.h, role: 'img', 'aria-label': (p.title || '') + ' ' + curves.map(function (c) { return c.label; }).join(', ') });
  wrap.appendChild(svg); root.appendChild(wrap);
  // The marker's per-curve values and the outputs share one readout grid, so both read the same way.
  var ro = H('div', { class: 'readouts', 'aria-live': 'polite' });
  if (marker) { curves.forEach(function (c) { c.ro = H('div', { class: 'ro' }, '<span>' + esc(c.label) + '</span><b>—</b>'); ro.appendChild(c.ro); }); }
  outs.forEach(function (o) { o.el = H('div', { class: 'ro' }, '<span>' + esc(o.label) + '</span><b>—</b>'); ro.appendChild(o.el); });
  if (marker || outs.length) root.appendChild(ro);

  // One stacked cell for the verdicts: the box keeps the height of the tallest verdict, so a verdict
  // appearing or disappearing never shifts the controls under the reader's cursor.
  var verdictEl = H('div', { class: 'verdict', 'aria-live': 'polite' });
  var verdictStack = null;
  if (verdicts.length) {
    root.appendChild(verdictEl);
    verdictStack = api.stack(verdictEl, verdicts.map(function (v) { return v.text; }));
  }

  function slider(id, label, min, max, step, value, on) {
    var uid = root.parentNode.id + '-' + id;
    var ctl = H('div', { class: 'ctl' }, '<label for="' + esc(uid) + '">' + esc(label) + ' <output>' + value + '</output></label><input type="range" id="' + esc(uid) + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '">');
    var r = ctl.querySelector('input'), o = ctl.querySelector('output');
    r.addEventListener('input', function () { o.textContent = (+r.value).toFixed(step < 1 ? 2 : 0); on(+r.value); });
    return ctl;
  }
  // slider-calc's readout rule: `labels` shows text for an exact value, `best` marks the winning tile
  // with a class only (no box metric changes, so the Lab keeps its height as the mark moves).
  function updateReadouts() {
    var vals = outs.map(function (o) { return o.fn(state); });
    outs.forEach(function (o, i) {
      var shown = o.labels && Object.prototype.hasOwnProperty.call(o.labels, String(vals[i])) ? o.labels[String(vals[i])] : api.fmt(vals[i], o.digits == null ? 3 : o.digits);
      api.setVal(o.el.querySelector('b'), shown);
      var finite = vals.filter(function (v, j) { return outs[j].best === o.best && Number.isFinite(v); });
      var best = o.best === 'min' ? Math.min.apply(null, finite) : o.best === 'max' ? Math.max.apply(null, finite) : NaN;
      o.el.classList.toggle('win', !!o.best && vals[i] === best);
    });
    if (!verdictStack) return;
    for (var k = 0; k < verdicts.length; k++) { if (verdicts[k].fn(state)) { verdictStack.show(k); return; } }
    verdictStack.show(-1);
  }
  function draw() {
    var xmin = xMinOf(), xmax = xMaxOf();
    if (xmax === xmin) xmax = xmin + 1; // a collapsed range still needs a scale to divide by
    var L = layout(), W = L.w, Hh = L.h, pad = L.pad;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Hh);
    // The marker's slider carries the axis bounds, which move with an input when x.max is an expression.
    if (markerInput) {
      markerInput.setAttribute('min', xmin);
      markerInput.setAttribute('max', xmax);
      markerInput.setAttribute('step', (xmax - xmin) / 100);
      if (marker.x < xmin) { marker.x = xmin; markerInput.value = xmin; }
      else if (marker.x > xmax) { marker.x = xmax; markerInput.value = xmax; }
    }
    var xs = null, pts;
    if (discrete) {
      // One sample per integer x: the columns are the distribution, not a smoothed line.
      var lo = Math.ceil(Math.min(xmin, xmax)), hi = Math.floor(Math.max(xmin, xmax));
      xs = [];
      for (var k = lo; k <= hi; k++) xs.push(k);
      pts = curves.map(function (c) {
        return xs.map(function (x) { var v = c.fn(Object.assign({ x: x }, state)); return [x, Number.isFinite(v) ? v : NaN]; });
      });
    } else {
      var N = 200;
      pts = curves.map(function (c) {
        var a = [];
        for (var i = 0; i <= N; i++) { var x = xmin + (xmax - xmin) * i / N, v = c.fn(Object.assign({ x: x }, state)); a.push([x, Number.isFinite(v) ? v : NaN]); }
        return a;
      });
    }
    var all = [].concat.apply([], pts).map(function (q) { return q[1]; }).filter(Number.isFinite);
    var ymin = p.y && p.y.min != null ? p.y.min : Math.min.apply(null, all.concat([0]));
    var ymax = p.y && p.y.max != null ? p.y.max : Math.max.apply(null, all.concat([1e-9]));
    if (ymax === ymin) ymax = ymin + 1;
    var sx = function (x) { return pad.l + (x - xmin) / (xmax - xmin) * (W - pad.l - pad.r); };
    var sy = function (y) { return Hh - pad.b - (y - ymin) / (ymax - ymin) * (Hh - pad.t - pad.b); };
    // A discrete x is a slot, not a point: its column (and its label) sit in the middle of the slot.
    var band = discrete && xs.length ? (W - pad.l - pad.r) / xs.length : 0;
    var xAt = discrete ? function (x) { return pad.l + band * (x - xs[0] + 0.5); } : sx;
    svg.innerHTML = '';
    var g = S('g', { class: 'grid' }, svg), ax = S('g', { class: 'axis' }, svg);
    // Shared "nice numbers" ticks (LykeionMath.ticks) on both axes. The ends are drawn as
    // ticks but only labelled when already round (ends[i]); otherwise the label is skipped
    // so it can never sit on top of the axis end.
    var xt = LykeionMath.ticks(xmin, xmax), yt = LykeionMath.ticks(ymin, ymax);
    var showX = function (v, i) {
      if (v === xmin) return xt.ends[0];
      if (v === xmax) return xt.ends[1];
      return true;
    };
    var showY = function (v, i) {
      if (v === ymin) return yt.ends[0];
      if (v === ymax) return yt.ends[1];
      return true;
    };
    xt.ticks.forEach(function (xv, i) {
      if (discrete && xv !== Math.round(xv)) return; // an integer axis gets integer labels only
      if (showX(xv, i)) S('text', { x: xAt(xv), y: Hh - pad.b + 16, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = LykeionMath.tickLabel(xv, xt.step);
      else S('line', { x1: xAt(xv), x2: xAt(xv), y1: Hh - pad.b, y2: Hh - pad.b + 5 }, ax);
    });
    yt.ticks.forEach(function (yv, i) {
      S('line', { x1: pad.l, x2: W - pad.r, y1: sy(yv), y2: sy(yv) }, g);
      if (showY(yv, i)) S('text', { x: pad.l - 6, y: sy(yv) + 4, class: 'tick', 'text-anchor': 'end' }, svg).textContent = LykeionMath.tickLabel(yv, yt.step);
      else S('line', { x1: pad.l - 5, x2: pad.l, y1: sy(yv), y2: sy(yv) }, ax);
    });
    S('line', { x1: pad.l, x2: W - pad.r, y1: Hh - pad.b, y2: Hh - pad.b }, ax);
    S('line', { x1: pad.l, x2: pad.l, y1: pad.t, y2: Hh - pad.b }, ax);
    S('text', { x: (W + pad.l) / 2, y: Hh - 6, class: 'tick', 'text-anchor': 'middle' }, svg).textContent = X.label || 'x';
    // On a phone the labels are three times their desktop size, so a rotated y title would run into
    // the tick labels beside it: the narrow plot puts the title above the axis instead.
    if (p.y && p.y.label) {
      if (L.yTitleAbove) S('text', { x: pad.l, y: 11, class: 'tick', 'text-anchor': 'start' }, svg).textContent = p.y.label;
      else S('text', { x: 12, y: (Hh - pad.b + pad.t) / 2, class: 'tick', 'text-anchor': 'middle', transform: 'rotate(-90 12 ' + (Hh - pad.b + pad.t) / 2 + ')' }, svg).textContent = p.y.label;
    }
    if (discrete) {
      // Columns rise from y = 0 (or the floor of a fixed range), side by side when there are several
      // curves. A value of 0 draws nothing: a zero column would only be an invisible sliver of ink.
      var slot = band * 0.8, cw = slot / curves.length, base = sy(Math.min(Math.max(0, ymin), ymax));
      pts.forEach(function (a, i) {
        a.forEach(function (q) {
          if (!Number.isFinite(q[1])) return;
          var top = sy(Math.min(Math.max(q[1], ymin), ymax));
          if (!(Math.abs(base - top) > 0)) return;
          S('rect', { x: (xAt(q[0]) - slot / 2 + i * cw).toFixed(1), y: Math.min(top, base).toFixed(1), width: cw.toFixed(1), height: Math.abs(base - top).toFixed(1), fill: curves[i].color }, svg);
        });
      });
    } else {
      pts.forEach(function (a, i) {
        var d = '', pen = false;
        a.forEach(function (q) { if (!Number.isFinite(q[1])) { pen = false; return; } d += (pen ? 'L' : 'M') + sx(q[0]).toFixed(1) + ',' + sy(q[1]).toFixed(1); pen = true; });
        S('path', { d: d, fill: 'none', stroke: curves[i].color, 'stroke-width': 2.5, 'stroke-dasharray': curves[i].dash }, svg);
      });
    }
    if (marker) {
      S('line', { x1: xAt(marker.x), x2: xAt(marker.x), y1: pad.t, y2: Hh - pad.b, stroke: 'var(--ink-2)', 'stroke-dasharray': '4 4' }, svg);
      curves.forEach(function (c) {
        var v = c.fn(Object.assign({ x: marker.x }, state));
        if (Number.isFinite(v)) S('circle', { cx: xAt(marker.x), cy: sy(v), r: 5, fill: c.color, stroke: 'var(--card)', 'stroke-width': 2 }, svg);
        api.setVal(c.ro.querySelector('b'), api.fmt(v, 3));
      });
    }
    updateReadouts();
  }
  draw();
  // Rotating the phone or resizing the window crosses the breakpoint: redraw in the other viewBox.
  if (typeof matchMedia === 'function') {
    var mq = matchMedia(NARROW);
    var onBreak = function () { draw(); };
    if (mq.addEventListener) mq.addEventListener('change', onBreak);
    else if (mq.addListener) mq.addListener(onBreak);
  }
});
