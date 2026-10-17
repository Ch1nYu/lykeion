import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The tick rule lives in runtime/mathlib.js so the curve Lab, a custom Lab and `lykeion verify` all
// get the same axis. Loading it the way the page does keeps this test honest about that.
async function loadMath() {
  const src = await readFile(join(ROOT, 'runtime', 'mathlib.js'), 'utf8');
  return new Function(`${src}\nreturn LykeionMath;`)();
}

const vals = (t) => t.ticks.map((x) => +x.toFixed(10));

test('ticks: [1, 256] lands on round values inside the range, ends unlabelled', async () => {
  const { lib } = await loadMath();
  const t = lib.ticks(1, 256);
  // step 50: the 1-2-5 ladder never produces 64, and 51/25.5/12.75 would be noise.
  assert.equal(t.step, 50);
  assert.deepEqual(vals(t), [50, 100, 150, 200, 250]);
  // The axis ends are drawn but not labelled, so no tick sits on top of the end label.
  assert.deepEqual(t.ends, [false, false]);
});

test('ticks: [0, 1] gives 0, 0.2, …, 1 and marks both ends as round', async () => {
  const { lib } = await loadMath();
  const t = lib.ticks(0, 1);
  assert.equal(t.step, 0.2);
  assert.deepEqual(vals(t), [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assert.deepEqual(t.ends, [true, true]);
  // 0.1 + 0.2 style noise must not reach the label.
  assert.deepEqual(t.ticks.map((x) => lib.tickLabel(x, t.step)), ['0', '0.2', '0.4', '0.6', '0.8', '1']);
});

test('ticks: a range that straddles zero keeps round ticks and exact zero', async () => {
  const { lib } = await loadMath();
  const t = lib.ticks(-3, 3);
  assert.deepEqual(vals(t), [-3, -2, -1, 0, 1, 2, 3]);
  assert.ok(t.ticks.includes(0), 'zero is a tick, not 2.7e-17');
  assert.deepEqual(t.ends, [true, true]);
});

test('ticks: tiny ranges scale the step instead of collapsing to the ends', async () => {
  const { lib } = await loadMath();
  const t = lib.ticks(0, 0.01);
  assert.equal(t.step, 0.002);
  assert.deepEqual(t.ticks.map((x) => lib.tickLabel(x, t.step)), ['0', '0.002', '0.004', '0.006', '0.008', '0.01']);
  assert.deepEqual(t.ends, [true, true]);
});

test('ticks: a degenerate range returns one tick and never loops', async () => {
  const { lib } = await loadMath();
  for (const [a, b] of [[5, 5], [0, 0], [-2, -2]]) {
    const t = lib.ticks(a, b);
    assert.equal(t.ticks.length, 1);
    assert.equal(t.ticks[0], a);
    assert.equal(t.step, 0);
  }
  // A reversed range is the same axis as its sorted twin, not an infinite loop.
  assert.deepEqual(vals(lib.ticks(3, -3)), vals(lib.ticks(-3, 3)));
});

test('ticks: no NaN or Infinity for awkward ranges, and ticks stay inside [min, max]', async () => {
  const { lib } = await loadMath();
  const ranges = [[0, 0.3], [-1, 1], [0, 1e6], [0.001, 0.002], [1, 7], [-0.5, 0.5], [2, 2.5], [1e-7, 3e-7]];
  for (const [min, max] of ranges) {
    const t = lib.ticks(min, max);
    assert.ok(Number.isFinite(t.step) && t.step > 0, `${min}..${max}: step ${t.step}`);
    assert.ok(t.ticks.length >= 2 && t.ticks.length <= 8, `${min}..${max}: ${t.ticks.length} ticks`);
    for (const v of t.ticks) {
      assert.ok(Number.isFinite(v), `${min}..${max}: tick ${v}`);
      assert.ok(v >= min - t.step * 1e-9 && v <= max + t.step * 1e-9, `${min}..${max}: tick ${v} outside`);
      assert.doesNotMatch(lib.tickLabel(v, t.step), /NaN|Infinity|e\+|undefined/);
    }
  }
});

test('tickLabel: no trailing zeros beyond the step precision', async () => {
  const { lib } = await loadMath();
  assert.equal(lib.tickLabel(0, 0.2), '0');
  assert.equal(lib.tickLabel(0.2, 0.2), '0.2');
  assert.equal(lib.tickLabel(1, 0.2), '1');
  assert.equal(lib.tickLabel(0.25, 0.05), '0.25');
  assert.equal(lib.tickLabel(50, 50), '50');
  assert.equal(lib.tickLabel(-2, 1), '-2');
  assert.equal(lib.tickLabel(1000000, 250000), '1e6');
});

test('the curve Lab labels both axes with the shared tick rule', async () => {
  const js = await readFile(join(ROOT, 'labs', 'curve', 'lab.js'), 'utf8');
  assert.match(js, /LykeionMath\.ticks\(/, 'the Lab must call the shared tick function');
  assert.doesNotMatch(js, /k <= 4/, 'the old evenly-split 5-tick loop must be gone');
  // The end of the axis is drawn as a tick but only labelled when it is already round.
  assert.match(js, /ends\[/);
});
