/* Lab type "itemsets": transactions + minsup → which itemsets are frequent / closed / maximal,
   drawn as an itemset lattice. The support counts come from LykeionMath.itemsets, the same pure
   function `lykeion verify` recomputes from the params, so the page and the gate cannot drift.
   params: {
     transactions: [{ tid, items: [string] }],                 required, 1–20 baskets, 1–6 distinct items
     minsup:       { value, min?, max? },                      absolute support count (slider)
     show?:        [frequent|closed|maximal],                  which readouts + legend states to show
     verdict?:     [{ when, text }]                            expr over minsup, nFrequent, nClosed, nMaximal
   } */
Lykeion.registerLab('itemsets', function (root, p, api) {
  var H = api.H, S = api.S, esc = api.esc;
  var tx = p.transactions || [];
  if (!tx.length) throw new Error('itemsets needs "transactions"');
  var STATES = [
    { key: 'frequent', label: '頻繁', cls: 'st-frequent' },
    { key: 'closed', label: '封閉', cls: 'st-closed' },
    { key: 'maximal', label: '最大', cls: 'st-maximal' }
  ];
  var want = p.show && p.show.length ? STATES.filter(function (s) { return p.show.indexOf(s.key) >= 0; }) : STATES;
  if (!want.length) throw new Error('itemsets "show" lists no known state');
  var ms = p.minsup || {};
  var max = Number(ms.max) || tx.length, min = Number(ms.min) || 1;
  if (!(max >= min)) max = min;
  var value = Math.min(Math.max(Number(ms.value) || min, min), max);
  var verdicts = (p.verdict || []).map(function (v) {
    return { fn: LykeionMath.compile(v.when, ['minsup', 'nFrequent', 'nClosed', 'nMaximal']), text: v.text };
  });

  var labId = root.parentNode.id;
  var uid = labId + '-minsup';
  var controls = H('div', { class: 'controls' },
    '<div class="ctl"><label for="' + esc(uid) + '">minsup <output>' + value + '</output></label>' +
    '<input type="range" id="' + esc(uid) + '" min="' + min + '" max="' + max + '" step="1" value="' + value + '"></div>');
  root.appendChild(controls);
  var range = controls.querySelector('input'), out = controls.querySelector('output');

  var ro = H('div', { class: 'readouts', 'aria-live': 'polite' });
  var cells = {};
  want.forEach(function (st) {
    cells[st.key] = H('div', { class: 'ro', 'data-count': st.key }, '<span>' + esc(st.label) + ' 項目集</span><b>—</b>');
    ro.appendChild(cells[st.key]);
  });
  root.appendChild(ro);

  // Lattice geometry: one row per itemset size, empty set above level 1. A node box holds the
  // label and its σ side by side, so boxes never overlap. The viewBox grows with the widest level
  // and the SVG keeps width:100% but never renders narrower than its viewBox (see draw), so node
  // text keeps its authored size and .vizwrap scrolls instead of the page overflowing.
  var ROW = 62, TOP = 20, NODE_H = 26, GAP = 10, PAD = 11, SIG = 32, RX = 9, BASELINE = 17;

  // A legend swatch is a miniature node built from the node's own classes and box geometry, so the
  // swatch and the lattice cannot drift apart about what a state looks like. The viewBox is inset
  // by LG_INSET so the box stroke stays inside the swatch's own bounds.
  var LG_W = 34, LG_INSET = 2;
  function swatch(state, label) {
    var w = LG_W + LG_INSET * 2, h = NODE_H + LG_INSET * 2;
    return '<svg class="lg lat-node ' + state + '" width="' + w + '" height="' + h + '" viewBox="' + (-LG_INSET) + ' ' + (-LG_INSET) + ' ' + w + ' ' + h + '" aria-hidden="true">' +
      '<rect x="0" y="0" width="' + LG_W + '" height="' + NODE_H + '" rx="' + RX + '"></rect>' +
      '<text class="lat-txt" x="' + PAD + '" y="' + BASELINE + '">' + esc(label) + '</text></svg>';
  }
  var legend = H('div', { class: 'legend itemsets-legend' },
    '<span>' + swatch('infrequent', 'A') + '不頻繁（σ &lt; minsup）</span>' +
    want.map(function (st) { return '<span>' + swatch(st.key, 'A') + esc(st.label) + '</span>'; }).join('') +
    '<span>' + swatch('empty', '∅') + '空集合 ∅（不計入統計）</span>');
  root.appendChild(legend);

  var wrap = H('div', { class: 'vizwrap' });
  var svg = S('svg', { class: 'viz lattice', viewBox: '0 0 600 100', role: 'img', 'aria-label': (p.title || '項目集晶格') + '：節點標籤與支持度 σ' });
  wrap.appendChild(svg);
  root.appendChild(wrap);

  var verdictEl = H('div', { class: 'verdict', 'aria-live': 'polite' });
  if (verdicts.length) root.appendChild(verdictEl);

  function geom(res) {
    var empty = { label: '∅', items: [], size: 0, sigma: res.n, empty: true };
    var levels = [[empty]];
    for (var k = 1; k <= res.universe.length; k++) levels.push(res.sets.filter(function (s) { return s.size === k; }));
    var widths = levels.map(function (l) { return l.map(function (s) { return s.label.length * 6.8 + PAD * 2 + SIG; }); });
    var lw = widths.map(function (a) { return a.reduce(function (x, y) { return x + y; }, 0) + GAP * Math.max(0, a.length - 1); });
    var width = Math.max.apply(null, lw.concat([600]));
    levels.forEach(function (l, k) {
      var x = (width - lw[k]) / 2;
      l.forEach(function (s, i) { s.w = widths[k][i]; s.cx = x + s.w / 2; s.y = TOP + k * ROW; x += s.w + GAP; });
    });
    return { levels: levels, width: width, height: TOP + levels.length * ROW };
  }
  function draw() {
    var res = LykeionMath.itemsets(tx, Number(range.value));
    var g = geom(res);
    var cell = function (el, txt) { el.textContent = txt; return el; };
    cell(out, String(res.minsup));
    want.forEach(function (st) { api.setVal(cells[st.key].querySelector('b'), String(res.counts[st.key])); });
    svg.setAttribute('viewBox', '0 0 ' + g.width + ' ' + g.height);
    // Keep the SVG at least as wide as its viewBox: below 1:1 the 12px node text becomes unreadable.
    // .vizwrap is the scroll container, so a narrow screen scrolls the lattice instead of the page.
    svg.style.minWidth = g.width + 'px';
    svg.setAttribute('aria-label', (p.title || '項目集晶格') + '：minsup ' + res.minsup + '，頻繁 ' + res.counts.frequent + '、封閉 ' + res.counts.closed + '、最大 ' + res.counts.maximal);
    svg.innerHTML = '';
    var edges = S('g', { class: 'lat-edges' }, svg);
    var nodes = S('g', { class: 'lat-nodes' }, svg);
    g.levels.forEach(function (level, k) {
      level.forEach(function (s) {
        if (k === 0) return;
        g.levels[k - 1].forEach(function (t) {
          if (t.items.every(function (x) { return s.items.indexOf(x) >= 0; })) {
            S('line', { x1: t.cx, y1: t.y + NODE_H, x2: s.cx, y2: s.y, class: 'lat-edge' }, edges);
          }
        });
      });
    });
    g.levels.forEach(function (level) {
      level.forEach(function (s) {
        var state = s.empty ? 'empty' : !s.frequent ? 'infrequent' : s.maximal ? 'maximal' : s.closed ? 'closed' : 'frequent';
        // "muted" only dims the states the reader asked not to see; infrequent and ∅ keep their own look.
        var cls = 'lat-node ' + state + (state !== 'infrequent' && state !== 'empty' && !want.some(function (st) { return st.key === state; }) ? ' muted' : '');
        var node = S('g', { class: cls, transform: 'translate(' + s.cx + ',' + s.y + ')' }, nodes);
        S('rect', { x: -s.w / 2, y: 0, width: s.w, height: NODE_H, rx: RX }, node);
        var t = S('text', { y: BASELINE, x: -s.w / 2 + PAD, class: 'lat-txt' }, node);
        t.textContent = s.label;
        var sig = S('text', { y: BASELINE, x: s.w / 2 - PAD, class: 'lat-sigma' }, node);
        sig.textContent = 'σ=' + s.sigma;
      });
    });
    for (var i = 0; i < verdicts.length; i++) {
      var v = { minsup: res.minsup, nFrequent: res.counts.frequent, nClosed: res.counts.closed, nMaximal: res.counts.maximal };
      if (verdicts[i].fn(v)) { verdictEl.innerHTML = verdicts[i].text; verdictEl.hidden = false; return; }
    }
    verdictEl.innerHTML = '';
    verdictEl.hidden = true;
  }
  range.addEventListener('input', draw);
  draw();
});
