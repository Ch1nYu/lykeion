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
  var lib = {
    sum: sum, log2: log2, ln: Math.log, log10: Math.log10, exp: Math.exp, sqrt: Math.sqrt, abs: Math.abs, pow: Math.pow,
    min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    gini: gini, entropy: entropy, error: error, C: C, fact: fact, PI: Math.PI, E: Math.E
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
  return { lib: lib, compile: compile };
})();
