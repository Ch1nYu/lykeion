import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visualReviewGate, teachingReviewGate, verify } from '../src/verify.mjs';
import { build } from '../src/build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- visual review gate (shares the source gate's mechanism) ----------
const review = (reviewer, status = 'pass') => [`STATUS: ${status}`, ...(reviewer === undefined ? [] : [`Reviewer: ${reviewer}`]), '', '## Findings', '- none', ''].join('\n');

async function gateWith(text) {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  if (text !== null) await writeFile(join(dir, 'visual-review.md'), text);
  return visualReviewGate(dir);
}

async function sampleCopy() {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await cp(join(ROOT, 'fixtures', 'sample'), dir, { recursive: true });
  return dir;
}

// First release: the visual review is new, so a project that has not done one is warned about, not
// failed. The headline has to say how to do it, or the warning is just noise.
test('visual review is a warning, not a failure, until visual-review.md exists', async () => {
  const g = await gateWith(null);
  assert.equal(g.name, 'visual review');
  assert.equal(g.status, 'warn', 'a missing visual review does not fail verify in this first release');
  assert.match(g.headline, /visual review not done/);
  assert.match(g.headline, /lykeion shots/);
  assert.match(g.headline, /references\/visual-reviewer\.md/);
  assert.equal(g.items[0].ok, null);
  assert.equal(g.items[0].warn, true);
  assert.match(g.items[0].msg, /visual-review\.md not found/);
});

// The warning must not be mistaken for a pass either: ⚠ in the table, the gate named in the report,
// and verify still ok while every other gate passes.
test('a missing visual review leaves verify passing and shows up as ⚠ in the report', async () => {
  const dir = await sampleCopy();
  await build(dir);
  await writeFile(join(dir, 'source-check.md'), review('independent'));
  await writeFile(join(dir, 'teaching-review.md'), review('independent'));
  const r = await verify(dir, { render: false });
  const g = r.gates.find((x) => x.name === 'visual review');
  assert.ok(g, r.gates.map((x) => x.name).join(', '));
  assert.equal(g.status, 'warn');
  assert.equal(r.ok, true, 'a missing visual review is not a failure');
  const report = await readFile(join(dir, 'verify-report.md'), 'utf8');
  assert.match(report, /\| visual review \| ⚠ warn \|/);
  assert.ok(report.includes('## visual review'), report);
});

test('visual review reads STATUS, and warns when the writing agent reviewed itself', async () => {
  const pass = await gateWith(review('independent'));
  assert.equal(pass.status, 'pass');
  assert.equal(pass.headline, 'independent (from visual-review.md)');
  assert.equal(pass.items[0].ok, true);
  assert.equal(pass.items[0].warn, undefined);

  const self = await gateWith(review('self (no sub-agent tool in this host)'));
  assert.equal(self.status, 'pass', 'a self-review still passes when its STATUS says pass');
  assert.equal(self.headline, 'self-review, not independent (no sub-agent tool in this host) (from visual-review.md)');
  assert.equal(self.items[0].warn, true, 'but it is painted ⚠, not ✓');
  assert.equal(self.selfReview, true);
});

test('visual review fails on a STATUS of fail', async () => {
  const g = await gateWith(review('independent', 'fail'));
  assert.equal(g.status, 'fail');
  assert.equal(g.items[0].ok, false);
});

test('visual review fails a self-review that gives no reason', async () => {
  const g = await gateWith(review('self'));
  assert.equal(g.status, 'fail');
  assert.equal(g.items[0].ok, false);
  assert.match(g.items[0].msg, /Reviewer "self" needs a reason/);
  assert.equal(g.selfReview, true);
});

// The three review gates are one mechanism: a new header convention must reach all of them.
test('visual review and teaching review share one mechanism', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-'));
  await writeFile(join(dir, 'visual-review.md'), 'STATUS: pass\nreviewer: SUB-AGENT\n\n## Findings\n- none\n');
  const visual = await visualReviewGate(dir);
  await writeFile(join(dir, 'teaching-review.md'), 'STATUS: pass\nreviewer: SUB-AGENT\n\n## Findings\n- none\n');
  const teaching = await teachingReviewGate(dir);
  assert.equal(visual.headline, teaching.headline.replace('teaching-review.md', 'visual-review.md'));
  assert.match(visual.headline, /reviewer "sub-agent" not recognised/);
  assert.equal(visual.items[0].warn, true);
});

// Guards the wiring: the guide the gate names has to exist, tell the reviewer to capture the shots,
// and say which file to write. The brief has to point at the same guide and result.
test('the visual reviewer guide names the shots command and the result file the gate reads', async () => {
  const guide = await readFile(join(ROOT, 'references', 'visual-reviewer.md'), 'utf8');
  assert.match(guide, /lykeion shots/);
  assert.match(guide, /visual-review\.md/);
  const brief = await readFile(join(ROOT, 'references', 'reviewer-brief.md'), 'utf8');
  assert.match(brief, /visual-reviewer\.md/);
  assert.match(brief, /visual-review\.md/);
});

// ---------- regressions found while reading the report code ----------
// `icon()` maps a gate status to the mark the console summary and the report table print. It knew
// pass, fail, skipped and pending but not warn, so a warning gate printed `?` — the one mark the
// report reserves for a status it cannot read. Guard both places the mark is printed.
test('a warn gate prints ⚠ in the console summary and in the report table, not ?', async () => {
  const dir = await sampleCopy();
  await build(dir);
  const r = await verify(dir, { render: false });
  const visual = r.gates.find((g) => g.name === 'visual review');
  assert.equal(visual.status, 'warn');
  assert.match(r.summary, /⚠ visual review/, r.summary);
  assert.ok(!r.summary.includes('? visual review'), r.summary);
  const report = await readFile(join(dir, 'verify-report.md'), 'utf8');
  assert.match(report, /\| visual review \| ⚠ warn \|/);
  assert.ok(!/\| visual review \| \?/.test(report), report);
});

// A gate that has no result yet is pending (…) — still not a `?`.
test('a review with no result file prints … in the console summary, not ?', async () => {
  const dir = await sampleCopy();
  await build(dir);
  const r = await verify(dir, { render: false });
  assert.match(r.summary, /… source/, r.summary);
  assert.match(r.summary, /… teaching review/, r.summary);
  assert.ok(!/\? (source|teaching review)/.test(r.summary), r.summary);
});
