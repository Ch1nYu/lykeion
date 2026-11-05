import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// A fixed-time wait passes on a fast machine and fails on a slow one: the render gate waited 700 ms
// for the back-to-top scroll, and GitHub's Linux runner needed longer (run 41978116559). New code
// waits for the condition it needs (page.waitForFunction, locator.waitFor) instead.
// BASELINE is the per-file count today. A file may not gain a fixed wait; when one is replaced,
// lower its number here so the slot cannot be reused.
const BASELINE = {
  'src/shots.mjs': 1,
  'src/verify.mjs': 14,
  'test/blocks.test.mjs': 9,
  'test/code.test.mjs': 7,
  'test/curve-discrete.test.mjs': 4,
  'test/floating-buttons.test.mjs': 7,
  'test/readouts-layout.test.mjs': 2,
  'test/render-gate-maths.test.mjs': 1,
  'test/stepper-controls-layout.test.mjs': 2,
  'test/stepper-mobile-height.test.mjs': 5,
};

const root = fileURLToPath(new URL('..', import.meta.url));
const self = basename(fileURLToPath(import.meta.url));
const CALL = /\.waitForTimeout\s*\(/g;

export const countCalls = (source) => source.match(CALL)?.length ?? 0;

// Returns one line per file whose count differs from the baseline; empty when they all match.
export const compare = (counts, baseline) => {
  const out = [];
  for (const file of new Set([...Object.keys(counts), ...Object.keys(baseline)])) {
    const now = counts[file] ?? 0, cap = baseline[file] ?? 0;
    if (now > cap) out.push(`${file}: ${now} fixed waits, at most ${cap}. Wait for a condition instead (page.waitForFunction, locator.waitFor).`);
    else if (now < cap) out.push(`${file}: ${now} fixed waits, baseline says ${cap}. Lower BASELINE in test/fixed-waits.test.mjs to ${now}.`);
  }
  return out.sort();
};

const scan = async (dir) => {
  const counts = {};
  for (const entry of await readdir(join(root, dir), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.m?js$/.test(entry.name) || entry.name === self) continue;
    const path = join(entry.parentPath, entry.name);
    const n = countCalls(await readFile(path, 'utf8'));
    if (n) counts[relative(root, path).replaceAll('\\', '/')] = n;
  }
  return counts;
};

test('no file gains a fixed-time wait, and the baseline follows every one removed', async () => {
  const counts = { ...(await scan('src')), ...(await scan('test')), ...(await scan('bin')) };
  assert.deepEqual(compare(counts, BASELINE), []);
});

test('the counter sees every receiver and spacing, and nothing else', () => {
  assert.equal(countCalls('await page.waitForTimeout(30);\nawait e6.page.waitForTimeout (40);\nawait p.waitForTimeout(500)'), 3);
  assert.equal(countCalls('await page.waitForFunction(() => scrollY === 0);\nawait locator.waitFor();'), 0);
});

test('an added wait, a wait in a new file and a removed wait are each reported', () => {
  assert.deepEqual(compare({ 'src/a.mjs': 2, 'src/new.mjs': 1, 'test/b.test.mjs': 0 }, { 'src/a.mjs': 1, 'test/b.test.mjs': 3 }), [
    'src/a.mjs: 2 fixed waits, at most 1. Wait for a condition instead (page.waitForFunction, locator.waitFor).',
    'src/new.mjs: 1 fixed waits, at most 0. Wait for a condition instead (page.waitForFunction, locator.waitFor).',
    'test/b.test.mjs: 0 fixed waits, baseline says 3. Lower BASELINE in test/fixed-waits.test.mjs to 0.',
  ]);
});
