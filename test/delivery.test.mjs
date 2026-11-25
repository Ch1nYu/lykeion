// `lykeion evidence` / `lykeion deliver`: the hash a review must name, and the strict final check.
// The verifier is injected so these run without a browser; only the option-refusal test starts the CLI,
// which always wires the real verify module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { collectEvidence, deliver } from '../src/delivery.mjs';
import { teachingReviewGate } from '../src/verify.mjs';

const ROOT = join(import.meta.dirname, '..');
const CLI = join(ROOT, 'bin', 'lykeion.mjs');
const run = promisify(execFile);

// A built-looking project: the files evidence hashes, and nothing the verify gates need beyond them.
async function project() {
  const dir = await mkdtemp(join(tmpdir(), 'lykeion-delivery-'));
  await mkdir(join(dir, 'content'), { recursive: true });
  await writeFile(join(dir, 'content', '01-probe.md'), '---\nchapter: 1\ntitle: Probe\n---\n\n## 1.1 Probe {pages=1}\n\ntext\n');
  await writeFile(join(dir, 'slides.pdf'), '%PDF-1.7\nprobe\n');
  const config = { title: 'Delivery probe', output: 'site.html', scope: [{ file: 'slides.pdf', path: join(dir, 'slides.pdf'), pages: '1' }] };
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify(config, null, 2));
  await writeFile(join(dir, 'checks.json'), JSON.stringify({ built: '2026-01-01T00:00:00.000Z', output: 'site.html', sections: [], levels: [], checks: [], teaching: { sections: [] } }));
  await writeFile(join(dir, 'site.html'), '<!doctype html><title>Delivery probe</title>\n');
  return dir;
}

async function editConfig(dir, patch) {
  const config = JSON.parse(await readFile(join(dir, 'lykeion.json'), 'utf8'));
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ ...config, ...patch }, null, 2));
}

async function hashAfter(mutate) {
  const dir = await project();
  await mutate(dir);
  return (await collectEvidence(dir)).hash;
}

// Every file's text, keyed by relative path: the cheapest proof that evidence changed nothing.
async function snapshot(dir, rel = '') {
  const out = {};
  for (const ent of await readdir(join(dir, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) Object.assign(out, await snapshot(dir, child));
    else out[child] = await readFile(join(dir, child), 'utf8');
  }
  return out;
}

test('evidence covers config, checks, output, content and the Scope PDF', async () => {
  const baseline = await hashAfter(async () => {});
  assert.notEqual(await hashAfter((d) => editConfig(d, { title: 'Edited' })), baseline);
  assert.notEqual(await hashAfter((d) => writeFile(join(d, 'site.html'), '<!doctype html>edited\n')), baseline);
  assert.notEqual(await hashAfter((d) => writeFile(join(d, 'content', '01-probe.md'), 'edited\n')), baseline);
  assert.notEqual(await hashAfter((d) => writeFile(join(d, 'slides.pdf'), '%PDF-1.7\nedited\n')), baseline);
  assert.notEqual(await hashAfter(async (d) => {
    const checks = JSON.parse(await readFile(join(d, 'checks.json'), 'utf8'));
    await writeFile(join(d, 'checks.json'), JSON.stringify({ ...checks, built: '2026-01-02T00:00:00.000Z' }));
  }), baseline);
});

test('evidence includes math.js, labs/** and pages/** when the project has them', async () => {
  const dir = await project();
  const without = (await collectEvidence(dir)).hash;
  await writeFile(join(dir, 'math.js'), 'export const x = 1;\n');
  const withMath = (await collectEvidence(dir)).hash;
  assert.notEqual(withMath, without);
  await mkdir(join(dir, 'labs', 'probe'), { recursive: true });
  await writeFile(join(dir, 'labs', 'probe', 'lab.js'), 'Lykeion.x = 1;\n');
  const withLab = (await collectEvidence(dir)).hash;
  assert.notEqual(withLab, withMath);
  await mkdir(join(dir, 'pages', 'slides'), { recursive: true });
  await writeFile(join(dir, 'pages', 'slides', 'p-001.txt'), 'slide\n');
  assert.notEqual((await collectEvidence(dir)).hash, withLab);
});

test('evidence leaves reviews, shots and reports out of the hash', async () => {
  const dir = await project();
  const baseline = (await collectEvidence(dir)).hash;
  await mkdir(join(dir, 'shots'), { recursive: true });
  for (const [file, text] of [
    ['source-check.md', 'STATUS: pass\n'],
    ['teaching-review.md', 'STATUS: pass\n'],
    ['visual-review.md', 'STATUS: pass\n'],
    ['verify-report.md', '# an older verify\n'],
    ['delivery-report.md', '# an older delivery\n'],
    ['shots/sample.png', 'screenshot bytes\n'],
  ]) await writeFile(join(dir, file), text);
  assert.equal((await collectEvidence(dir)).hash, baseline);
});

test('evidence refuses a missing Scope PDF, output HTML, content or checks.json', async () => {
  const noSource = await project();
  await rm(join(noSource, 'slides.pdf'));
  await assert.rejects(collectEvidence(noSource), /Scope PDF slides\.pdf .*is missing/);

  const noHtml = await project();
  await rm(join(noHtml, 'site.html'));
  await assert.rejects(collectEvidence(noHtml), /output HTML .*is missing/);

  const noContent = await project();
  await rm(join(noContent, 'content'), { recursive: true });
  await assert.rejects(collectEvidence(noContent), /content\/.*missing/);

  const noChecks = await project();
  await rm(join(noChecks, 'checks.json'));
  await assert.rejects(collectEvidence(noChecks), /checks\.json .*is missing/);
});

test('evidence refuses an output that escapes the project', async () => {
  const dir = await project();
  const checks = JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8'));
  await writeFile(join(dir, 'checks.json'), JSON.stringify({ ...checks, output: '../escaped.html' }));
  await assert.rejects(collectEvidence(dir), /not inside/);
});

test('evidence refuses a scope entry with neither path nor file', async () => {
  const dir = await project();
  await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Probe', output: 'site.html', scope: [{ pages: '1' }] }));
  await assert.rejects(collectEvidence(dir), /scope\[0\] has neither "path" nor "file"/);
});

test('evidence only reads: the project is unchanged and the hash is stable', async () => {
  const dir = await project();
  const before = await snapshot(dir);
  const first = await collectEvidence(dir);
  assert.deepEqual(await snapshot(dir), before);
  assert.deepEqual(await collectEvidence(dir), first);
});

test('the evidence CLI prints the same hash the module computes', async () => {
  const dir = await project();
  const { hash } = await collectEvidence(dir);
  const { stdout } = await run(process.execPath, [CLI, 'evidence', dir], { cwd: ROOT });
  assert.equal(stdout.trim(), `Evidence-SHA256: ${hash}`);
});

// ---------- deliver ----------
const GATES = ['numeric', 'coverage', 'quiz review', 'teaching', 'render', 'source', 'teaching review', 'visual review'];
const verifier = (patch = {}) => async () => ({
  summary: '',
  reportPath: '',
  gates: GATES.map((name) => ({ name, status: 'pass', headline: 'ok', items: [], ...(patch[name] || {}) })),
});

async function writeReview(dir, file, hash, { status = 'pass', reviewer = 'independent', evidence = hash } = {}) {
  const head = [`STATUS: ${status}`, `Reviewer: ${reviewer}`];
  if (evidence !== null) head.push(`Evidence-SHA256: ${evidence}`);
  await writeFile(join(dir, file), `# Review\n\n${head.join('\n')}\n\n## Findings\n\n- none\n`);
}

// A project whose three reviews all name the current build; `reviews` overrides or nulls one.
async function reviewed(overrides = {}) {
  const dir = await project();
  const { hash } = await collectEvidence(dir);
  const reviews = { 'source-check.md': {}, 'teaching-review.md': {}, 'visual-review.md': {}, ...overrides };
  for (const [file, review] of Object.entries(reviews)) if (review) await writeReview(dir, file, hash, review);
  return { dir, hash };
}

test('deliver is READY for a current, independently reviewed build and never edits a review', async () => {
  const { dir, hash } = await reviewed();
  const files = ['source-check.md', 'teaching-review.md', 'visual-review.md'];
  const before = {};
  for (const f of files) before[f] = await readFile(join(dir, f), 'utf8');

  const r = await deliver(dir, { verify: verifier() });
  assert.equal(r.ready, true, r.reasons.join('\n'));
  assert.equal(r.hash, hash);
  assert.deepEqual(r.disclosures, []);

  const report = await readFile(join(dir, 'delivery-report.md'), 'utf8');
  assert.match(report, /- Result: \*\*READY\*\*/);
  assert.match(report, new RegExp(`Evidence-SHA256: ${hash}`));
  assert.match(report, /## Reasons\n\n- none/);
  for (const f of files) assert.equal(await readFile(join(dir, f), 'utf8'), before[f], `${f} unchanged`);
});

test('deliver fails a missing visual review even when verify only warns, and does not create one', async () => {
  const { dir } = await reviewed({ 'visual-review.md': null });
  const r = await deliver(dir, { verify: verifier({ 'visual review': { status: 'warn', headline: 'visual review not done' } }) });
  assert.equal(r.ready, false);
  assert.match(r.reasons.join('\n'), /visual review: visual-review\.md is missing/);
  await assert.rejects(readFile(join(dir, 'visual-review.md')), /ENOENT/);
  assert.match(await readFile(join(dir, 'delivery-report.md'), 'utf8'), /\*\*NOT READY\*\*/);
});

test('deliver fails a skipped or pending render', async () => {
  for (const status of ['skipped', 'pending']) {
    const { dir } = await reviewed();
    const r = await deliver(dir, { verify: verifier({ render: { status, headline: 'not rendered' } }) });
    assert.equal(r.ready, false, status);
    assert.match(r.reasons.join('\n'), new RegExp(`gate render: ${status}`));
  }
});

test('deliver fails a failing gate', async () => {
  const { dir } = await reviewed();
  const r = await deliver(dir, { verify: verifier({ numeric: { status: 'fail', headline: '2/5 numbers match' } }) });
  assert.equal(r.ready, false);
  assert.match(r.reasons.join('\n'), /gate numeric: failed — 2\/5 numbers match/);
});

test('deliver accepts a review closed at the round cap and discloses the original evidence', async () => {
  const { dir, hash } = await reviewed();
  await writeFile(join(dir, 'teaching-review.md'), `# Review\n\nSTATUS: fail\nReviewer: independent\nEvidence-SHA256: ${hash}\nRound: 2\n\n## Findings\n\n- [must-fix] §1.1 — a wall of prose\n\n## Fixes\n\n- [fixed] §1.1 — rewritten\n`);
  await writeFile(join(dir, 'content', '01-probe.md'), 'rewritten after the last review\n');
  const r = await deliver(dir, { verify: verifier({ 'teaching review': await teachingReviewGate(dir) }) });
  assert.equal(r.ready, true, r.reasons.join('\n'));
  assert.notEqual(r.hash, hash);
  const report = await readFile(r.reportPath, 'utf8');
  assert.match(report, /\*\*READY\*\*/);
  assert.match(report, /teaching review: closed at the round cap; final fixes were not re-reviewed/);
  assert.match(report, /source check: reviewed the earlier build/);

  await writeReview(dir, 'source-check.md', hash, { evidence: 'a'.repeat(64) });
  const unrelated = await deliver(dir, { verify: verifier({ 'teaching review': await teachingReviewGate(dir) }) });
  assert.equal(unrelated.ready, false);
  assert.match(unrelated.reasons.join('\n'), /source check: Evidence-SHA256 .* is stale/);
});

test('deliver refuses a capped review with an unanswered must-fix', async () => {
  const { dir, hash } = await reviewed();
  await writeFile(join(dir, 'teaching-review.md'), `# Review\n\nSTATUS: fail\nReviewer: independent\nEvidence-SHA256: ${hash}\nRound: 2\n\n## Findings\n\n- [must-fix] §1.1 — a wall of prose\n\n## Fixes\n\n- [fixed] §1.2 — rewritten\n`);
  const r = await deliver(dir, { verify: verifier({ 'teaching review': await teachingReviewGate(dir) }) });
  assert.equal(r.ready, false);
  assert.match(r.reasons.join('\n'), /gate teaching review: failed/);
  assert.match(r.reasons.join('\n'), /teaching review: STATUS: fail/);
});

test('deliver fails reviews whose Evidence-SHA256 is not the current build', async () => {
  const { dir } = await reviewed();
  await writeFile(join(dir, 'content', '01-probe.md'), 'edited after the reviews\n');
  const r = await deliver(dir, { verify: verifier() });
  assert.equal(r.ready, false);
  const reasons = r.reasons.join('\n');
  for (const label of ['source check', 'teaching review', 'visual review']) {
    assert.match(reasons, new RegExp(`${label}: Evidence-SHA256 .* is stale`));
  }
});

test('deliver allows a completed self-review with a reason as a disclosure', async () => {
  const { dir } = await reviewed({ 'source-check.md': { reviewer: 'self (no sub-agent tool in this host)' } });
  const r = await deliver(dir, { verify: verifier({ source: { selfReview: true, headline: 'self-review (no sub-agent tool in this host)' } }) });
  assert.equal(r.ready, true, r.reasons.join('\n'));
  const disclosures = r.disclosures.join('\n');
  assert.match(disclosures, /source check: self-review \(no sub-agent tool in this host\)/);
  assert.match(disclosures, /source: completed by the writing agent itself/);
  assert.match(await readFile(join(dir, 'delivery-report.md'), 'utf8'), /## Disclosures/);
});

test('deliver fails a self-review with no reason', async () => {
  const { dir } = await reviewed({ 'source-check.md': { reviewer: 'self' } });
  const r = await deliver(dir, { verify: verifier() });
  assert.equal(r.ready, false);
  assert.match(r.reasons.join('\n'), /source check: Reviewer "self" has no reason/);
});

test('deliver does not accept STATUS: n/a as a completed review', async () => {
  const { dir } = await reviewed({ 'source-check.md': { status: 'n/a (no Primary Source)' } });
  const r = await deliver(dir, { verify: verifier({ source: { status: 'skipped', headline: 'not applicable' } }) });
  assert.equal(r.ready, false);
  assert.match(r.reasons.join('\n'), /source check: STATUS: n\/a is not a pass/);
});

test('deliver detects an edit made while verify is running', async () => {
  const { dir } = await reviewed();
  let calls = 0;
  const verify = async (root, opts) => {
    calls++;
    assert.equal(opts.render, true, 'delivery always renders');
    await writeFile(join(root, 'content', '01-probe.md'), 'edited during verification\n');
    return verifier()(root, opts);
  };
  const r = await deliver(dir, { verify });
  assert.equal(calls, 1);
  assert.equal(r.ready, false);
  assert.match(r.reasons.join('\n'), /evidence changed while verifying/);
});

test('the CLI refuses --no-render and unknown options', async () => {
  const cases = [
    [['deliver', '--no-render'], /deliver always renders/],
    [['deliver', '--bogus'], /unknown option "--bogus"/],
    [['evidence', '--bogus'], /unknown option "--bogus"/],
    [['evidence', '--no-render'], /unknown option "--no-render"/],
  ];
  for (const [args, expected] of cases) {
    const err = await run(process.execPath, [CLI, ...args], { cwd: ROOT }).then(() => null, (e) => e);
    assert.ok(err, `${args.join(' ')} should exit nonzero`);
    assert.equal(err.code, 1, `${args.join(' ')} exit code`);
    assert.match(err.stderr, expected);
  }
});
