/* Lab type "tree": grow a decision tree by Hunt's algorithm on a small categorical data set.
   The reader picks the split at each node (or lets the Lab pick the best one), watches the
   candidate gains change with the impurity measure, and then classifies a record with the tree.
   Every number comes from LykeionMath.treeSplits / treeGrow / treeError — the same pure functions
   `lykeion verify` recomputes from the params, so the page and the gate cannot drift.
   params: {
     attributes: [{ name, values: [string] }],   required, 1–4 categorical attributes, 2–4 values each
     class:      { name, values: [string] },     required, 2–3 classes
     records:    [{ <attr>: value, …, <class.name>: value }],  required, 1–16 records
     measure?:   gini | entropy | error,         default gini; the reader can switch it
     split?:     multiway | binary,              default multiway (binary = one value vs the rest)
     verdict?:   [{ when, text }]                expr over depth, leaves, trainingError, measure, measureIndex
   } */
Lykeion.registerLab('tree', function (root, p, api) {
  var H = api.H, S = api.S, esc = api.esc, fmt = api.fmt;
  var attrs = p.attributes || [], cls = p.class || {}, records = p.records || [];
  if (!attrs.length) throw new Error('tree needs "attributes"');
  if (!cls.values || !cls.values.length) throw new Error('tree needs "class"');
  if (!records.length) throw new Error('tree needs "records"');
  var MEASURES = [{ key: 'gini', label: 'Gini' }, { key: 'entropy', label: 'Entropy' }, { key: 'error', label: '錯誤率' }];
  var measure = MEASURES.some(function (m) { return m.key === p.measure; }) ? p.measure : 'gini';
  var split = p.split === 'binary' ? 'binary' : 'multiway';
  var verdicts = (p.verdict || []).map(function (v) {
    return { fn: LykeionMath.compile(v.when, ['depth', 'leaves', 'trainingError', 'measure', 'measureIndex']), text: v.text };
  });

  // The whole tree is plain data (see mathlib): `attr` null on a leaf. `grownWith` records the
  // measure that shaped the current structure, so the Lab can say so when the reader switches.
  var tree = LykeionMath.treeLeaf(records, cls, measure);
  var grownWith = measure;
  var sel = [];                                  // path from the root to the selected node
  var scrollToRoot = true;                       // put the root in view on the next draw
  var fitted = null;                             // the width/scale the last draw settled on
  var pick = {};                                 // the record being classified, one value per attribute
  attrs.forEach(function (a) { pick[a.name] = a.values[0]; });

  var labId = root.parentNode.id;
  var controls = H('div', { class: 'controls' });
  var seg = H('div', { class: 'seg', role: 'group', 'aria-label': '不純度指標' });
  MEASURES.forEach(function (m) { seg.appendChild(H('button', { type: 'button', 'data-v': m.key }, m.label)); });
  var measureCtl = H('div', { class: 'ctl' }, '<span class="lbl">不純度指標</span>');
  measureCtl.appendChild(seg);
  controls.appendChild(measureCtl);
  var acts = H('div', { class: 'ctl' }, '<span class="lbl">長樹</span>');
  var actRow = H('div', { class: 'tree-acts' });
  var btnBest = H('button', { class: 'btn', 'data-act': 'best', type: 'button' }, '用最佳屬性分割');
  var btnAuto = H('button', { class: 'btn primary', 'data-act': 'auto', type: 'button' }, '自動長滿');
  var btnReset = H('button', { class: 'btn', 'data-act': 'reset', type: 'button' }, '重設');
  [btnBest, btnAuto, btnReset].forEach(function (b) { actRow.appendChild(b); });
  acts.appendChild(actRow);
  controls.appendChild(acts);
  root.appendChild(controls);

  var ro = H('div', { class: 'readouts', 'aria-live': 'polite' });
  var cells = {};
  [['depth', '深度'], ['leaves', '葉節點'], ['error', '訓練錯誤率']].forEach(function (d) {
    cells[d[0]] = H('div', { class: 'ro', 'data-out': d[0] }, '<span>' + esc(d[1]) + '</span><b>—</b>');
    ro.appendChild(cells[d[0]]);
  });
  root.appendChild(ro);

  // Legend swatches are the node markup at legend size (same classes, same box), so the legend
  // cannot drift from the lattice it explains. The label is centred in the box exactly as a node's
  // is (nodes are translated to their centre and draw text at x=0), hence x = LG_W / 2 here.
  var NODE_H = 46, ROW = 86, HGAP = 12, PAD = 7, RX = 10;
  // The label's authored size and the smallest size it may be scaled down to: the gap between them
  // is the whole scale-down range the fit above can use, so it is deliberately not 1:1.
  var FONT_SIZE = 14, MIN_FONT = 12, MIN_SCALE = MIN_FONT / FONT_SIZE;
  var LG_W = 52, LG_INSET = 2;
  function swatch(state, label) {
    var w = LG_W + LG_INSET * 2, h = NODE_H + LG_INSET * 2;
    return '<svg class="lg tnode ' + state + '" width="' + w + '" height="' + h + '" viewBox="' + (-LG_INSET) + ' ' + (-LG_INSET) + ' ' + w + ' ' + h + '" aria-hidden="true">' +
      '<rect class="t-box" x="0" y="0" width="' + LG_W + '" height="' + NODE_H + '" rx="' + RX + '"></rect>' +
      '<text class="t-lbl" x="' + (LG_W / 2) + '" y="' + (NODE_H / 2 + 5) + '">' + esc(label) + '</text></svg>';
  }
  var legend = H('div', { class: 'legend tree-legend' },
    '<span>' + swatch('test', 'Wind') + '分割節點</span>' +
    '<span>' + swatch('pure', 'Yes') + '純葉</span>' +
    '<span>' + swatch('impure', 'Yes') + '不純葉（多數類別）</span>' +
    '<span>' + swatch('inherited', '→ Yes') + '空節點（繼承父節點多數類別）</span>');
  root.appendChild(legend);

  var wrap = H('div', { class: 'vizwrap' });
  var svg = S('svg', { class: 'viz tree', viewBox: '0 0 600 200', role: 'img', 'aria-label': (p.title || '決策樹') });
  wrap.appendChild(svg);
  root.appendChild(wrap);

  var cand = H('div', { class: 'tree-cands', 'aria-live': 'polite' });
  root.appendChild(cand);

  var classify = H('div', { class: 'classify' });
  var classifySegs = {};
  var clHead = H('div', { class: 'classify-head' }, '<span class="lbl">用這棵樹分類一筆紀錄</span>');
  classify.appendChild(clHead);
  attrs.forEach(function (a) {
    var row = H('div', { class: 'ctl' }, '<span class="lbl">' + esc(a.name) + '</span>');
    var s = H('div', { class: 'seg', role: 'group', 'aria-label': a.name });
    a.values.forEach(function (v) { s.appendChild(H('button', { type: 'button', 'data-v': v }, v)); });
    classifySegs[a.name] = s;
    row.appendChild(s);
    classify.appendChild(row);
  });
  var clOut = H('div', { class: 'classify-out', 'aria-live': 'polite' });
  classify.appendChild(clOut);
  root.appendChild(classify);

  var verdictEl = H('div', { class: 'verdict', 'aria-live': 'polite' });
  if (verdicts.length) root.appendChild(verdictEl);

  var note = H('div', { class: 'tree-note' });
  root.appendChild(note);

  function nodeAt(path) {
    var n = tree;
    for (var i = 0; i < path.length; i++) {
      if (!n.children || !n.children[path[i]]) return tree;
      n = n.children[path[i]];
    }
    return n;
  }
  function availFor(path) {
    var used = [], n = tree;
    for (var i = 0; i < path.length; i++) { used.push(n.attr); n = n.children[path[i]]; }
    return attrs.filter(function (a) { return used.indexOf(a.name) < 0; });
  }
  function splittable(node) { return !!node && !node.attr && node.n > 0 && !node.pure && availFor(sel).length > 0; }
  function countsText(counts) {
    return cls.values.map(function (v, i) { return v + ' ' + counts[i]; }).join(' · ');
  }
  function stateOf(node) { return node.attr ? 'test' : node.n === 0 ? 'inherited' : node.pure ? 'pure' : 'impure'; }
  function labelOf(node) {
    if (node.attr) return node.attr;
    return (node.n === 0 ? '\u2192 ' : '') + node.majority;
  }
  function countsOf(n) { return n.n === 0 ? '繼承 · 0 筆' : countsText(n.counts); }

  // A node is on the classified record's path when its own path is a prefix of that record's full
  // path. The exact-match test this replaced lit only the last edge, so the route the record took
  // through the tree was invisible and the panel looked like it only coloured one line.
  function isPrefix(p, hit) {
    if (p.length > hit.length) return false;
    for (var i = 0; i < p.length; i++) if (p[i] !== hit[i]) return false;
    return true;
  }
  function samePath(a, b) { return a.length === b.length && isPrefix(a, b); }

  // Top-down structure: leaves take consecutive slots, every parent is centred over its children.
  function walkRows(node) {
    var slot = 0, rows = [];
    function walk(n, d, path) {
      n._d = d; n._path = path;
      rows.push(n);
      if (!n.children || !n.children.length) { n._x = slot++; return; }
      n.children.forEach(function (c, i) { walk(c, d + 1, path.concat(i)); });
      n._x = (n.children[0]._x + n.children[n.children.length - 1]._x) / 2;
    }
    walk(node, 0, []);
    return rows;
  }
  // Every box shares one width: the widest label or counts text in the tree plus padding. Measuring
  // the rendered text (rather than guessing from a character count) is what keeps the boxes as
  // narrow as they can be, and a narrow drawing is what lets a wide tree fit the column at 12px
  // instead of being cut off. The probe is a real `.tnode` so it measures with the node's own font.
  function measureWidest(rows) {
    var probe = S('g', { class: 'tnode t-probe', 'aria-hidden': 'true' }, svg), max = 0;
    rows.forEach(function (n) {
      [[labelOf(n), 't-lbl'], [countsOf(n), 't-cnt']].forEach(function (t) {
        var el = S('text', { x: 0, y: 0, class: t[1] }, probe);
        el.textContent = t[0];
        max = Math.max(max, el.getBBox().width);
      });
    });
    svg.removeChild(probe);
    return max;
  }
  function position(rows, widest) {
    var w = Math.max(64, Math.ceil(widest) + PAD * 2);
    rows.forEach(function (n) { n._w = w; n._cx = PAD + w / 2 + n._x * (w + HGAP); });
    return { rows: rows, width: PAD * 2 + rows.filter(function (n) { return !n.children.length; }).length * (w + HGAP) - HGAP,
      height: PAD * 2 + (rows.reduce(function (m, n) { return Math.max(m, n._d); }, 0) + 1) * ROW - (ROW - NODE_H) };
  }
  // The child index a record follows at every level, i.e. the path the classify panel highlights.
  function pathFor(node, record) {
    var out = [];
    while (node && node.attr && node.children.length) {
      var v = String(record[node.attr]), next = -1;
      for (var i = 0; i < node.children.length; i++) if ((node.children[i].values || []).indexOf(v) >= 0) { next = i; break; }
      if (next < 0) break;
      out.push(next);
      node = node.children[next];
    }
    return out;
  }
  function splitAt(path, attrName) {
    var node = nodeAt(path);
    if (!node || node.attr || node.n === 0 || node.pure) return false;
    var avail = availFor(path);
    if (!avail.length) return false;
    var next = LykeionMath.treeSplit(node.records, avail, cls, measure, split, attrName === undefined ? null : attrName);
    if (!next) return false;
    next.label = node.label; next.values = node.values;
    if (!path.length) tree = next;
    else { var parent = nodeAt(path.slice(0, -1)); parent.children[path[path.length - 1]] = next; }
    grownWith = measure;
    return true;
  }

  function draw() {
    var node = nodeAt(sel);
    var rows = walkRows(tree);
    var g = position(rows, measureWidest(rows));
    svg.setAttribute('viewBox', '0 0 ' + g.width + ' ' + g.height);
    // Fit the tree to the column for as long as the node text stays readable: the label is authored
    // at FONT_SIZE and may only shrink to MIN_FONT, so a wide tree scales down just enough to fit
    // and only scrolls once it would go below that floor. `max-width:none` undoes base.css's
    // `img,svg{max-width:100%}`, which would otherwise squash the drawing instead of scrolling it.
    var avail = wrap.clientWidth;
    var scale = avail > 0 ? Math.min(1, avail / g.width) : 1;
    if (scale < MIN_SCALE) scale = MIN_SCALE;
    svg.style.width = (g.width * scale) + 'px';
    svg.style.maxWidth = 'none';
    svg.style.margin = '0 auto';
    fitted = { width: g.width, scale: scale };
    var stats = LykeionMath.treeStats(tree);
    var err = LykeionMath.treeError(tree, records, cls);
    api.setVal(cells.depth.querySelector('b'), String(stats.depth));
    api.setVal(cells.leaves.querySelector('b'), String(stats.leaves));
    api.setVal(cells.error.querySelector('b'), fmt(err, 3));
    svg.setAttribute('aria-label', (p.title || '決策樹') + '：深度 ' + stats.depth + '，葉節點 ' + stats.leaves + '，訓練錯誤率 ' + fmt(err, 3));

    var hit = pathFor(tree, pick);
    svg.innerHTML = '';
    var edges = S('g', { class: 't-edges' }, svg);
    var nodes = S('g', { class: 't-nodes' }, svg);
    g.rows.forEach(function (n) {
      var y = PAD + n._d * ROW;
      var on = isPrefix(n._path, hit);
      if (n._path.length) {
        var pn = nodeAt(n._path.slice(0, -1));
        var py = PAD + pn._d * ROW + NODE_H;
        S('line', { x1: pn._cx, y1: py, x2: n._cx, y2: y, class: 't-edge' + (on ? ' on' : '') }, edges);
        var lbl = S('text', { x: (pn._cx + n._cx) / 2, y: (py + y) / 2 + 4, class: 't-edge-txt' + (on ? ' on' : '') }, edges);
        lbl.textContent = n.label;
        // The label straddles the edge line, so it gets a card-coloured backing of its own; the
        // text is measured rather than estimated so the backing always covers it exactly.
        var lb = lbl.getBBox();
        edges.insertBefore(S('rect', { x: lb.x - 2, y: lb.y - 1, width: lb.width + 4, height: lb.height + 2, rx: 3, class: 't-edge-bg' }, null), lbl);
      }
      var st = stateOf(n);
      var g2 = S('g', { class: 'tnode ' + st + (samePath(n._path, sel) ? ' sel' : '') + (on ? ' hit' : ''), transform: 'translate(' + n._cx + ',' + y + ')' }, nodes);
      if (samePath(n._path, sel) || on) {
        S('rect', { x: -n._w / 2 - 5, y: -5, width: n._w + 10, height: NODE_H + 10, rx: RX + 4, class: 't-ring' + (on ? ' hit' : '') }, g2);
      }
      S('rect', { x: -n._w / 2, y: 0, width: n._w, height: NODE_H, rx: RX, class: 't-box' }, g2);
      var t1 = S('text', { x: 0, y: 19, class: 't-lbl' }, g2);
      t1.textContent = labelOf(n);
      var t2 = S('text', { x: 0, y: 35, class: 't-cnt' }, g2);
      t2.textContent = countsOf(n);
      S('title', {}, g2).textContent = (n.attr ? '分割：' + n.attr : '葉：' + n.majority) + ' · ' + n.n + ' 筆 · ' + countsText(n.counts);
      g2.addEventListener('click', function () { sel = n._path; draw(); });
    });

    btnBest.disabled = !splittable(node);
    btnAuto.disabled = tree.pure || tree.n === 0 || !attrs.length;

    // Candidate table for the selected node: which attribute would separate it best, under the
    // current measure. `data-gain` is the contract the render gate recomputes and compares.
    var avail = availFor(sel);
    if (splittable(node)) {
      var res = LykeionMath.treeSplits(node.records, avail, cls, measure, split);
      var rows = res.candidates.map(function (c) {
        var groups = c.groups.map(function (gr) { return esc(gr.label) + ' ' + gr.counts.join('/'); }).join(' · ');
        var bestRow = res.best && c.attr === res.best.attr;
        return '<tr data-attr="' + esc(c.attr) + '"' + (bestRow ? ' class="on"' : '') + '><td>' + esc(c.attr) + '</td><td>' + groups + '</td>' +
          '<td class="num">' + fmt(c.weighted, 4) + '</td><td class="num" data-gain="' + esc(c.attr) + '">' + fmt(c.gain, 4) + '</td>' +
          '<td><button type="button" class="btn" data-split="' + esc(c.attr) + '">分割</button></td></tr>';
      }).join('');
      cand.innerHTML = '<div class="cand-head">' + node.n + ' 筆 · 不純度 ' + esc(measure) + ' = ' + fmt(res.impurity, 4) +
        ' · 最佳：<b>' + esc(res.best.attr) + '</b>（增益 ' + fmt(res.best.gain, 4) + '）</div>' +
        '<div class="tablewrap" style="margin:0"><table class="data"><thead><tr><th>屬性</th><th>子節點（' + esc(cls.values.join('/')) +
        '）</th><th class="num">加權不純度</th><th class="num">增益</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    } else {
      cand.innerHTML = '<div class="cand-head">' + (node.attr
        ? '已用 <b>' + esc(node.attr) + '</b> 分割，點選子節點繼續。'
        : node.pure ? '純節點（' + esc(node.majority) + '），不純度 ' + esc(measure) + ' = ' + fmt(node.impurity, 4) + '，不需要再分割。'
          : node.n === 0 ? '空節點：沒有紀錄，繼承父節點的多數類別 ' + esc(node.majority) + '。'
            : '沒有可用的屬性了，這裡成為葉節點。') + '</div>';
    }

    // Classify: the record picked in the panel, its path through the current tree and the class
    // the tree predicts for it.
    var pred = LykeionMath.treePredict(tree, pick);
    api.setSeg(seg, measure);
    Object.keys(classifySegs).forEach(function (k) { api.setSeg(classifySegs[k], pick[k]); });
    clOut.innerHTML = '<span class="rec">' + attrs.map(function (a) { return esc(a.name) + '=<b>' + esc(pick[a.name]) + '</b>'; }).join('，') +
      '</span><span class="pred">預測 <b>' + esc(pred === undefined ? '—' : pred) + '</b></span>' +
      '<span class="path">' + (hit.length ? '路徑 ' + hit.length + ' 層' : '停在根節點') + '</span>';

    note.textContent = tree.attr && grownWith !== measure ? '目前這棵樹是用 ' + grownWith + ' 長出來的；上面的不純度已改成 ' + measure + '。' : '';

    // A tree wider than its column opens scrolled to the root. Without this the root of a wide
    // tree sits off-screen to the left and the reader sees only the right-hand leaves. This runs
    // before the verdicts because the first matching verdict returns.
    if (scrollToRoot) {
      scrollToRoot = false;
      wrap.scrollLeft = Math.max(0, Math.min(tree._cx - wrap.clientWidth / 2, wrap.scrollWidth - wrap.clientWidth));
    }

    var v = { depth: stats.depth, leaves: stats.leaves, trainingError: err, measure: measure, measureIndex: MEASURES.map(function (m) { return m.key; }).indexOf(measure) };
    for (var i = 0; i < verdicts.length; i++) {
      if (verdicts[i].fn(v)) { verdictEl.innerHTML = verdicts[i].text; verdictEl.hidden = false; return; }
    }
    verdictEl.innerHTML = '';
    verdictEl.hidden = true;
  }

  // A wider or narrower column changes how much the tree has to scale, and a re-fit that starts
  // scrolling has to bring the root back into view rather than leaving the reader at the leaves.
  function refit() {
    if (!fitted) return;
    var avail = wrap.clientWidth;
    var scale = avail > 0 ? Math.min(1, avail / fitted.width) : 1;
    if (scale < MIN_SCALE) scale = MIN_SCALE;
    if (Math.abs(scale - fitted.scale) < 1e-3) return;
    scrollToRoot = true;
    draw();
  }
  window.addEventListener('resize', refit);

  api.onSeg(seg, function (v) { measure = v; draw(); });
  Object.keys(classifySegs).forEach(function (k) {
    api.onSeg(classifySegs[k], function (v) { pick[k] = v; draw(); });
  });
  cand.addEventListener('click', function (e) {
    var b = e.target.closest('[data-split]');
    if (b) { splitAt(sel, b.dataset.split); draw(); return; }
    var tr = e.target.closest('tr[data-attr]');
    if (tr) { splitAt(sel, tr.dataset.attr); draw(); }
  });
  btnBest.addEventListener('click', function () { if (splitAt(sel, null)) draw(); });
  btnAuto.addEventListener('click', function () {
    tree = LykeionMath.treeGrow(records, attrs, cls, measure, split);
    grownWith = measure;
    sel = [];
    scrollToRoot = true;
    draw();
  });
  btnReset.addEventListener('click', function () {
    tree = LykeionMath.treeLeaf(records, cls, measure);
    grownWith = measure;
    sel = [];
    scrollToRoot = true;
    draw();
  });
  draw();
});
