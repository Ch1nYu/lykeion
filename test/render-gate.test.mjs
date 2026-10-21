import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiny, renderItems, find } from './.project.mjs';

// The render gate's promises are only worth anything if it can fail. Each test below builds a tiny
// project that breaks exactly one promise and checks the gate names the offender — the message is
// the fix instruction the writing agent gets, so "it failed" is not enough.
//
// One gate run per probe is the whole cost of these files, so the probes are grouped by the promise
// they break: typography and navigation here, Labs in render-gate-lab, maths in render-gate-maths.

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
