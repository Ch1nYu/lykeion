import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../src/browser.mjs';
import { measureVisual, loadVisualConfig } from '../src/visual.mjs';
import { build } from '../src/build.mjs';
import { verify } from '../src/verify.mjs';

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

test('cardWall: a run of identical sibling cards warns, a short run or varied sizes does not', async (t) => {
  if (!browser) return t.skip('no browser available');
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

// The integration test: the rules have to be wired into the gate, and the shipped example has to
// pass them. A rule that only ever passes is worthless, so the same build gets one emoji heading and
// must then fail — that proves the wiring, not just the measurement.
test('the render gate runs the visual rules on the built sample', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-visual-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });

  const before = await verify(dir, { render: true });
  const gate = before.gates.find((g) => g.name === 'render');
  if (gate.status === 'skipped') return t.skip('no browser available');
  const visualFailures = gate.items.filter((i) => i.ok === false && /^(hole|emojiIcon|gradientText|cardWall|leftEdges|typeScale):/.test(i.msg));
  assert.deepEqual(visualFailures.map((i) => i.msg), [], 'the shipped example has no visual failures');
  assert.equal(gate.status, 'pass', 'the shipped example passes the render gate');

  // An emoji in a chapter heading is the smallest change that must trip a FAIL rule.
  const html = await readFile(join(dir, 'sample.html'), 'utf8');
  await writeFile(join(dir, 'sample.html'), html.replace('</body>', '<style>#ch1 h2::before{content:"⭐"}</style>\n</body>'));
  const after = await verify(dir, { render: true });
  const broken = after.gates.find((g) => g.name === 'render');
  assert.equal(broken.status, 'fail', 'the gate fails once a heading carries an emoji icon');
  const named = broken.items.find((i) => i.ok === false && /emojiIcon/.test(i.msg));
  assert.ok(named, 'the failure names the emojiIcon rule');
  assert.match(named.msg, /ch1/, 'the failure names the chapter');
  assert.match(named.msg, /h2/, 'the failure names the element');
  assert.match(await readFile(after.reportPath, 'utf8'), /emojiIcon/, 'verify-report.md records the rule');
});

// The headline counts checks, so the warning items must not be counted as checks: "42 checks passed,
// 2 warning(s)" for 40 checks + 2 warnings reads as 42 checks and hides that only 40 ran.
test('the render headline counts checks only, not the warning items', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-visual-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  const r = await verify(dir, { render: true });
  const gate = r.gates.find((g) => g.name === 'render');
  if (gate.status === 'skipped') return t.skip('no browser available');
  const checks = gate.items.filter((i) => !i.warn).length;
  const warns = gate.items.filter((i) => i.warn).length;
  assert.equal(gate.headline, `${checks} checks passed, ${warns} warning(s)`, gate.headline);
  assert.ok(!gate.headline.startsWith(`${gate.items.length} checks`), 'the warning items are not checks');
});
