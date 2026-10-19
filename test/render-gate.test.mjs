import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/build.mjs';
import { verify } from '../src/verify.mjs';

// The render gate's promises are only worth anything if it can fail. Each test below builds a tiny
// project that breaks exactly one promise and checks the gate names the offender — the message is
// the fix instruction the writing agent gets, so "it failed" is not enough.

const tiny = async (body, { labs = {} } = {}) => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-render-'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Render probe', output: 'probe.html', scope: [] }));
  await mkdir(join(dir, 'content'), { recursive: true });
  await writeFile(join(dir, 'content', '01-probe.md'), `---\nchapter: 1\ntitle: Probe\nshort: probe\nsource: sample.pdf\n---\n\n## 1.1 A section {pages=1}\n\n${body}\n`);
  for (const [type, js] of Object.entries(labs)) {
    await mkdir(join(dir, 'labs', type), { recursive: true });
    await writeFile(join(dir, 'labs', type, 'lab.js'), js);
  }
  await build(dir);
  return dir;
};

// One verify run per probe; a machine without a browser cannot check rendering at all, so the test
// skips loudly rather than passing on nothing (the same contract as the other render tests).
const renderItems = async (t, dir) => {
  const res = await verify(dir, { render: true });
  const gate = res.gates.find((g) => g.name === 'render');
  assert.ok(gate, 'the render gate ran');
  if (gate.status === 'skipped') {
    t.skip('no browser available');
    return null;
  }
  return gate.items;
};

// Insert a fragment into the built page: the way to break one promise without breaking the build (a
// stylesheet that sets text too wide, a script that labels something the way a regression would).
const append = async (dir, fragment) => {
  const file = join(dir, 'probe.html');
  const html = await readFile(file, 'utf8');
  await writeFile(file, html.replace('</body>', `${fragment}\n</body>`));
};

const find = (items, re) => items.find((i) => re.test(i.msg));

test('E1 fails a paragraph that renders in a face other than --f-display or --f-body', async (t) => {
  const dir = await tiny('這一段正常。\n\n這一段換了字體：<span style="font-family:Georgia, serif">另一種字體</span> 收尾。\n');
  const items = await renderItems(t, dir);
  if (!items) return;
  const bad = find(items, /is not --f-display or --f-body/);
  assert.ok(bad, `expected a font item, got:\n${items.map((i) => i.msg).join('\n')}`);
  assert.equal(bad.ok, false, 'the font item fails');
  // The message has to say which element and which face, or the agent cannot find it.
  assert.match(bad.msg, /span/);
  assert.match(bad.msg, /Georgia/);
});

test('E2 fails a paragraph that breaks the rhythm (line-height 1.4)', async (t) => {
  const dir = await tiny('這一段正常。\n\n<p style="line-height:1.4">這一段擠得很緊，讀起來很累。</p>\n');
  const items = await renderItems(t, dir);
  if (!items) return;
  const bad = find(items, /break the rhythm/);
  assert.ok(bad, `expected a rhythm item, got:\n${items.map((i) => i.msg).join('\n')}`);
  assert.equal(bad.ok, false, 'the rhythm item fails');
  assert.match(bad.msg, /line-height ×1\.4/);
});

test('E3 fails a Lab whose text grows without api.stack, naming the Lab, the width and the control', async (t) => {
  // The custom Lab swaps a short label for a long sentence in place: nothing is reserved, so the
  // box grows by a line and the page jumps under the reader's hand.
  const dir = await tiny('先看這個 Lab。\n\n```lab grow\ntitle: 換一句\n```\n\n看完了。\n', {
    labs: {
      grow: `Lykeion.registerLab('grow', function (root, p, api) {
  var out = api.H('div', { class: 'grow-out' }, '短');
  var btn = api.H('button', { type: 'button' }, '換一句');
  btn.addEventListener('click', function () {
    out.textContent = '這是一段刻意寫得很長的說明文字，用來撐高整個 Lab 的盒子，而且它沒有使用 api.stack，所以換句子的時候盒子會長大。';
  });
  root.appendChild(btn);
  root.appendChild(out);
});\n`,
    },
  });
  const items = await renderItems(t, dir);
  if (!items) return;
  const bad = find(items, /Labs resize while their controls move/);
  assert.ok(bad, `expected a Lab-stability item, got:\n${items.map((i) => i.msg).join('\n')}`);
  assert.equal(bad.ok, false, 'the Lab-stability item fails');
  // Lab id, width and the control that moved it — the three things needed to reproduce. The width
  // that breaks depends on the Lab, so accept either and read it back from the message.
  assert.match(bad.msg, /Lab lab-1 \(grow\)/);
  assert.match(bad.msg, /at (1280|375)px/);
  assert.match(bad.msg, /height \d+(\.\d+)?px → \d+(\.\d+)?px \(\d+(\.\d+)?px swing\)/);
  assert.match(bad.msg, /after button “換一句”/);
  // The reported swing has to be a real movement, not a rounding difference dressed up as one.
  const swing = Number(/\((\d+(?:\.\d+)?)px swing\)/.exec(bad.msg)?.[1]);
  assert.ok(swing > 2, `the swing (${swing}px) must be above the 2px tolerance`);
});

test('E5 fails a stack that shows two variants at once', async (t) => {
  const dir = await tiny('一個堆疊。\n\n```lab twoup\ntitle: 堆疊\n```\n', {
    labs: {
      twoup: `Lykeion.registerLab('twoup', function (root, p, api) {
  var box = api.H('div', {}, '');
  root.appendChild(box);
  api.stack(box, ['甲', '乙']);
  box.children[0].classList.add('on');
  box.children[1].classList.add('on');
});\n`,
    },
  });
  const items = await renderItems(t, dir);
  if (!items) return;
  const bad = find(items, /stacks show more than one variant/);
  assert.ok(bad, `expected a stack item, got:\n${items.map((i) => i.msg).join('\n')}`);
  assert.equal(bad.ok, false, 'the stack item fails');
  assert.match(bad.msg, /shows 2/);
});

test('E6 fails a sidebar link whose target lands under the sticky bar', async (t) => {
  // `scroll-padding-top` is what keeps a scrolled-to heading clear of the bar; without it the
  // section lands at the very top of the viewport, underneath it.
  // The page has to be long enough to scroll, or every link counts as "the page end" and the
  // landing rule can never fail.
  const filler = Array.from({ length: 30 }, (_, i) => `第 ${i + 1} 段內文，用來把頁面拉長。`).join('\n\n');
  const dir = await tiny(`<style>html{scroll-padding-top:0 !important}</style>\n\n${filler}\n\n### 第二個小節\n\n又一段內文。\n`);
  const items = await renderItems(t, dir);
  if (!items) return;
  const bad = find(items, /sidebar links land in the wrong place/);
  assert.ok(bad, `expected a landing item, got:\n${items.map((i) => i.msg).join('\n')}`);
  assert.equal(bad.ok, false, 'the landing item fails');
  // The message names the link and both numbers, so the fix ("clear the bar") is obvious. Which of
  // the section link and its sub-heading link lands first is an ordering detail of the sidebar.
  assert.match(bad.msg, /“[^”]+” → target top y=0px, top bar bottom y=\d+px/);
});

// The table Lab is the one built-in Lab whose content is a grid of numbers, and a grid's column
// widths follow its widest cell: allowed to wrap, a header label re-wraps whenever a number gains or
// loses a digit, and the whole Lab jumps a line while the reader drags a value down to 0. This is a
// positive probe on the built-in Lab — the heights must not move at either width.
test('E3 keeps the built-in table Lab steady at both widths', async (t) => {
  const table = [
    '```lab table',
    'names: [[tp, fp], [fn, tn]]',
    'rows: [實際確診且已完成追蹤, 實際未確診但完成追蹤]',
    'cols: [檢出陽性, 檢出陰性]',
    'values: [[1240, 3], [5, 40]]',
    'margins: true',
    'outputs:',
    '  - { label: 敏感度（真陽性率）, expr: "tp / (tp + fn)", digits: 3 }',
    '  - { label: 陽性預測值, expr: "tp / (tp + fp)", digits: 3 }',
    'verdict:',
    '  - { when: "tp + fp == 0", text: 沒有任何人驗出陽性，陽性預測值未定義，要先確認檢驗流程。 }',
    '  - { when: "1", text: 陽性預測值偏低，盛行率低時尤其明顯，值得先看盛行率再決定怎麼用。 }',
    '```',
  ].join('\n');
  const dir = await tiny(`這張表把受檢者依檢驗與診斷分格，邊際次數與檢定統計量會跟著更新。\n\n${table}\n`);
  const items = await renderItems(t, dir);
  if (!items) return;
  const swings = items.filter((i) => /\(table\)/.test(i.msg) && /swing/.test(i.msg));
  assert.deepEqual(swings, [], `the table Lab must not resize:\n${swings.map((i) => i.msg).join('\n')}`);
  for (const width of ['1280px', '375px']) {
    const ok = find(items, new RegExp(`every Lab keeps its height while its controls move at ${width}`));
    assert.ok(ok, `expected the ${width} stability item, got:\n${items.map((i) => i.msg).join('\n')}`);
    assert.equal(ok.ok, true, ok.msg);
  }
});

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
