import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageList, brokenMapPages } from '../src/extract.mjs';

// Glyph records are [font, character, glyph code]. In font F1 the character 的 is reached from code 10
// (its real glyph, frequent) and code 77 (the glyph of 第, mis-mapped), as in a broken ToUnicode table.
const g = (font, ch, code, times = 1) => Array.from({ length: times }, () => [font, ch, code]);

test('brokenMapPages: flags only pages that draw a mis-mapped glyph', () => {
  const pages = [
    { n: 1, glyphs: [...g('F1', '的', 10, 5), ...g('F1', '我', 11)] },
    { n: 2, glyphs: [...g('F1', '的', 10, 3), ...g('F1', '的', 77)] },
    { n: 3, glyphs: g('F1', '你', 12, 4) },
  ];
  assert.deepEqual(brokenMapPages(pages), { pages: [2], chars: '的' });
});

test('brokenMapPages: the same code in different fonts is not a collision', () => {
  const pages = [{ n: 1, glyphs: [...g('F1', '的', 10, 2), ...g('F2', '的', 99, 2)] }];
  assert.deepEqual(brokenMapPages(pages), { pages: [], chars: '' });
});

test('brokenMapPages: a clean document has nothing to report', () => {
  assert.deepEqual(brokenMapPages([{ n: 4, glyphs: g('F1', '一', 1, 3) }, { n: 5, glyphs: [] }]), { pages: [], chars: '' });
});

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
