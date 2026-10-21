import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiny, renderItems, find } from './.project.mjs';

// Lab stability: a Lab must keep its height while its controls move, and a stack must show one
// variant at a time. One gate run per probe, so the Lab probes share this file.

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
