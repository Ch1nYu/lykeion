/* Lab type "slider-calc": sliders in, computed readouts out.
   params: {
     inputs:  [{ id, label, min, max, step, value, unit? }          slider
               | { id, label, value, options: [{ value, label }] }], segmented buttons (categorical)
     outputs: [{ label, expr, digits?, best?: "min"|"max", labels?: { "1": "Yes", "0": "No" } }],
              expr uses input ids + LykeionMath; labels show text for exact values
     bars?:   [{ label, expr, min?, max? }],                       optional horizontal bars (0..max);
              min < 0 draws a centre-zero bar, so a signed value never needs abs()
     verdict?: [{ when, text }]                                    first true "when" expr shows its text
   } */

// Bar geometry as fractions of the track: the fill runs from the zero line to the clamped value.
// With min = 0 the zero line is the left edge, which is the classic one-sided bar.
function sliderBarGeom(v, min, max) {
  if (!(max > min)) return { left: 0, width: 0, zero: 0 };
  var span = max - min;
  var z = Math.min(Math.max(0, min), max);
  var zero = (z - min) / span;
  if (!Number.isFinite(v)) return { left: zero, width: 0, zero: zero };
  var c = Math.min(Math.max(v, min), max);
  return { left: (Math.min(c, z) - min) / span, width: Math.abs(c - z) / span, zero: zero };
}

Lykeion.registerLab('slider-calc', function (root, p, api) {
  var H = api.H, esc = api.esc;
  var ids = (p.inputs || []).map(function (i) { return i.id; });
  var outs = (p.outputs || []).map(function (o) { return Object.assign({ fn: LykeionMath.compile(o.expr, ids) }, o); });
  var bars = (p.bars || []).map(function (b) { return Object.assign({ fn: LykeionMath.compile(b.expr, ids) }, b); });
  var verdicts = (p.verdict || []).map(function (v) { return { fn: LykeionMath.compile(v.when, ids), text: v.text }; });
  var state = {};

  var controls = H('div', { class: 'controls' });
  (p.inputs || []).forEach(function (inp) {
    state[inp.id] = Number(inp.value);
    var ctl = H('div', { class: 'ctl' });
    var uid = root.parentNode.id + '-' + inp.id;
    if (inp.options) {
      // Categorical input: segmented buttons, each carrying a numeric value for the expressions.
      ctl.innerHTML = '<span class="lbl" id="' + esc(uid) + '">' + esc(inp.label) + '</span>';
      var seg = H('div', { class: 'seg', role: 'group', 'aria-labelledby': uid });
      inp.options.forEach(function (o) { seg.appendChild(H('button', { type: 'button', 'data-v': String(o.value) }, esc(o.label))); });
      api.setSeg(seg, inp.value);
      api.onSeg(seg, function (v) { state[inp.id] = Number(v); update(); });
      ctl.appendChild(seg);
      controls.appendChild(ctl);
      return;
    }
    ctl.innerHTML = '<label for="' + esc(uid) + '">' + esc(inp.label) + ' <output>' + esc(inp.value) + (inp.unit || '') + '</output></label>' +
      '<input type="range" id="' + esc(uid) + '" min="' + inp.min + '" max="' + inp.max + '" step="' + (inp.step || 1) + '" value="' + inp.value + '">';
    var range = ctl.querySelector('input'), out = ctl.querySelector('output');
    range.addEventListener('input', function () { state[inp.id] = Number(range.value); out.textContent = range.value + (inp.unit || ''); update(); });
    controls.appendChild(ctl);
  });
  root.appendChild(controls);

  var ro = H('div', { class: 'readouts', 'aria-live': 'polite' });
  outs.forEach(function (o) { o.el = H('div', { class: 'ro' }, '<span>' + esc(o.label) + '</span><b>—</b>'); ro.appendChild(o.el); });
  if (outs.length) root.appendChild(ro);

  var barWrap = H('div', { class: 'bars2' });
  bars.forEach(function (b) {
    b.signed = b.min != null && Number(b.min) < 0;
    b.el = H('div', { class: b.signed ? 'hbar signed' : 'hbar' },
      '<span>' + esc(b.label) + '</span><span class="track">' + (b.signed ? '<u></u>' : '') + '<i></i></span><b>—</b>');
    barWrap.appendChild(b.el);
  });
  if (bars.length) root.appendChild(barWrap);

  // One stacked cell for the verdicts: the box keeps the height of the tallest verdict, so a verdict
  // appearing or disappearing never shifts the controls under the reader's cursor.
  var verdictEl = H('div', { class: 'verdict', 'aria-live': 'polite' });
  var verdictStack = null;
  if (verdicts.length) {
    root.appendChild(verdictEl);
    verdictStack = api.stack(verdictEl, verdicts.map(function (v) { return v.text; }));
  }

  function update() {
    var vals = outs.map(function (o) { return o.fn(state); });
    outs.forEach(function (o, i) {
      var shown = o.labels && Object.prototype.hasOwnProperty.call(o.labels, String(vals[i])) ? o.labels[String(vals[i])] : api.fmt(vals[i], o.digits == null ? 3 : o.digits);
      api.setVal(o.el.querySelector('b'), shown);
      var finite = vals.filter(function (v, j) { return outs[j].best === o.best && Number.isFinite(v); });
      var best = o.best === 'min' ? Math.min.apply(null, finite) : o.best === 'max' ? Math.max.apply(null, finite) : NaN;
      o.el.classList.toggle('win', !!o.best && vals[i] === best);
    });
    var bv = bars.map(function (b) { return b.fn(state); });
    var scale = Math.max.apply(null, bars.map(function (b, i) { return b.max != null ? b.max : bv[i]; }).concat([1e-9]));
    bars.forEach(function (b, i) {
      var fill = b.el.querySelector('i');
      if (b.signed) {
        var g = sliderBarGeom(bv[i], Number(b.min), b.max != null ? Number(b.max) : 0);
        b.el.querySelector('u').style.left = g.zero * 100 + '%';
        fill.style.left = g.left * 100 + '%';
        fill.style.width = g.width * 100 + '%';
        fill.classList.toggle('neg', bv[i] < 0);
        fill.classList.toggle('pos', bv[i] > 0);
      } else {
        fill.style.width = sliderBarGeom(bv[i], 0, scale).width * 100 + '%';
      }
      b.el.querySelector('b').textContent = api.fmt(bv[i], b.digits == null ? 3 : b.digits);
    });
    if (!verdictStack) return;
    for (var k = 0; k < verdicts.length; k++) { if (verdicts[k].fn(state)) { verdictStack.show(k); return; } }
    verdictStack.show(-1);
  }
  update();
});
