import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLabParams } from '../src/build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const schema = () => JSON.parse(readFileSync(join(ROOT, 'labs', 'stepper', 'schema.json'), 'utf8'));

// A neutral category ("text" vs "vector") has no good/bad meaning and is not excluded, so `muted`'s
// strikethrough misreads it. `info` is the fourth state: a plain accent tint, no strikethrough.
test('build accepts the info chip state, in a chip and in the legend', () => {
  const params = {
    title: 'RAG 流程',
    legend: { info: '文字', muted: '排除', good: '保留', bad: '錯誤' },
    steps: [{ label: 'a', chips: [{ text: '查詢字串', state: 'info' }, { text: '向量', state: 'info' }, { text: '雜訊', state: 'muted' }] }],
  };
  assert.deepEqual(checkLabParams(schema(), { type: 'stepper', where: 'x.md §1.1', params }), []);
});

test('an unknown chip state still fails, and the message lists all four allowed states', () => {
  const errs = checkLabParams(schema(), { type: 'stepper', where: 'x.md §1.1', params: { steps: [{ label: 'a', chips: [{ text: 'A', state: 'neutral' }] }] } });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /Lab "stepper" steps\[0\]\.chips\[0\]\.state "neutral" must be one of good, bad, muted, info/);
  // The legend is a single-object parameter, so a key that is not a state is a build error too.
  const legendErrs = checkLabParams(schema(), { type: 'stepper', where: 'x.md §1.1', params: { steps: [{ label: 'a' }], legend: { neutral: 'x' } } });
  assert.equal(legendErrs.length, 1);
  assert.match(legendErrs[0], /Lab "stepper" legend has no key "neutral" \(allowed: good, bad, muted, info\)/);
});

test('the stepper Lab and the render gate both know the info state', () => {
  const js = readFileSync(join(ROOT, 'labs', 'stepper', 'lab.js'), 'utf8');
  assert.match(js, /var STATES = \['good', 'bad', 'muted', 'info'\]/);
  const verify = readFileSync(join(ROOT, 'src', 'verify.mjs'), 'utf8');
  assert.match(verify, /\^\(good\|bad\|muted\|info\)\$/, 'the legend gate must accept info');
  assert.match(verify, /is not a chip state \(good, bad, muted, info\)/);
});
