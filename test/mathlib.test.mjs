import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../src/build.mjs';
import { verify } from '../src/verify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadMath() {
  const src = await readFile(join(ROOT, 'runtime', 'mathlib.js'), 'utf8');
  return new Function(`${src}\nreturn LykeionMath;`)();
}

async function sampleCopy() {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  return dir;
}

test('extend registers a function that compile and Lab code can use', async () => {
  const M = await loadMath();
  M.extend({ binomPmf: (n, k, p) => M.lib.C(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k) });
  assert.equal(typeof M.lib.binomPmf, 'function');
  // compile() reads the library by name, so an extended helper is a first-class expression name.
  const f = M.compile('binomPmf(3, 1, 0.5)', []);
  assert.ok(Math.abs(f({}) - 0.375) < 1e-12);
  // A helper may also call the built-ins it was given.
  assert.ok(Math.abs(M.compile('binomPmf(4, 2, 0.5)', [])() - 0.375) < 1e-12);
});

test('extend rejects a name that is not an identifier, a non-function and a built-in override', async () => {
  const M = await loadMath();
  assert.throws(() => M.extend({ 'not an identifier': () => 1 }), /not a usable JavaScript identifier/);
  assert.throws(() => M.extend({ class: () => 1 }), /not a usable JavaScript identifier/);
  assert.throws(() => M.extend({ half: 0.5 }), /"half" is not a function/);
  assert.throws(() => M.extend({ sqrt: () => 1 }), /would override a built-in/);
  assert.throws(() => M.extend({}), /at least one function/);
  // A rejected batch registers nothing, so a partly bad object cannot leave the library half-updated.
  assert.throws(() => M.extend({ ok1: () => 1, sqrt: () => 2 }), /would override a built-in/);
  assert.equal(M.lib.ok1, undefined);
});

test('the built-in library carries general maths only', async () => {
  const M = await loadMath();
  for (const name of ['sum', 'log2', 'ln', 'log10', 'exp', 'sqrt', 'abs', 'pow', 'min', 'max', 'floor', 'ceil', 'round', 'entropy', 'C', 'fact', 'PI', 'E']) {
    assert.ok(name in M.lib, `${name} should be built in`);
  }
  // Classification-specific helpers are not general maths: a Lecture Site that wants them ships math.js.
  assert.equal(M.lib.gini, undefined);
  assert.equal(M.lib.error, undefined);
  assert.ok(Math.abs(M.compile('entropy(1, 1)', [])() - 1) < 1e-12);
});

test('a project math.js extends the library for calc and for the numeric gate', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'math.js'), "LykeionMath.extend({ binomPmf: function (n, k, p) { return LykeionMath.lib.C(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k); } });\n");
  await writeFile(join(dir, 'content', '03-ext.md'), '---\nchapter: 3\ntitle: Ext\nsource: sample.pdf\n---\n\n## 3.1 Ext {pages=1}\n\n```calc\n- { expr: "binomPmf(3, 1, 0.5)", expect: 0.375 }\n```\n');
  const { out } = await build(dir);
  // The page must carry the project helper too, or a Lab expression would diverge from the gate.
  assert.match(await readFile(out, 'utf8'), /LykeionMath\.extend\(\{ binomPmf/);
  const r = await verify(dir, { render: false });
  const numeric = r.gates.find((g) => g.name === 'numeric');
  assert.equal(numeric.status, 'pass', numeric.items.map((i) => i.msg).join('\n'));
  assert.ok(numeric.items.some((i) => /binomPmf\(3, 1, 0\.5\)/.test(i.msg) && i.ok === true));
});

test('a broken math.js is a build error naming the file', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'math.js'), 'LykeionMath.extend({ half: function (x) { return x / ; } });\n');
  await assert.rejects(build(dir), /math\.js: .*(SyntaxError|Unexpected token)/);
  // A throw is reported the same way, so a helper that fails at load time never reaches the page.
  await writeFile(join(dir, 'math.js'), "LykeionMath.extend({ sqrt: function (x) { return x; } });\n");
  await assert.rejects(build(dir), /math\.js: LykeionMath\.extend: "sqrt" would override a built-in/);
});

test('a calc that needs a removed built-in fails the numeric gate clearly', async () => {
  const dir = await sampleCopy();
  await writeFile(join(dir, 'content', '03-old.md'), '---\nchapter: 3\ntitle: Old\nsource: sample.pdf\n---\n\n## 3.1 Old {pages=1}\n\n```calc\n- { expr: "gini(2,4)", expect: 0.444 }\n```\n');
  await build(dir);
  const r = await verify(dir, { render: false });
  const numeric = r.gates.find((g) => g.name === 'numeric');
  assert.equal(numeric.status, 'fail');
  assert.match(numeric.items.map((i) => i.msg).join('\n'), /gini is not defined/);
});
