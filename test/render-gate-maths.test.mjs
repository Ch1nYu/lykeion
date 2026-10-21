import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from '../src/browser.mjs';
import { tiny, renderItems, append, find } from './.project.mjs';

// Maths on the page: TeX that reaches the sidebar as source, inline maths that breaks the line, and
// a fraction whose pieces must each explain themselves. One gate run per probe, so they share a file.

// A label is a label: the sidebar copies the heading it names, and a heading may hold maths. Reading
// the heading's text instead of its markup pastes the TeX source into the link, where it renders as
// literal `\sqrt{d_k}` next to the flattened marks. The check that catches it must say which label.
// Built from a code point, so the fragment that reaches the page has exactly one backslash.
const TEX_RESIDUE = String.fromCharCode(92) + 'sqrt{d_k}';
test('a sidebar label that shows TeX source fails the TeX-residue check', async (t) => {
  const dir = await tiny('這一段正常。\n');
  // The label is built by the runtime, so the fault is injected the way a regression would: after load,
  // with the markup a textContent-based label would have produced.
  await append(dir, '<script>addEventListener("load",()=>{document.getElementById("nav").insertAdjacentHTML("beforeend",' + JSON.stringify(`<a href="#s1-1">${TEX_RESIDUE}</a>`) + ');});</script>');
  const items = await renderItems(t, dir);
  if (!items) return;
  const bad = find(items, /TeX shown as text/);
  assert.ok(bad, `expected a TeX-residue item, got:\n${items.map((i) => i.msg).join('\n')}`);
  assert.equal(bad.ok, false, 'the residue item fails');
  assert.match(bad.msg, /a label/);
  assert.ok(bad.msg.includes(TEX_RESIDUE), `the message quotes the residue: ${bad.msg}`);
});

// The positive side of the same promise: a `###` heading with maths reaches the sidebar as rendered
// maths, and the gate says so instead of passing silently.
test('a sub-heading with maths renders as maths in the sidebar', async (t) => {
  const body = '這一段有東西。\n\n### 標準差是 $\sqrt{d_k}$\n\n內文說明。\n';
  const dir = await tiny(body);
  const items = await renderItems(t, dir);
  if (!items) return;
  const ok = find(items, /headings with maths render as maths in the sidebar/);
  assert.ok(ok, `expected the maths-label item, got:\n${items.map((i) => i.msg).join('\n')}`);
  assert.equal(ok.ok, true, ok.msg);
});

// Inline maths sits in a sentence: set larger than the body it makes its own line taller than the
// paragraph's rhythm, and the text either side sits on a staircase.
test('inline maths that towers over the line fails the line-spacing check', async (t) => {
  const dir = await tiny('這一段有 $x$ 夾在句子裡，前後都還有字。\n');
  await append(dir, '<style>math:not([display="block"]){font-size:2.6em}</style>');
  const items = await renderItems(t, dir);
  if (!items) return;
  const bad = find(items, /grow around their inline maths/);
  assert.ok(bad, `expected an inline-maths item, got:\n${items.map((i) => i.msg).join('\n')}`);
  assert.equal(bad.ok, false, 'the inline-maths item fails');
  // The message names the paragraph and both heights, so the fix ("match the body") is obvious.
  assert.match(bad.msg, /前後都還有字/);
  assert.match(bad.msg, /tallest line \d+(\.\d+)?px \(×\d/);
});

// A fraction part: its numerator and denominator are pieces of their own, so the parts check must press
// them too. x, the numerator, the fraction bar and the denominator are the four pieces.
const FRAC_PROBE = [
  '```formula FRAC',
  "tex: 'x = \\frac{ab}{cd}'",
  'parts:',
  "  - { tex: 'x', say: '左邊。' }",
  "  - { tex: ' = ' }",
  "  - { frac: { num: [ { tex: 'ab', say: '分子。' } ], den: [ { tex: 'cd', say: '分母。' } ] }, say: '整個分數。' }",
  '```',
].join('\n');

test('E4 presses the pieces inside a fraction, and each keeps the card height and one explanation', async (t) => {
  const dir = await tiny(FRAC_PROBE);
  const items = await renderItems(t, dir);
  if (!items) return;
  const ok = find(items, /formula-parts blocks keep their height/);
  assert.ok(ok, `expected a formula-parts item, got:\n${items.map((i) => i.msg).join('\n')}`);
  assert.equal(ok.ok, true, ok.msg);
  assert.match(ok.msg, /across 4 pieces/);
});

test('clicking the numerator of a fraction shows its explanation, and the card keeps its height', async (t) => {
  const dir = await tiny(FRAC_PROBE);
  const browser = await launchBrowser();
  if (!browser) {
    t.skip('no browser available');
    return;
  }
  try {
    const page = await browser.newPage();
    // The same offline rule the gate uses: external requests are blocked and the DOM is what is checked.
    await page.route(/^https?:\/\//, (route) => route.abort());
    await page.goto(pathToFileURL(join(dir, 'probe.html')).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    // Only one view is shown at a time, so open the chapter that holds the formula first.
    await page.evaluate(() => window.Lykeion.show(document.querySelector('.formula.parts').closest('.view').id, { noScroll: true }));
    const card = page.locator('.formula.parts').first();
    const numerator = page.locator('.frac-num button.piece').first();
    const before = (await card.boundingBox()).height;
    await numerator.click();
    const shown = page.locator('.formula.parts .say > span.on');
    assert.equal(await shown.count(), 1, 'exactly one explanation is visible');
    assert.match(await shown.textContent(), /分子/);
    assert.equal(await numerator.getAttribute('aria-pressed'), 'true');
    const after = (await card.boundingBox()).height;
    assert.ok(Math.abs(after - before) < 1, `card height ${before}px → ${after}px after the numerator`);
  } finally {
    await browser.close();
  }
});
