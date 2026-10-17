// Project-local maths helpers for this Lecture Site.
// build inlines this file right after runtime/mathlib.js, and `lykeion verify` evaluates the same
// pair, so a `calc` check and a Lab expression always agree.
LykeionMath.extend({
  // Binomial probability mass function: P(X = k) for n trials with success probability p.
  binomPmf: function (n, k, p) {
    return LykeionMath.lib.C(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
  }
});
