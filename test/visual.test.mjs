import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, routeLocal, LOCAL_ORIGIN } from '../src/browser.mjs';
import { measureVisual, loadVisualConfig } from '../src/visual.mjs';
import { build } from '../src/build.mjs';
import { verify, visualItems } from '../src/verify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// A visual rule is only worth anything if it can fail. Each test below feeds `measureVisual` a page
// that breaks exactly one promise and checks the rule names the offender. The pages are hand-written
// HTML rather than a built Lecture Site: a rule is a measurement, and the build is not under test
// here — the integration test at the bottom covers the real thing.
//
// Every test asserts on its own rule only (`ruleFailures`), so a minimal fixture that happens to
// break a second rule still proves the first one.
const defaults = await loadVisualConfig();

let browser = null;
test.before(async () => { browser = await launchBrowser(); });
test.after(async () => { await browser?.close(); });

const PAGE = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; font: 16px/1.5 sans-serif; }
  main .sheet { max-width: 1000px; margin: 0 auto; padding: 40px; }
  p { margin: 0 0 16px; }
</style></head><body><main><div class="sheet">${body}</div></main></body></html>`;

const measure = async (body, { width = 1280, height = 900, config = defaults.rules } = {}) => {
  assert.ok(browser, 'needs a browser for the visual checks');
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: 'light' });
  try {
    await page.setContent(PAGE(body));
    return await measureVisual(page, config);
  } finally {
    await page.close();
  }
};

const ruleFailures = (r, rule) => r.failures.filter((f) => f.rule === rule);
const ruleWarnings = (r, rule) => r.warnings.filter((f) => f.rule === rule);
const ruleAll = (r, rule) => [...ruleFailures(r, rule), ...ruleWarnings(r, rule)];

test('hole: a gap taller than half the viewport inside a chapter fails, a section rest does not', async (t) => {
  if (!browser) return t.skip('no browser available');
  // Half of 900 is 450. The theme's own section rhythm is 104px, so a rest between sections has to
  // stay well under the bar; an accidental hole (a stray empty block, a margin that stacks) does not.
  const rest = await measure('<div class="view" id="ch1"><section style="margin-top:104px"><p>one</p></section><section style="margin-top:104px"><p>two</p></section></div>');
  assert.equal(ruleFailures(rest, 'hole').length, 0, 'a 104px section rest is not a hole');

  const hole = await measure('<div class="view" id="ch1"><section><p>one</p></section><section style="margin-top:520px"><p>two</p></section></div>');
  const bad = ruleFailures(hole, 'hole');
  assert.equal(bad.length, 1, 'one hole between two blocks');
  assert.match(bad[0].msg, /520px/, 'the message names the measured gap');
  assert.match(bad[0].msg, /section/, 'the message names the blocks either side of the gap');
});

test('emojiIcon: an emoji used as an icon or bullet fails, the same emoji in prose does not', async (t) => {
  if (!browser) return t.skip('no browser available');
  // Scope: headings, nav, buttons and labels — the places a reader reads as iconography. Prose is
  // the author's own voice (a lecture may legitimately talk about 🎲), so it is left alone.
  const prose = await measure('<div class="view" id="ch1"><div class="prose"><p>Roll the die 🎲 and count.</p></div></div>');
  assert.equal(ruleFailures(prose, 'emojiIcon').length, 0, 'an emoji inside prose is the author’s text');

  const heading = await measure('<div class="view" id="ch1"><h2>⭐ Chapter one</h2><p>body</p></div>');
  const bad = ruleFailures(heading, 'emojiIcon');
  assert.equal(bad.length, 1, 'one icon in a heading');
  assert.match(bad[0].msg, /⭐/u, 'the message names the emoji');
  assert.match(bad[0].msg, /h2/, 'the message names the element');

  const button = await measure('<div class="view" id="ch1"><button>▶ Start</button><nav><a href="#">📌 Notes</a></nav></div>');
  assert.equal(ruleFailures(button, 'emojiIcon').length, 2, 'a button and a nav link are both chrome');
});

test('gradientText: text clipped to a gradient background fails, a background highlight sweep does not', async (t) => {
  if (!browser) return t.skip('no browser available');
  // The shipped design paints highlights *behind* text (`em`, `mark` and `.sec > h3 .t` use a
  // linear-gradient background with no background-clip), so those must stay clean.
  const sweep = await measure('<div class="view" id="ch1"><h3><span class="t" style="background:linear-gradient(transparent 64%, #cfeadf 64%)">sweep</span></h3><p>body</p></div>');
  assert.equal(ruleFailures(sweep, 'gradientText').length, 0, 'a highlight behind the glyphs is not gradient text');

  const clipped = await measure('<div class="view" id="ch1"><h2 style="background:linear-gradient(90deg,#f0f,#0ff);-webkit-background-clip:text;background-clip:text;color:transparent">Fancy</h2><p>body</p></div>');
  const bad = ruleFailures(clipped, 'gradientText');
  assert.equal(bad.length, 1, 'one gradient-filled heading');
  assert.match(bad[0].msg, /h2/, 'the message names the element');
  assert.match(bad[0].msg, /background-clip/, 'the message names the cause');
});

test('cardWall: only a run of box-like siblings is a wall — paragraphs, sections and Lab controls are not cards', async (t) => {
  if (!browser) return t.skip('no browser available');
  // The four shapes below are the false positives the rule produced on the private acceptance
  // fixture: consecutive paragraphs, consecutive sections, and two kinds of Lab internal (a box-like
  // readout and a borderless control row). None of them is a card, so none may warn.
  const shapes = {
    paragraphs: `<div class="prose">${Array.from({ length: 4 }, (_, i) => `<p>paragraph ${i + 1}</p>`).join('')}</div>`,
    sections: Array.from({ length: 4 }, (_, i) => `<section class="sec" id="s${i}"><h3><span class="sn">${i + 1}</span></h3><div class="prose"><p>body ${i + 1}</p></div></section>`).join(''),
    readouts: `<div class="lab"><div class="readouts">${Array.from({ length: 4 }, (_, i) => `<div class="ro" style="background:#f4eee1;border:1px solid #d8ccb4;padding:8px 12px"><span>r</span><b>${i}</b></div>`).join('')}</div></div>`,
    controls: `<div class="lab"><div class="controls">${Array.from({ length: 4 }, (_, i) => `<div class="ctl"><label for="a${i}">a${i}</label></div>`).join('')}</div></div>`,
  };
  for (const [name, body] of Object.entries(shapes)) {
    const r = await measure(`<div class="view" id="ch1">${body}</div>`);
    const warns = ruleWarnings(r, 'cardWall');
    assert.deepEqual(warns, [], `${name} is not a card wall: ${warns.map((w) => w.msg).join('; ')}`);
  }

  // Calibrated on fixtures/sample: its longest identical run is 3 (the DIV.ro readouts), so the
  // shipped default is 4 — a wall is a run the reader scrolls past without reading.
  const card = (n, style = '') => `<div class="view" id="ch1"><section><div class="prose"><p>body</p></div>${Array.from({ length: n }, (_, i) => `<div class="card" style="padding:16px;margin:8px 0;border:1px solid #ccc;${style}">card ${i + 1}</div>`).join('')}</section></div>`;

  const three = await measure(card(3));
  assert.equal(ruleWarnings(three, 'cardWall').length, 0, 'three cards is a list, not a wall');

  const wall = await measure(card(6));
  const warns = ruleWarnings(wall, 'cardWall');
  assert.equal(warns.length, 1, 'one wall reported as one finding');
  assert.equal(ruleFailures(wall, 'cardWall').length, 0, 'a card wall is a warning, not a failure');
  assert.match(warns[0].msg, /6 identical/, 'the message names the run length');
  assert.match(warns[0].msg, /div\.card/, 'the message names the card');
});

test('leftEdges: too many distinct left edges in the reading column warns, a tidy column does not', async (t) => {
  if (!browser) return t.skip('no browser available');
  // Calibrated on fixtures/sample at 1280px: 4 distinct edges (body, erratum, takeaway, ch-head),
  // so the shipped cap is 5.
  const tidy = await measure('<div class="view" id="ch1"><div class="prose"><p>one</p><p>two</p><h3>three</h3></div></div>');
  assert.equal(ruleWarnings(tidy, 'leftEdges').length, 0, 'one column has one left edge');

  const ragged = await measure(`<div class="view" id="ch1"><div class="prose">${Array.from({ length: 8 }, (_, i) => `<p style="margin-left:${i * 23}px">block ${i + 1}</p>`).join('')}</div></div>`);
  const warns = ruleWarnings(ragged, 'leftEdges');
  assert.equal(warns.length, 1, 'one warning for the whole column');
  assert.match(warns[0].msg, /8 distinct left edges/, 'the message counts the edges it found');
});

test('typeScale: too many or too few type sizes warns', async (t) => {
  if (!browser) return t.skip('no browser available');
  // Calibrated on fixtures/sample: its two chapters carry 6 and 7 distinct sizes at desktop, and ch1
  // genuinely trips the cap (17.3/16.3/15.7px differ by under 2px, which is not a scale), so the
  // shipped band is 2..6 and the sample warns instead of the threshold being widened to hide it.
  const flat = await measure('<div class="view" id="ch1"><div class="prose"><p>one</p><p>two</p></div></div>');
  const tooFew = ruleWarnings(flat, 'typeScale');
  assert.equal(tooFew.length, 1, 'one size for everything is not a hierarchy');
  assert.match(tooFew[0].msg, /1 distinct/, 'the message counts the sizes');

  const many = await measure(`<div class="view" id="ch1"><div class="prose">${Array.from({ length: 9 }, (_, i) => `<p style="font-size:${13 + i * 3}px">size ${i + 1}</p>`).join('')}</div></div>`);
  assert.equal(ruleWarnings(many, 'typeScale').length, 1, 'nine sizes is noise');

  const good = await measure('<div class="view" id="ch1"><h2 style="font-size:32px">Title</h2><div class="prose"><p style="font-size:18px">one</p><p style="font-size:16px">two</p></div></div>');
  assert.equal(ruleWarnings(good, 'typeScale').length, 0, 'three sizes is a hierarchy');
});

test('clipped: content cut by an overflow:hidden ancestor fails, ellipsis and scroll boxes do not', async (t) => {
  if (!browser) return t.skip('no browser available');
  // A Lab clips for its rounded corners, and a Lab's own markup is not the author's to fix — but the
  // content inside it is still lost, so the rule reports it either way.
  const cut = await measure('<div class="view" id="ch1"><div class="lab" style="overflow:hidden;width:200px"><div style="width:400px">被切掉的內容 Defaulted column</div></div></div>');
  const bad = ruleFailures(cut, 'clipped');
  assert.equal(bad.length, 1, `one clipped element, got: ${bad.map((b) => b.msg).join('; ')}`);
  assert.match(bad[0].msg, /div\.lab/, 'the message names the ancestor that clips');
  assert.match(bad[0].msg, /\d+px/, 'the message says how much is cut');
  assert.match(bad[0].msg, /被切掉的內容/, 'the message quotes the text so it can be found');
  assert.equal(ruleWarnings(cut, 'clipped').length, 0, 'clipping is a failure, not a warning');

  // Everything below is clipped on purpose and must stay quiet: the ways the theme itself does it (an
  // ellipsis, a visually-hidden label) and a scroll box, whose content the reader can reach.
  const onPurpose = await measure(`<div class="view" id="ch1"><div class="lab" style="overflow:hidden;width:200px">
    <div style="width:400px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">a very long label that ends in an ellipsis</div>
    <span class="sr-only">screen reader only text that is far too wide for this box</span>
    <div class="tablewrap" style="overflow-x:auto;width:200px"><table style="width:600px"><tr><td>wide table</td></tr></table></div>
  </div></div>`);
  assert.deepEqual(ruleFailures(onPurpose, 'clipped'), [], 'an ellipsis, .sr-only and a scroll box are deliberate');
});

test('sideScroll: an overflowing scroll box without the cue fails, with the cue it warns, fitting boxes are silent', async (t) => {
  if (!browser) return t.skip('no browser available');
  const box = (attr) => `<div class="view" id="ch1"><div class="tablewrap" style="overflow-x:auto;width:240px"${attr}><table style="width:600px"><tr><td>SplitINFO 與 GainRATIO 的結論</td></tr></table></div></div>`;

  // No cue at all: the reader sees a table that ends at the edge and has no way to know otherwise.
  const bare = await measure(box(''));
  const fail = ruleFailures(bare, 'sideScroll');
  assert.equal(fail.length, 1, `one uncued scroll box, got: ${fail.map((f) => f.msg).join('; ')}`);
  assert.match(fail[0].msg, /tablewrap/, 'the message names the box kind');
  assert.match(fail[0].msg, /SplitINFO/, 'the message quotes the text in the box');
  assert.match(fail[0].msg, /\d+px/, 'the message says how far the content runs past the edge');
  assert.equal(ruleWarnings(bare, 'sideScroll').length, 0, 'a missing cue is a failure, not a warning');

  // The attribute alone is not a cue: it is a hook, and what the reader sees is the gradient the
  // stylesheet paints from it. A box that carries `data-overflow` but paints no fade is as misleading
  // as one with no attribute at all — `.calc` was exactly that, marked by the runtime and painted
  // nothing because its own `background:` shorthand came later in the file.
  const marked = await measure(box(' data-overflow="end"'));
  const unpainted = ruleFailures(marked, 'sideScroll');
  assert.equal(unpainted.length, 1, `a marked but unpainted box still fails, got: ${unpainted.map((f) => f.msg).join('; ')}`);
  assert.match(unpainted[0].msg, /no cue|paint/i, 'the message says the cue is not painted');

  // With the fade actually painted the box is honest about scrolling: content still scrolls, so the
  // author is told, but the page does not lie to the reader.
  const cued = await measure(box(' data-overflow="end"').replace('<div class="view"', '<style>[data-overflow~="end"]{background-image:linear-gradient(to left,#0003,transparent);background-repeat:no-repeat;background-size:38px 100%}</style><div class="view"'));
  assert.deepEqual(ruleFailures(cued, 'sideScroll'), [], 'a painted cue turns the failure into a warning');
  const warns = ruleWarnings(cued, 'sideScroll');
  assert.equal(warns.length, 1, 'the overflowing box still warns');
  assert.match(warns[0].msg, /SplitINFO/);

  // A box that fits says nothing and reports nothing.
  const fits = await measure('<div class="view" id="ch1"><div class="tablewrap" style="overflow-x:auto;width:600px"><table style="width:300px"><tr><td>fits</td></tr></table></div></div>');
  assert.deepEqual(ruleAll(fits, 'sideScroll'), [], 'a scroll box that fits is silent');
});

// Each rule used to cost its own page.evaluate, so one view cost six round trips and the gate pays
// that per view. One scan per view is the promise: a rule that wants a second round trip has to
// argue for it, because the sample's two viewports were most of the gate's runtime.
test('measureVisual makes one round trip per view, whatever the number of rules', async (t) => {
  if (!browser) return t.skip('no browser available');
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  try {
    await page.setContent(PAGE('<div class="view" id="ch1"><h2>Title</h2><p>one</p><p>two</p></div>'));
    let calls = 0;
    const evaluate = page.evaluate.bind(page);
    page.evaluate = (...args) => {
      calls++;
      return evaluate(...args);
    };
    const r = await measureVisual(page, defaults.rules);
    assert.equal(calls, 1, `six enabled rules must not cost six round trips (got ${calls})`);
    assert.ok(Array.isArray(r.failures) && Array.isArray(r.warnings), 'the scan still answers with both lists');
  } finally {
    await page.close();
  }
});

test('loadVisualConfig: a project override wins per key and a typo is reported, not ignored', async () => {
  const override = await loadVisualConfig({ typeScale: { max: 4 }, emojiIcon: false });
  assert.equal(override.rules.typeScale.max, 4, 'the project value wins');
  assert.equal(override.rules.typeScale.min, 2, 'keys the project leaves alone keep their default');
  assert.equal(override.rules.emojiIcon, false, 'a rule can be turned off');
  assert.equal(override.rules.cardWall.minRun, 4, 'untouched rules keep their shipped values');
  assert.deepEqual(override.unknown, [], 'every override key names a real rule');

  const typo = await loadVisualConfig({ cardwall: { minRun: 9 } });
  assert.deepEqual(typo.unknown, ['cardwall'], 'a typo names no rule');
  assert.ok(typo.known.includes('cardWall'), 'the message can list what is allowed');
});

test('a lowered threshold takes effect, so the override reaches the measurement', async (t) => {
  if (!browser) return t.skip('no browser available');
  const three = '<div class="view" id="ch1"><section><div class="prose"><p>body</p></div>' + Array.from({ length: 3 }, (_, i) => `<div class="card" style="padding:16px;margin:8px 0;border:1px solid #ccc">card ${i + 1}</div>`).join('') + '</section></div>';
  const strict = await loadVisualConfig({ cardWall: { minRun: 3 } });
  const r = await measure(three, { config: strict.rules });
  assert.equal(ruleWarnings(r, 'cardWall').length, 1, 'minRun 3 makes a three-card run a wall');
});

// One gate run for the whole file. A full render gate on the sample is ~25s, and every assertion
// about the shipped example — clean rules, both viewports, the headline arithmetic — can be read off
// the same run. The copy keeps the fixture's own verify-report.md untouched.
//
// The copy's lykeion.json lowers typeScale.max to 3. The shipped sample has one type scale now (four
// sizes), so at the default threshold of 6 it warns about nothing and the headline's warning arithmetic
// would have nothing to count. Lowering the threshold keeps that arithmetic under test without a
// second gate run and without loosening the rule itself: the default stays 6 in
// references/visual-rules.json, and 'the built sample has no typeScale warnings at the default
// thresholds' measures the shipped project against those defaults. A warning never fails a gate, so
// the status assertions are unaffected.
let sampleRun = null;
const sample = async () => {
  sampleRun ??= (async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lykeion-visual-'));
    await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
    // Build from source: the copied sample.html is a gitignored artefact, and measuring a stale build
    // would report on a runtime that is no longer in the tree.
    await build(dir);
    const project = JSON.parse(await readFile(join(dir, 'lykeion.json'), 'utf8'));
    await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ ...project, visual: { typeScale: { max: 3 } } }, null, 2));
    const r = await verify(dir, { render: true });
    return { dir, r, gate: r.gates.find((g) => g.name === 'render') };
  })();
  return sampleRun;
};

// Where the build put the page, read the same way the gate reads it.
const builtHtml = async (dir) => join(dir, JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8')).output);

// The built sample opened the way the gate opens it (fake origin, no network), so a measurement here
// is a measurement of the real page rather than of a stand-in.
const openSample = async (dir) => {
  assert.ok(browser, 'needs a browser for the visual checks');
  const htmlPath = await builtHtml(dir);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  await page.route(/^https?:\/\/(?!lykeion\.local)/, (route) => route.abort());
  await routeLocal(page, (path) => (path === `/${basename(htmlPath)}` ? htmlPath : null));
  await page.goto(`${LOCAL_ORIGIN}/${basename(htmlPath)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Lykeion && window.Lykeion.views().length > 0);
  return page;
};

// 5a: ch1 used to show seven sizes because small prose was set with ad-hoc values (.98/1.02/1.08rem),
// leaving 15.7/16.3/17.3px side by side. Every size now comes from a --fs token, so the page has one
// scale and the rule has nothing to warn about. The threshold stays at 6: the page changed, not the rule.
//
// Measured here against the SHIPPED defaults, not read off the shared gate run — that run lowers
// typeScale.max to 3 so the headline has warnings to count, and the point of this test is the sample
// at the thresholds a real project gets.
test('the built sample has no typeScale warnings at the default thresholds', async (t) => {
  const { dir } = await sample();
  if (!browser) return t.skip('no browser available');
  const page = await openSample(dir);
  try {
    for (const { width, height } of [{ width: 1280, height: 900 }, { width: 375, height: 760 }]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.Lykeion.show('ch1', { noScroll: true }));
      const measured = await measureVisual(page, defaults.rules);
      assert.deepEqual(ruleWarnings(measured, 'typeScale').map((w) => w.msg), [], `one type scale at ${width}px`);
    }
  } finally {
    await page.close();
  }
});

// The integration test: the rules have to be wired into the gate, and the shipped example has to
// pass them. A rule that only ever passes is worthless, so the same build gets one emoji heading in
// the test below and has to be measured as a failure there.
test('the render gate runs the visual rules on the built sample', async (t) => {
  const { gate, r } = await sample();
  if (gate.status === 'skipped') return t.skip('no browser available');
  const visualFailures = gate.items.filter((i) => i.ok === false && /^(hole|emojiIcon|gradientText|cardWall|leftEdges|typeScale):/.test(i.msg));
  assert.deepEqual(visualFailures.map((i) => i.msg), [], 'the shipped example has no visual failures');
  assert.equal(gate.status, 'pass', 'the shipped example passes the render gate');
  // The warnings the shared run's lowered threshold produces also have to arrive as gate items, at
  // both widths, and in the report: a rule that measures correctly but never reaches the report would
  // pass the direct measurement above and still be missing from what a reader sees.
  const report = await readFile(r.reportPath, 'utf8');
  for (const where of ['desktop 1280', 'mobile 375']) {
    const warned = gate.items.find((i) => i.warn === true && /^typeScale: /.test(i.msg) && i.msg.includes(`(${where})`));
    assert.ok(warned, `a typeScale warning at ${where}: ${gate.items.map((i) => i.msg).join('\n')}`);
    assert.ok(report.includes(warned.msg), `verify-report.md records the visual finding at ${where}`);
  }
});

// An emoji in a chapter heading is the smallest change that must trip a FAIL rule, and the CSS
// ::before form is how one usually reaches a page. Measuring it directly costs one page, where
// re-running the gate to see the same failure cost another 25s.
//
// Both widths are measured here because this is the cheap place to prove the rules ran at each one.
// That evidence used to come from the sample's own typeScale warnings; the sample has a single type
// scale now, so it comes from the rule's failure instead — a signal the sample cannot accidentally lose.
test('an emoji heading on the built sample is a failure the gate files at both widths', async (t) => {
  const { dir } = await sample();
  if (!browser) return t.skip('no browser available');
  const page = await openSample(dir);
  try {
    await page.addStyleTag({ content: '#ch1 h2::before{content:"⭐"}' });
    for (const { width, height, where } of [{ width: 1280, height: 900, where: 'desktop 1280' }, { width: 375, height: 760, where: 'mobile 375' }]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.Lykeion.show('ch1', { noScroll: true }));
      const measured = await measureVisual(page, defaults.rules);
      const bad = ruleFailures(measured, 'emojiIcon');
      assert.equal(bad.length, 1, `expected one emoji finding at ${where}, got:\n${measured.failures.map((f) => f.msg).join('\n')}`);
      assert.match(bad[0].msg, /⭐/u, 'the message names the emoji');
      assert.match(bad[0].msg, /h2/, 'the message names the element');

      // The gate's own mapping: a failure is a failing item naming the rule, the view and the width.
      const items = visualItems(measured, 'ch1', where);
      const named = items.find((i) => /emojiIcon/.test(i.msg));
      assert.ok(named, `the measurement becomes a gate item at ${where}`);
      assert.equal(named.ok, false, 'an emoji icon fails the gate, it does not warn');
      assert.match(named.msg, /ch1/, 'the failure names the chapter');
      assert.match(named.msg, /h2/, 'the failure names the element');
      assert.match(named.msg, new RegExp(where), 'the failure names the width it was measured at');
    }

    // Warnings travel the same path but never fail: ok:null is the report's ⚠ shape.
    const warned = visualItems({ warnings: [{ rule: 'cardWall', msg: '4 identical div.card siblings in a row' }] }, 'ch1', 'desktop 1280');
    assert.ok(warned.length > 0, 'a warning maps to an item');
    assert.ok(warned.every((i) => i.ok === null && i.warn === true), 'a warning is not a failure');
  } finally {
    await page.close();
  }
});

// The same emoji, end to end: the rule has to reach the real gate on the real build, at both widths,
// and turn a passing project into a failing one. Measuring the rule directly above proves the
// measurement; this proves the wiring, which is the part that can silently come loose.
//
// This is a second full render gate (~25s), and it is free: node --test runs the files in parallel
// and the suite's wall-clock is set by test/verify.test.mjs (~130s), not by this file.
test('an emoji heading fails the real render gate at both widths', async (t) => {
  const { gate } = await sample();
  if (gate.status === 'skipped') return t.skip('no browser available');

  const dir = await mkdtemp(join(tmpdir(), 'lykeion-visual-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  const htmlPath = await builtHtml(dir);
  const html = await readFile(htmlPath, 'utf8');
  await writeFile(htmlPath, html.replace('</body>', '<style>#ch1 h2::before{content:"⭐"}</style>\n</body>'));

  const after = await verify(dir, { render: true });
  const broken = after.gates.find((g) => g.name === 'render');
  assert.equal(broken.status, 'fail', 'the gate fails once a heading carries an emoji icon');

  const report = await readFile(after.reportPath, 'utf8');
  for (const where of ['desktop 1280', 'mobile 375']) {
    const named = broken.items.find((i) => i.ok === false && /emojiIcon/.test(i.msg) && i.msg.includes(`(${where})`));
    assert.ok(named, `an emojiIcon failure at ${where}: ${broken.items.map((i) => i.msg).join('\n')}`);
    assert.match(named.msg, /ch1/, 'the failure names the chapter');
    assert.match(named.msg, /h2/, 'the failure names the element');
    assert.ok(report.includes(named.msg), `verify-report.md records the failure at ${where}`);
  }
});

// The headline counts checks, so the warning items must not be counted as checks: "42 checks passed,
// 2 warning(s)" for 40 checks + 2 warnings reads as 42 checks and hides that only 40 ran.
test('the render headline counts checks only, not the warning items', async (t) => {
  const { gate } = await sample();
  if (gate.status === 'skipped') return t.skip('no browser available');
  const checks = gate.items.filter((i) => !i.warn).length;
  const warns = gate.items.filter((i) => i.warn).length;
  // Unconditional: the shared run carries a lowered typeScale.max in its own lykeion.json, so this gate
  // really does have warnings to miscount. A shape that only holds when the gate cannot warn would go
  // on passing after the counting broke.
  assert.ok(warns > 0, `the shared run must carry warnings to count (got ${warns})`);
  assert.equal(gate.headline, `${checks} checks passed, ${warns} warning(s)`, gate.headline);
  assert.doesNotMatch(gate.headline, /\b0 warning/, 'a gate with no warnings says nothing about warnings');
  assert.ok(!gate.headline.startsWith(`${gate.items.length} checks`), 'the warning items are not checks');
});

// A Lab clips for its rounded corners (.lab{overflow:hidden}). A step cell is a flex column, and a flex
// item's automatic minimum size is its content — so when the cell's only child is a .tablewrap holding a
// wide table, the cell refuses to shrink below the table and pushes it past the Lab, which cuts it. On
// the dm copy at 375px that lost the Defaulted column, the class label the whole Lab counts, with no
// sign anything was missing. The Lab's own CSS has to let the cell shrink so the scroll box can do its
// job; this is the runtime's fix, not the author's.
test('a Lab lets a wide table reach its scroll box instead of clipping it at 375px', async (t) => {
  if (!browser) return t.skip('no browser available');
  const read = (f) => readFile(join(ROOT, f), 'utf8');
  const [baseCss, labCss] = await Promise.all([read('runtime/base.css'), read('labs/stepper/lab.css')]);
  const page = await browser.newPage({ viewport: { width: 375, height: 760 }, colorScheme: 'light' });
  try {
    // The stepper Lab's markup: several steps stacked in one grid cell, each step's only child the
    // .tablewrap. The first step's table is the dm's five-column table, wider than the phone.
    const cols = ['ID', 'Home Owner', 'Marital Status', 'Annual Income', 'Defaulted'];
    const rows = [[1, 'Yes', 'Single', '125K', 'No'], [2, 'No', 'Married', '100K', 'No']];
    const table = (head, body) => `<table class="data">${head ? `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>` : ''}<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const step = (inner) => `<div><div class="tablewrap">${inner}</div></div>`;
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      ${baseCss}
      ${labCss}
      main .sheet { max-width: 1000px; margin: 0 auto; padding: 16px; }
    </style></head><body><main><div class="sheet"><div class="view" id="ch1"><div class="lab" id="lab-1"><div class="lab-body">
      <div class="step-view stack"><div class="on">${step(table(true, rows))}</div><div>${step(table(false, [[1, 'a']]))}</div></div>
    </div></div></div></div></main></body></html>`);
    const box = await page.evaluate(() => {
      const lab = document.querySelector('#lab-1');
      const tw = lab.querySelector('.tablewrap');
      const labR = lab.getBoundingClientRect();
      const twR = tw.getBoundingClientRect();
      return {
        past: Math.round(twR.right - labR.right),
        scrolls: tw.scrollWidth > tw.clientWidth + 1,
        hidden: Math.round(tw.scrollWidth - tw.clientWidth),
      };
    });
    // The table is wider than the phone, so the scroll box has to be narrower than its content and
    // scroll it — and it has to sit inside the Lab, or the Lab's overflow:hidden cuts it first.
    assert.ok(box.scrolls, `the box scrolls its table (${box.hidden}px hidden)`);
    assert.ok(box.past <= 1, `the scroll box sits inside the Lab (it reaches ${box.past}px past it)`);
    // And the rule sees the same thing: no clipped failure on a Lab that ships the fix.
    const measured = await measureVisual(page, defaults.rules);
    assert.deepEqual(ruleFailures(measured, 'clipped').map((f) => f.msg), [], 'the Lab must not clip its own scroll box');
  } finally {
    await page.close();
  }
});
