import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageList } from '../src/extract.mjs';

test('pageList: whole document when no spec', () => {
  assert.deepEqual(pageList(null, 3), [1, 2, 3]);
});

test('pageList: range is clamped to the document length', () => {
  assert.deepEqual(pageList('2-9', 4), [2, 3, 4]);
  assert.deepEqual(pageList('5', 9), [5]);
});

test('pageList: rejects malformed or out-of-range specs', () => {
  assert.throws(() => pageList('a-b', 9), /must look like/);
  assert.throws(() => pageList('7-3', 9), /outside/);
  assert.throws(() => pageList('12', 9), /outside/);
});
