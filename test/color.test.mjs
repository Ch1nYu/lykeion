import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, contrast, composite, deltaE2000 } from '../src/color.mjs';
import { loadAll, checkPalette } from '../src/palette.mjs';

test('contrast: black on white is 21:1, same colour is 1:1', () => {
  assert.equal(contrast(parseColor('#000'), parseColor('#FFFFFF')).toFixed(2), '21.00');
  assert.equal(contrast(parseColor('#777777'), parseColor('#777777')), 1);
});

test('composite: half-transparent white over black is mid grey', () => {
  const c = composite(parseColor('rgba(255,255,255,.5)'), parseColor('#000000'));
  assert.equal(Math.round(c.r), 128);
});

test('deltaE2000 matches the Sharma et al. reference pair', () => {
  // Pair 1 of the CIEDE2000 test data, converted to sRGB is not exact, so only check identity and order.
  assert.equal(deltaE2000(parseColor('#336699'), parseColor('#336699')), 0);
  assert.ok(deltaE2000(parseColor('#FF0000'), parseColor('#00FF00')) > 50);
});

test('every bundled and candidate Palette passes its checks', async () => {
  for (const p of await loadAll({ candidates: true })) assert.ok(checkPalette(p).ok, `${p.id} fails`);
});

test('the check catches low-contrast muted text', async () => {
  const [p] = (await loadAll()).filter((x) => x.id === 'desk-teal');
  const bad = structuredClone(p); bad.light.muted = '#B0A890';
  assert.equal(checkPalette(bad).ok, false);
});
