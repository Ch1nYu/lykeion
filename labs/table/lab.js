/* Lab type "table": editable contingency table / matrix with live outputs.
   params: { names: [[..]], rows: [..], cols: [..], values: [[..]], margins?, outputs?: [{ label, expr, digits?, labels? }],
             actions?: [{ label, set?: { name: expr }, reset? }], verdict?: [{ when, text }] } */
Lykeion.registerLab('table', function (root, p, api) {
  var H = api.H, esc = api.esc;
  var names = p.names || [];
  var flat = [].concat.apply([], names);
  if (!flat.length) throw new Error('table needs "names"');
  var initial = {};
  names.forEach(function (row, r) { row.forEach(function (n, c) { initial[n] = Number((p.values || [])[r] ? p.values[r][c] : 0) || 0; }); });
  var state = Object.assign({}, initial);
  var outs = (p.outputs || []).map(function (o) { return Object.assign({ fn: LykeionMath.compile(o.expr, flat) }, o); });
  var verdicts = (p.verdict || []).map(function (v) { return { fn: LykeionMath.compile(v.when, flat), text: v.text }; });
  var actions = (p.actions || []).map(function (a) {
    var setters = Object.keys(a.set || {}).map(function (k) { return { k: k, fn: LykeionMath.compile(String(a.set[k]), flat) }; });
    return { label: a.label, reset: !!a.reset, setters: setters };
  });

  var labId = root.parentNode.id;
  var t = '<div class="tablewrap" style="margin:0"><table class="ctab"><thead><tr><th></th>' + (p.cols || []).map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('') + (p.margins ? '<th scope="col">Σ</th>' : '') + '</tr></thead><tbody>';
  names.forEach(function (row, r) {
    t += '<tr><th scope="row">' + esc((p.rows || [])[r] || '') + '</th>' + row.map(function (n) {
      return '<td><input type="number" min="0" step="any" id="' + esc(labId + '-' + n) + '" data-n="' + esc(n) + '" aria-label="' + esc(((p.rows || [])[r] || '') + ' / ' + ((p.cols || [])[row.indexOf(n)] || '') + ' (' + n + ')') + '"></td>';
    }).join('') + (p.margins ? '<td class="m" data-row="' + r + '"></td>' : '') + '</tr>';
  });
  if (p.margins) t += '<tr><th scope="row">Σ</th>' + (names[0] || []).map(function (_, c) { return '<td class="m" data-col="' + c + '"></td>'; }).join('') + '<td class="m" data-all="1"></td></tr>';
  t += '</tbody></table></div>';
  var tableWrap = H('div', {}, t);
  root.appendChild(tableWrap);
  var inputs = [].slice.call(tableWrap.querySelectorAll('input'));

  if (actions.length) {
    var bar = H('div', { class: 'controls' });
    actions.forEach(function (a) {
      var b = H('button', { type: 'button', class: 'btn' }, esc(a.label));
      b.addEventListener('click', function () {
        if (a.reset) state = Object.assign({}, initial);
        else { var snap = Object.assign({}, state); a.setters.forEach(function (s) { state[s.k] = Math.max(0, Number(s.fn(snap)) || 0); }); }
        sync(); update();
      });
      bar.appendChild(b);
    });
    root.appendChild(bar);
  }

  var ro = H('div', { class: 'readouts', 'aria-live': 'polite' });
  outs.forEach(function (o) { o.el = H('div', { class: 'ro' }, '<span>' + esc(o.label) + '</span><b>—</b>'); ro.appendChild(o.el); });
  if (outs.length) root.appendChild(ro);
  // One stacked cell for the verdicts: the box keeps the height of the tallest verdict, so a verdict
  // appearing or disappearing never shifts the table under the reader's cursor.
  var verdictEl = H('div', { class: 'verdict', 'aria-live': 'polite' });
  var verdictStack = null;
  if (verdicts.length) {
    root.appendChild(verdictEl);
    verdictStack = api.stack(verdictEl, verdicts.map(function (v) { return v.text; }));
  }

  function sync() { inputs.forEach(function (i) { i.value = state[i.dataset.n]; }); }
  function update() {
    if (p.margins) {
      var all = 0;
      names.forEach(function (row, r) { var s = row.reduce(function (a, n) { return a + state[n]; }, 0); all += s; tableWrap.querySelector('[data-row="' + r + '"]').textContent = s; });
      (names[0] || []).forEach(function (_, c) { tableWrap.querySelector('[data-col="' + c + '"]').textContent = names.reduce(function (a, row) { return a + state[row[c]]; }, 0); });
      tableWrap.querySelector('[data-all]').textContent = all;
    }
    outs.forEach(function (o) { var v = o.fn(state); api.setVal(o.el.querySelector('b'), o.labels && Object.prototype.hasOwnProperty.call(o.labels, String(v)) ? o.labels[String(v)] : api.fmt(v, o.digits == null ? 3 : o.digits)); });
    if (!verdictStack) return;
    for (var k = 0; k < verdicts.length; k++) { if (verdicts[k].fn(state)) { verdictStack.show(k); return; } }
    verdictStack.show(-1);
  }
  inputs.forEach(function (i) { i.addEventListener('input', function () { var v = Number(i.value); state[i.dataset.n] = Number.isFinite(v) && v >= 0 ? v : 0; update(); }); });
  sync(); update();
});
