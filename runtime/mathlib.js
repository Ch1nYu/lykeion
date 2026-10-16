/* Shared maths for Lab expressions and `lykeion verify` numeric checks.
   Loaded into the page and into Node (via new Function), so it must stay plain, dependency-free JS. */
var LykeionMath = (function () {
  'use strict';
  function flat(args) { return [].concat.apply([], Array.prototype.slice.call(args)); }
  function sum() { return flat(arguments).reduce(function (a, b) { return a + b; }, 0); }
  function log2(x) { return Math.log(x) / Math.LN2; }
  function gini() { var c = flat(arguments), n = sum(c); if (!n) return 0; return 1 - c.reduce(function (a, x) { return a + (x / n) * (x / n); }, 0); }
  // The negation is normalised so a pure node is 0, never -0 (a gain of -0 is a needless footgun).
  function entropy() { var c = flat(arguments), n = sum(c); if (!n) return 0; var e = c.reduce(function (a, x) { return x ? a + (x / n) * log2(x / n) : a; }, 0); return e ? -e : 0; }
  function error() { var c = flat(arguments), n = sum(c); if (!n) return 0; return 1 - Math.max.apply(null, c) / n; }
  function C(n, k) { if (k < 0 || k > n) return 0; var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }
  function fact(n) { var r = 1; for (var i = 2; i <= n; i++) r *= i; return r; }
  // Every non-empty itemset of the transaction universe with its absolute support σ, and the
  // frequent / closed / maximal verdicts. minsup is a count of transactions, clamped to ≥ 1.
  // closed = frequent and no proper superset has the same σ; maximal = frequent and no frequent
  // proper superset. Both are checked against the enumerated sets, so maximal ⊆ closed ⊆ frequent.
  function itemsets(transactions, minsup) {
    var tx = (transactions || []).map(function (t) { return ((t && t.items) || []).map(String); });
    var universe = [];
    tx.forEach(function (items) { items.forEach(function (it) { if (universe.indexOf(it) < 0) universe.push(it); }); });
    universe.sort();
    var ms = Math.max(1, Math.floor(Number(minsup)) || 1);
    var m = universe.length, sets = [];
    for (var mask = 1; mask < (1 << m); mask++) {
      var items = [];
      for (var i = 0; i < m; i++) if (mask & (1 << i)) items.push(universe[i]);
      var sigma = 0;
      tx.forEach(function (basket) { if (items.every(function (x) { return basket.indexOf(x) >= 0; })) sigma++; });
      sets.push({ key: items.join('\u0001'), label: items.join(','), items: items, size: items.length, sigma: sigma, frequent: sigma >= ms });
    }
    sets.sort(function (a, b) { return a.size - b.size || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0); });
    var holds = function (o, s) { return o.size > s.size && s.items.every(function (x) { return o.items.indexOf(x) >= 0; }); };
    sets.forEach(function (s) {
      s.closed = s.frequent && !sets.some(function (o) { return o.sigma === s.sigma && holds(o, s); });
      s.maximal = s.frequent && !sets.some(function (o) { return o.frequent && holds(o, s); });
    });
    var pick = function (f) { return sets.filter(f); };
    var frequent = pick(function (s) { return s.frequent; });
    var closed = pick(function (s) { return s.closed; });
    var maximal = pick(function (s) { return s.maximal; });
    return { minsup: ms, n: tx.length, universe: universe, sets: sets, frequent: frequent, closed: closed, maximal: maximal,
      counts: { frequent: frequent.length, closed: closed.length, maximal: maximal.length } };
  }
  // ---------- decision trees (Hunt's algorithm) ----------
  // A node is plain data: { n, counts, majority, impurity, pure, records, attr, children, label, values }.
  // `attr` is null on a leaf. Children carry their own `label`/`values`, so a binary child can mean
  // "the rest" (¬v). A child with no records inherits the parent's majority class (Hunt) and is
  // flagged `inherited`. `attributes` are the attributes still available at a node: a used attribute
  // is dropped from the list by the caller, which is what makes the recursion terminate.
  function impurityOf(counts, measure) {
    return measure === 'entropy' ? entropy(counts) : measure === 'error' ? error(counts) : gini(counts);
  }
  function classCounts(records, classDef) {
    var vals = (classDef && classDef.values) || [];
    return vals.map(function (v) {
      var c = 0;
      for (var i = 0; i < records.length; i++) if (String(records[i][classDef.name]) === String(v)) c++;
      return c;
    });
  }
  function majorityOf(counts, classDef) {
    var vals = (classDef && classDef.values) || [], best = 0;
    for (var i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i;
    return vals[best];
  }
  // A gain is a difference of floats, so a true zero can come out as -5.6e-17 and print as -0.0000.
  function tidy(x) { return Math.abs(x) < 1e-12 ? 0 : x; }
  // A leaf: its class counts and impurity, and the majority class (or `majority` when it holds no records).
  function treeLeaf(records, classDef, measure, majority) {
    records = records || [];
    var counts = classCounts(records, classDef);
    var impurity = records.length ? impurityOf(counts, measure) : 0;
    return { n: records.length, counts: counts, majority: records.length ? majorityOf(counts, classDef) : majority,
      impurity: impurity, pure: records.length > 0 && impurity <= 0, records: records,
      attr: null, children: [], label: '', values: null };
  }
  // Every candidate grouping of one attribute: each value once (multiway), or each value against the
  // rest (binary). The caller keeps the grouping with the lowest weighted impurity.
  function treeGroupings(records, attr, split) {
    var vals = (attr.values || []).map(String);
    var withVal = function (v) { return records.filter(function (r) { return String(r[attr.name]) === v; }); };
    if (split === 'binary') return vals.map(function (v) {
      return [{ label: v, values: [v], records: withVal(v) },
        { label: '\u00ac' + v, values: vals.filter(function (x) { return x !== v; }),
          records: records.filter(function (r) { return String(r[attr.name]) !== v; }) }];
    });
    return [vals.map(function (v) { return { label: v, values: [v], records: withVal(v) }; })];
  }
  // Candidate splits of `records`: per attribute its best grouping, its weighted child impurity and
  // the gain (parent impurity − weighted). `best` is the highest-gain candidate (ties → first).
  function treeSplits(records, attributes, classDef, measure, split) {
    records = records || [];
    var m = measure === 'entropy' || measure === 'error' ? measure : 'gini';
    var sp = split === 'binary' ? 'binary' : 'multiway';
    var counts = classCounts(records, classDef);
    var impurity = records.length ? impurityOf(counts, m) : 0;
    var candidates = (attributes || []).map(function (a) {
      var parts = treeGroupings(records, a, sp).map(function (groups) {
        var gs = groups.map(function (g) {
          var gc = classCounts(g.records, classDef);
          return { label: g.label, values: g.values, records: g.records, n: g.records.length, counts: gc,
            impurity: g.records.length ? impurityOf(gc, m) : 0, weight: records.length ? g.records.length / records.length : 0 };
        });
        var weighted = gs.reduce(function (s, g) { return s + g.weight * g.impurity; }, 0);
        return { attr: a.name, groups: gs, weighted: weighted, gain: tidy(impurity - weighted) };
      });
      var bestPart = parts[0];
      parts.forEach(function (x) { if (x.weighted < bestPart.weighted - 1e-12) bestPart = x; });
      return bestPart;
    });
    var best = null;
    candidates.forEach(function (c) { if (!best || c.weighted < best.weighted - 1e-12) best = c; });
    return { n: records.length, counts: counts, impurity: impurity, measure: m, split: sp,
      candidates: candidates, best: records.length ? best : null };
  }
  // One split: the child partition of `attrName` (or of the best candidate when omitted).
  function treeSplit(records, attributes, classDef, measure, split, attrName) {
    var res = treeSplits(records, attributes, classDef, measure, split);
    var pick = attrName === undefined || attrName === null ? res.best : null;
    if (pick === null) for (var i = 0; i < res.candidates.length; i++) if (res.candidates[i].attr === attrName) pick = res.candidates[i];
    if (!pick || !res.n) return null;
    var parentMajority = majorityOf(res.counts, classDef);
    var node = treeLeaf(records, classDef, measure);
    node.attr = pick.attr;
    node.children = pick.groups.map(function (g) {
      var child = treeLeaf(g.records, classDef, measure, parentMajority);
      child.label = g.label;
      child.values = g.values;
      if (!g.n) { child.inherited = true; child.majority = parentMajority; }
      return child;
    });
    return node;
  }
  // The fully grown tree: best split at every step, until a node is pure or no attribute is left.
  function treeGrow(records, attributes, classDef, measure, split) {
    var leaf = treeLeaf(records, classDef, measure, majorityOf(classCounts(records || [], classDef), classDef));
    if (leaf.pure || !leaf.n || !(attributes || []).length) return leaf;
    var node = treeSplit(records, attributes, classDef, measure, split, null);
    if (!node) return leaf;
    var rest = attributes.filter(function (a) { return a.name !== node.attr; });
    node.children = node.children.map(function (c) {
      if (!c.n || c.inherited) return c;
      var grown = treeGrow(c.records, rest, classDef, measure, split);
      grown.label = c.label;
      grown.values = c.values;
      return grown;
    });
    return node;
  }
  // The class a record falls into: follow the child whose values hold the record's value, else stop.
  function treePredict(node, record) {
    while (node && node.attr && node.children.length) {
      var v = String(record[node.attr]), next = null;
      for (var i = 0; i < node.children.length; i++) {
        if ((node.children[i].values || []).indexOf(v) >= 0) { next = node.children[i]; break; }
      }
      if (!next) break;
      node = next;
    }
    return node ? node.majority : undefined;
  }
  // Resubstitution error of a grown tree over its own training records (a fraction).
  function treeError(node, records, classDef) {
    if (!records || !records.length) return 0;
    var bad = records.filter(function (r) { return String(treePredict(node, r)) !== String(r[classDef.name]); }).length;
    return bad / records.length;
  }
  // Depth (split levels on the longest path) and leaf count of a grown tree.
  function treeStats(node) {
    if (!node || !node.children.length) return { depth: 0, leaves: 1 };
    var d = 0, l = 0;
    node.children.forEach(function (c) { var s = treeStats(c); if (s.depth > d) d = s.depth; l += s.leaves; });
    return { depth: d + 1, leaves: l };
  }
  var lib = {
    sum: sum, log2: log2, ln: Math.log, log10: Math.log10, exp: Math.exp, sqrt: Math.sqrt, abs: Math.abs, pow: Math.pow,
    min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    gini: gini, entropy: entropy, error: error, C: C, fact: fact, itemsets: itemsets,
    treeSplits: treeSplits, treeGrow: treeGrow, PI: Math.PI, E: Math.E
  };
  // Compile "expr" over the given variable names plus the library. Throws on syntax errors.
  function compile(expr, names) {
    names = names || [];
    var keys = Object.keys(lib);
    var fn = new Function(keys.concat(names).join(','), '"use strict"; return (' + expr + ');');
    return function (vars) {
      vars = vars || {};
      return fn.apply(null, keys.map(function (k) { return lib[k]; }).concat(names.map(function (n) { return vars[n]; })));
    };
  }
  return { lib: lib, compile: compile, itemsets: itemsets,
    treeSplits: treeSplits, treeSplit: treeSplit, treeGrow: treeGrow, treeLeaf: treeLeaf,
    treePredict: treePredict, treeError: treeError, treeStats: treeStats };
})();
