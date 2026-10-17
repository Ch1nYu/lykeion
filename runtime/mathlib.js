/* Shared maths for Lab expressions and `lykeion verify` numeric checks.
   Loaded into the page and into Node (via new Function), so it must stay plain, dependency-free JS. */
var LykeionMath = (function () {
  'use strict';
  function flat(args) { return [].concat.apply([], Array.prototype.slice.call(args)); }
  function sum() { return flat(arguments).reduce(function (a, b) { return a + b; }, 0); }
  function log2(x) { return Math.log(x) / Math.LN2; }
  // The negation is normalised so a pure node is 0, never -0 (a gain of -0 is a needless footgun).
  function entropy() { var c = flat(arguments), n = sum(c); if (!n) return 0; var e = c.reduce(function (a, x) { return x ? a + (x / n) * log2(x / n) : a; }, 0); return e ? -e : 0; }
  function C(n, k) { if (k < 0 || k > n) return 0; var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }
  function fact(n) { var r = 1; for (var i = 2; i <= n; i++) r *= i; return r; }
  var lib = {
    sum: sum, log2: log2, ln: Math.log, log10: Math.log10, exp: Math.exp, sqrt: Math.sqrt, abs: Math.abs, pow: Math.pow,
    min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    entropy: entropy, C: C, fact: fact, PI: Math.PI, E: Math.E
  };
  // A reserved word is a legal object key but not a legal parameter name, so compile() would fail
  // long after extend() accepted it. Keep the two in step.
  var RESERVED = ('break case catch class const continue debugger default delete do else enum export extends ' +
    'false finally for function if import in instanceof new null return super switch this throw true try ' +
    'typeof var void while with yield let static implements interface package private protected public await').split(' ');
  // Register subject-specific helpers so `calc` expressions, Lab expressions and Lab code all see them.
  // A Lecture Site ships them in <project>/math.js; nothing subject-specific belongs in the core.
  function extend(fns) {
    var names = Object.keys(fns || {});
    if (!names.length) throw new Error('LykeionMath.extend: needs at least one function');
    names.forEach(function (name) {
      if (!/^[A-Za-z_$][\w$]*$/.test(name) || RESERVED.indexOf(name) >= 0) {
        throw new Error('LykeionMath.extend: "' + name + '" is not a usable JavaScript identifier');
      }
      if (typeof fns[name] !== 'function') throw new Error('LykeionMath.extend: "' + name + '" is not a function');
      if (Object.prototype.hasOwnProperty.call(lib, name)) {
        throw new Error('LykeionMath.extend: "' + name + '" would override a built-in');
      }
    });
    // Assign only once every name passed, so a bad batch cannot leave the library half-updated.
    names.forEach(function (name) { lib[name] = fns[name]; });
  }
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
  return { lib: lib, compile: compile, extend: extend };
})();
