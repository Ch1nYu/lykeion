import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from '../src/build.mjs';
import { launchBrowser } from '../src/browser.mjs';
import { sampleCopy, tiny, renderItems, find } from './.project.mjs';

// On a phone the stepper lays out only the current step, so the Lab follows that step's own height.
// On a 375px screen a four-line step used to sit in ~200px of empty card, which reads as content that
// failed to load. From 481px up every step still reserves the tallest height, so nothing moves.

let browser = null;
test.before(async () => { browser = await launchBrowser(); });
test.after(async () => { await browser?.close(); });

let url = null;
const siteUrl = async () => {
  if (!url) {
    const dir = await sampleCopy();
    await build(dir);
    url = pathToFileURL(join(dir, 'sample.html')).href;
  }
  return url;
};

// LAB D (ch2) names three steps of very different height, so it is the case the decision is about.
const openLabD = async (width) => {
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'light' });
  await page.goto(await siteUrl(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.Lykeion.show('ch2', { noScroll: true }));
  await page.waitForTimeout(200);
  const id = await page.evaluate(() => [...document.querySelectorAll('.lab')]
    .find((l) => l.querySelector('.lab-head .tag')?.textContent.trim() === 'LAB D')?.id || null);
  assert.ok(id, 'LAB D is on the page');
  return { page, id };
};

// What the reader sees: the Lab's height, the height of the step cell that is showing, and the empty
// band between the bottom of that cell and the body's padding — the band that read as a broken Lab.
const measure = (page, id) => page.evaluate((id) => {
  const lab = document.getElementById(id);
  const body = lab.querySelector('.lab-body');
  const on = lab.querySelector('.step-view > .on');
  const bodyR = body.getBoundingClientRect();
  const onR = on.getBoundingClientRect();
  return {
    labH: Math.round(lab.getBoundingClientRect().height),
    onH: Math.round(onR.height),
    band: Math.round(bodyR.bottom - parseFloat(getComputedStyle(body).paddingBottom) - onR.bottom),
    displays: [...lab.querySelectorAll('.step-view > span[data-i]')].map((s) => getComputedStyle(s).display),
  };
}, id);

const stepThrough = async (page, id) => {
  const chips = await page.$$(`#${id} .seg button`);
  const out = [];
  for (const chip of chips) {
    await chip.click();
    await page.waitForTimeout(120);
    out.push(await measure(page, id));
  }
  return out;
};

test('at 375px the stepper Lab follows the current step instead of reserving the tallest one', async (t) => {
  if (!browser) return t.skip('no browser available');
  const { page, id } = await openLabD(375);
  try {
    const seen = await stepThrough(page, id);
    assert.equal(seen.length, 3, 'LAB D has three steps');
    // Only the current step is laid out; the others would each add their height to the grid row.
    for (const s of seen) {
      assert.deepEqual(s.displays.filter((d) => d !== 'none'), ['flex'], `exactly one step is laid out, got ${s.displays.join(', ')}`);
    }
    // Short step → shorter Lab: the three steps differ, and the Lab height differs with them.
    const heights = seen.map((s) => s.labH);
    assert.ok(Math.max(...heights) - Math.min(...heights) > 20, `the Lab follows the step height, got ${heights.join(', ')}`);
    // The same offset between the Lab and the step it shows on every step is what "follows the step"
    // means: the box around the step (head, legend, controls, padding) is constant and the step's own
    // height is the only variable. A reserved tallest height would show up as a shrinking offset.
    const offsets = seen.map((s) => s.labH - s.onH);
    assert.ok(Math.max(...offsets) - Math.min(...offsets) <= 1, `the Lab tracks the step it shows, got offsets ${offsets.join(', ')}`);
    // And no empty band below the step: the spare height of the tallest step is gone, not moved around.
    for (const s of seen) assert.ok(s.band <= 1, `no empty band under the step (${s.band}px)`);
  } finally {
    await page.close();
  }
});

test('at 1280px the stepper still reserves the tallest step, so stepping never moves the page', async (t) => {
  if (!browser) return t.skip('no browser available');
  const { page, id } = await openLabD(1280);
  try {
    const seen = await stepThrough(page, id);
    assert.equal(new Set(seen.map((s) => s.labH)).size, 1, `every step keeps the Lab the same height, got ${seen.map((s) => s.labH).join(', ')}`);
    // Every step stays laid out (hidden by visibility, not removed), which is what reserves the height.
    for (const s of seen) assert.deepEqual(s.displays, ['flex', 'flex', 'flex'], 'every step keeps its layout box');
  } finally {
    await page.close();
  }
});

// The render gate's 375px stability check is about the page not jumping under the reader's hand. A
// stepper is exempt there because below 481px it deliberately trades that for the step's own height;
// every other Lab type is still held to it at 375px.
const stepper = [
  '```lab stepper',
  'title: 兩步',
  'steps:',
  '  - label: 甲',
  '    text: 短。',
  '  - label: 乙',
  '    text: 這一步刻意寫得很長，好讓它在手機上多折幾行，於是把整個 Lab 撐高一大截，讓盒子在換步的時候明顯長高。',
  '```',
].join('\n');

test('the 375px stability check lets a stepper change height, and still fails a Lab that resizes', async (t) => {
  // Both halves in one probe: the grow Lab resizes without api.stack at any width, the stepper only
  // resizes at 375px (it keeps the tallest step from 481px up).
  const grow = `Lykeion.registerLab('grow', function (root, p, api) {
  var out = api.H('div', { class: 'grow-out' }, '短');
  var btn = api.H('button', { type: 'button' }, '換一句');
  btn.addEventListener('click', function () {
    out.textContent = '這是一段刻意寫得很長的說明文字，用來撐高整個 Lab 的盒子，而且它沒有使用 api.stack，所以換句子的時候盒子會長大。';
  });
  root.appendChild(btn);
  root.appendChild(out);
});\n`;
  const dir = await tiny(`先看這個步進器。\n\n${stepper}\n\n再看這個 Lab。\n\n\`\`\`lab grow\ntitle: 換一句\n\`\`\`\n`, { labs: { grow } });
  const items = await renderItems(t, dir);
  if (!items) return;

  // The stepper really does resize at 375px — otherwise this probe would prove nothing.
  const page = await browser.newPage({ viewport: { width: 375, height: 900 }, colorScheme: 'light' });
  try {
    await page.goto(pathToFileURL(join(dir, 'probe.html')).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const heights = [];
    for (const chip of await page.$$('.lab[data-lab="stepper"] .seg button')) {
      await chip.click();
      await page.waitForTimeout(120);
      heights.push(await page.evaluate(() => Math.round(document.querySelector('.lab[data-lab="stepper"]').getBoundingClientRect().height)));
    }
    assert.ok(Math.max(...heights) - Math.min(...heights) > 2, `the stepper moves at 375px, got ${heights.join(', ')}`);
  } finally {
    await page.close();
  }

  const narrow = find(items, /controls move at 375px/);
  assert.ok(narrow, `expected the 375px stability item, got:\n${items.map((i) => i.msg).join('\n')}`);
  assert.equal(narrow.ok, false, 'the resizing non-stepper Lab still fails at 375px');
  assert.match(narrow.msg, /Lab lab-2 \(grow\): height \d+(\.\d+)?px → \d+(\.\d+)?px/);
  assert.doesNotMatch(narrow.msg, /\(stepper\)/, `the stepper is exempt at 375px, got: ${narrow.msg}`);
  // The 1280px check is untouched: the stepper keeps the tallest step there.
  const wide = find(items, /controls move at 1280px/);
  assert.ok(wide, `expected the 1280px stability item, got:\n${items.map((i) => i.msg).join('\n')}`);
  assert.doesNotMatch(wide.msg, /\(stepper\)/, `the stepper must not resize at 1280px, got: ${wide.msg}`);
});
