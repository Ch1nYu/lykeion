/* Lab type "stepper": walk through an algorithm one state at a time.
   params: { steps: [{ label, text?, table?: { head, rows, highlight? }, chips?: [{ text, state?, note? }] }],
             start?, legend?: { good?, bad?, muted? } }
   Chip `state` is one of good | bad | muted; `legend` names the states the reader needs labelled and
   is drawn with the very same chip markup, so a swatch cannot drift from a chip. */
Lykeion.registerLab('stepper', function (root, p, api) {
  var H = api.H, esc = api.esc;
  var steps = p.steps || [];
  if (!steps.length) throw new Error('stepper needs at least one step');
  var cur = Math.min(Math.max(0, p.start || 0), steps.length - 1);
  var STATES = ['good', 'bad', 'muted'];

  var controls = H('div', { class: 'controls' });
  var seg = H('div', { class: 'seg', role: 'group', 'aria-label': p.title || 'steps' });
  steps.forEach(function (s, i) { seg.appendChild(H('button', { type: 'button', 'data-v': String(i) }, esc(s.label || String(i + 1)))); });
  var prev = H('button', { type: 'button', class: 'btn' }, '←');
  prev.setAttribute('aria-label', '上一步');
  var next = H('button', { type: 'button', class: 'btn primary' }, '下一步');
  controls.appendChild(seg); controls.appendChild(prev); controls.appendChild(next);
  root.appendChild(controls);

  // Only the states the author named get a legend entry: a label is content, not a default.
  var legend = H('div', { class: 'legend stepper-legend' });
  STATES.forEach(function (state) {
    if (!p.legend || p.legend[state] == null) return;
    legend.appendChild(H('span', {}, '<span class="chip ' + state + '">' + esc(String(p.legend[state])) + '</span>'));
  });
  if (legend.children.length) root.appendChild(legend);

  var view = H('div', { class: 'step-view', 'aria-live': 'polite' });
  root.appendChild(view);

  function render() {
    var s = steps[cur];
    api.setSeg(seg, cur);
    prev.disabled = cur === 0; next.disabled = cur === steps.length - 1;
    var html = '';
    if (s.text) html += '<div class="verdict">' + s.text + '</div>';
    if (s.chips && s.chips.length) {
      html += '<div class="chips">' + s.chips.map(function (c) {
        return '<span class="chip ' + esc(c.state || '') + '">' + esc(c.text) + (c.note ? ' <small>' + c.note + '</small>' : '') + '</span>';
      }).join('') + '</div>';
    }
    if (s.table) {
      var hl = s.table.highlight || [];
      html += '<div class="tablewrap" style="margin:0"><table class="data"><thead><tr>' + (s.table.head || []).map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        (s.table.rows || []).map(function (r, i) { return '<tr class="' + (hl.length ? (hl.indexOf(i) >= 0 ? 'on' : 'dim') : '') + '">' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    }
    view.innerHTML = html;
  }
  api.onSeg(seg, function (v) { cur = +v; render(); });
  prev.addEventListener('click', function () { if (cur > 0) { cur--; render(); } });
  next.addEventListener('click', function () { if (cur < steps.length - 1) { cur++; render(); } });
  render();
});
