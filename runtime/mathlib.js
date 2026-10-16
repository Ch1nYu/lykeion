/* Shared maths for Lab expressions and `lykeion verify` numeric checks.
   Loaded into the page and into Node (via new Function), so it must stay plain, dependency-free JS. */
var LykeionMath = (function () {
  'use strict';
  function flat(args) { return [].concat.apply([], Array.prototype.slice.call(args)); }
  function sum() { return flat(arguments).reduce(function (a, b) { return a + b; }, 0); }
  function log2(x) { return Math.log(x) / Math.LN2; }
  function gini() { var c = flat(arguments), n = sum(c); if (!n) return 0; return 1 - c.reduce(function (a, x) { return a + (x / n) * (x / n); }, 0); }
  function entropy() { var c = flat(arguments), n = sum(c); if (!n) return 0; return -c.reduce(function (a, x) { return x ? a + (x / n) * log2(x / n) : a; }, 0); }
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
  var lib = {
    sum: sum, log2: log2, ln: Math.log, log10: Math.log10, exp: Math.exp, sqrt: Math.sqrt, abs: Math.abs, pow: Math.pow,
    min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    gini: gini, entropy: entropy, error: error, C: C, fact: fact, itemsets: itemsets, PI: Math.PI, E: Math.E
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
  return { lib: lib, compile: compile, itemsets: itemsets };
})();
