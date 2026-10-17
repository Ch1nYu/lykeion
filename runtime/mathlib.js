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
  // "Nice numbers" axis ticks: the step comes from the 1-2-5 ladder (x 10^k) and aims at
  // about five intervals; ticks are the multiples of the step inside [min, max]. The axis
  // ends are labelled only when already round (a multiple of the step) — the Lab draws any
  // other end as an unlabelled tick, so labels never overlap an end. Degenerate (min = max)
  // and non-finite ranges return at once and never loop. Pure and dependency-free, shared
  // by the curve Lab and `lykeion verify` through lib (and as LykeionMath.ticks for Labs).
  function ticks(min, max) {
    min = Number(min); max = Number(max);
    if (!isFinite(min) || !isFinite(max)) return { ticks: [], step: 0, ends: [false, false] };
    if (min > max) { var swap = min; min = max; max = swap; }
    if (min === max) return { ticks: [min], step: 0, ends: [true, true] };
    var width = max - min;
    if (!(width > 0) || !isFinite(width)) return { ticks: [min], step: 0, ends: [true, true] };
    var raw = width / 5, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    if (!isFinite(mag) || mag === 0) return { ticks: [min, max], step: width, ends: [true, true] };
    var norm = raw / mag;
    // Nearest ladder rung; exact midpoints break to the larger rung (fewer, calmer ticks).
    var nice = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
    var step = nice * mag, eps = 1e-9;
    var built = buildTicks(min, max, step, eps);
    // A norm just under a midpoint can yield 9 ticks; step up the ladder and the count
    // falls back to about 4-6. Bigger steps mean fewer ticks, so this always terminates.
    while (built.ticks.length > 8 && isFinite(step) && step > 0) {
      if (nice === 1) nice = 2;
      else if (nice === 2) nice = 5;
      else if (nice === 5) nice = 10;
      else { nice = 2; mag *= 10; }
      step = nice * mag;
      built = buildTicks(min, max, step, eps);
    }
    return { ticks: built.ticks, step: step, ends: built.ends };
  }
  function buildTicks(min, max, step, eps) {
    var k1 = Math.ceil(min / step - eps), k2 = Math.floor(max / step + eps), out = [], k, v;
    for (k = k1; k <= k2; k++) {
      v = k * step;
      if (Math.abs(v) < step * eps) v = 0;
      else if (Math.abs(v - min) < step * eps) v = min;
      else if (Math.abs(v - max) < step * eps) v = max;
      if (v === 0) v = 0; // +0, never -0, so includes(0) and labels see exact zero
      out.push(v);
      if (out.length > 100) break; // float pathology must never become an infinite loop
    }
    return {
      ticks: out,
      ends: [Math.abs(k1 * step - min) < step * eps, Math.abs(k2 * step - max) < step * eps]
    };
  }
  // Tick labels without float noise (0.1 + 0.2) and without trailing zeros beyond the
  // step's precision. Very large/small magnitudes use compact exponentials with no '+'.
  function tickLabel(v, step) {
    v = Number(v); step = Number(step);
    if (!isFinite(v)) return String(v);
    if (v === 0) return '0';
    if (!isFinite(step) || !(step > 0)) return String(v).replace('e+', 'e');
    var a = Math.abs(v);
    if (a >= 1e6 || a < 1e-4) {
      var r = parseFloat(v.toPrecision(12));
      if (r === 0) return '0';
      return r.toExponential().replace('e+', 'e');
    }
    var dec = Math.max(0, -Math.floor(Math.log10(step)));
    if (dec > 20) return parseFloat(v.toPrecision(12)).toExponential().replace('e+', 'e');
    var s = v.toFixed(dec);
    if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    if (s === '-0') s = '0';
    return s;
  }
  var lib = {
    sum: sum, log2: log2, ln: Math.log, log10: Math.log10, exp: Math.exp, sqrt: Math.sqrt, abs: Math.abs, pow: Math.pow,
    min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
    entropy: entropy, C: C, fact: fact, ticks: ticks, tickLabel: tickLabel, PI: Math.PI, E: Math.E
  };
  // `log` is deliberately absent: some subjects mean ln, others log10. A bare "log is not defined" leaves
  // the author guessing, so name the two unambiguous spellings instead.
  var HINTS = { log: ' (use ln for the natural log or log10)' };
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
      try {
        return fn.apply(null, keys.map(function (k) { return lib[k]; }).concat(names.map(function (n) { return vars[n]; })));
      } catch (e) {
        throw withHint(e);
      }
    };
  }
  // Append the hint for a name the author probably expected, keeping the original message intact.
  function withHint(e) {
    var msg = String((e && e.message) || e), hit = Object.keys(HINTS).filter(function (name) {
      return msg.indexOf(name + ' is not defined') >= 0;
    })[0];
    if (hit) e.message = msg + HINTS[hit];
    return e;
  }
  return { lib: lib, compile: compile, extend: extend, ticks: ticks, tickLabel: tickLabel };
})();
