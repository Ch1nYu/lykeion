// `lykeion evidence` / `lykeion deliver`: the strict final check. evidence names the exact bytes a
// review judged; deliver runs verification with rendering and writes delivery-report.md.
// A review closed at its round cap keeps its original evidence and an explicit warning.
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { verify as verifyProject } from './verify.mjs';

export const evidenceHelp = `lykeion evidence <project-dir>

Hashes the exact build a review must name: lykeion.json, checks.json, the output HTML, content/**,
math.js and labs/** when present, pages/**, and the Scope PDFs. Review reports, shots/ and
verify-report.md are left out, so a review can be written and screenshots regenerated without
invalidating the hash. Prints "Evidence-SHA256: <hash>" and writes nothing.`;

export const deliverHelp = `lykeion deliver <project-dir>

The final check. Runs "lykeion verify" with rendering and requires all three review reports.
Each report needs a valid Reviewer line and Evidence-SHA256. A teaching or visual review closed
with every must-fix answered at the round cap can keep its original evidence. Reviews of that same
earlier build are disclosed, and the final fixes are reported as not re-reviewed.
Writes delivery-report.md with READY or NOT READY and exits 1 when not ready. Reviews are never
stamped or edited; a completed self-review stays a warning with its disclosure. --no-render is refused.`;

const REVIEWS = [['source-check.md', 'source check'], ['teaching-review.md', 'teaching review'],
  ['visual-review.md', 'visual review']];

const posix = (p) => p.split(sep).join('/');
const inside = (root, target) => { const rel = relative(root, target); return !!rel && !rel.startsWith('..') && !isAbsolute(rel); };

async function readBytes(path, what) {
  try { return await readFile(path); } catch (e) {
    throw new Error(`${what} ${path} ${e.code === 'ENOENT' ? 'is missing' : `is unreadable (${e.code || e.message})`}`);
  }
}

async function readJson(path, what) {
  const bytes = await readBytes(path, what);
  try { return { bytes, value: JSON.parse(bytes.toString('utf8')) }; }
  catch (e) { throw new Error(`${what} ${path} is not valid JSON: ${e.message}`); }
}

// Every regular file under `rel`, sorted by name so the hash never depends on directory order.
// A symlink or device is an explicit error: silently skipping it would hide a changed file.
async function walk(root, rel = '') {
  let entries;
  try { entries = await readdir(join(root, rel), { withFileTypes: true }); }
  catch (e) { throw new Error(`${rel || '.'}/ cannot be read${e.code === 'ENOENT' ? ' (missing)' : ''}: ${e.message}`); }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const out = [];
  for (const ent of entries) {
    const child = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...await walk(root, child));
    else if (ent.isFile()) out.push(child);
    else throw new Error(`${child} is not a regular file or directory; refusing to skip it`);
  }
  return out;
}

// `labs/` and `pages/` are optional. A present-but-unreadable one is an error, never a skip.
async function optionalDir(root, rel) {
  let st;
  try { st = await stat(join(root, rel)); } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw new Error(`${rel}/ cannot be inspected: ${e.code || e.message}`);
  }
  if (!st.isDirectory()) throw new Error(`${rel}/ is not a directory`);
  return walk(root, rel);
}

export async function collectEvidence(dir) {
  const root = resolve(dir);
  const config = await readJson(join(root, 'lykeion.json'), 'lykeion.json');
  const checks = await readJson(join(root, 'checks.json'), 'checks.json');
  if (!checks.value.output) throw new Error('checks.json has no "output" — run "lykeion build" first');
  const outputPath = resolve(root, checks.value.output);
  if (!inside(root, outputPath)) throw new Error(`checks.json output "${checks.value.output}" is not inside ${root}`);
  const output = await readBytes(outputPath, 'output HTML');
  const content = await walk(root, 'content').catch((e) => { throw new Error(`content/: ${e.message}`); });
  if (!content.length) throw new Error('content/ has no files — nothing has been written to deliver');

  const h = createHash('sha256');
  // Length-prefixed frames: no concatenation of path and bytes can collide with another entry.
  const feed = (kind, rel, bytes) => { h.update(`${kind}\0${rel}\0${bytes.length}\0`); h.update(bytes); };

  feed('config', 'lykeion.json', config.bytes);
  feed('checks', 'checks.json', checks.bytes);
  feed('output', posix(relative(root, outputPath)), output);

  const scope = config.value.scope || [];
  for (const [i, sc] of scope.entries()) {
    if (!sc.path && !sc.file) throw new Error(`lykeion.json scope[${i}] has neither "path" nor "file"`);
    const file = sc.file || basename(sc.path);
    feed('source', file, await readBytes(sc.path ? resolve(root, sc.path) : join(root, sc.file), `Scope PDF ${file}`));
  }

  const math = await readFile(join(root, 'math.js')).catch((e) => {
    if (e.code === 'ENOENT') return null;
    throw new Error(`math.js is unreadable (${e.code || e.message})`);
  });
  if (math) feed('math', 'math.js', math);

  for (const rel of content) feed('content', rel, await readBytes(join(root, rel), 'content file'));
  for (const [kind, rel] of [['labs', 'labs'], ['pages', 'pages']]) {
    const files = await optionalDir(root, rel);
    // Each entry is already relative to the project root (e.g. labs/probe/lab.js).
    for (const file of files || []) feed(kind, file, await readBytes(join(root, file), `${rel} file`));
  }

  return { hash: h.digest('hex') };
}

function reviewEvidence(head) {
  return /^Evidence-SHA256:[ \t]*`?([\da-f]{64})`?[ \t]*\r?$/im.exec(head)?.[1].toLowerCase();
}

function inspectReview({ head, label, closedAtCap }, hash, capEvidence) {
  const problems = [], disclosures = [];
  const status = /^STATUS:[ \t]*(\S+)/im.exec(head)?.[1]?.toLowerCase() || null;
  if (status !== 'pass' && !closedAtCap) {
    if (status === 'n/a') problems.push(`${label}: STATUS: n/a is not a pass — delivery needs a completed review`);
    else if (status === 'fail') problems.push(`${label}: STATUS: fail — fix every must-fix finding and re-review`);
    else problems.push(`${label}: STATUS line is ${status ? `"${status}"` : 'missing'} — delivery needs STATUS: pass in the header`);
  }

  const rev = /^Reviewer:\s*([^\s(]+)\s*(?:\(([^)]*)\))?/im.exec(head);
  const reviewer = rev ? rev[1].toLowerCase() : null;
  const why = rev?.[2]?.trim() || '';
  if (reviewer === 'self') {
    if (why) disclosures.push(`${label}: self-review (${why}) — not an independent check`);
    else problems.push(`${label}: Reviewer "self" has no reason — get an independent reviewer, or state why the host could not start one`);
  } else if (reviewer !== 'independent') {
    problems.push(`${label}: ${reviewer ? `Reviewer "${reviewer}"` : 'Reviewer line missing'} — delivery needs "independent" or "self (reason)"`);
  }

  const evidence = reviewEvidence(head);
  if (!evidence) problems.push(`${label}: no valid Evidence-SHA256 line in the header — run "lykeion evidence" and record its hash`);
  else if (hash && evidence !== hash) {
    if (capEvidence.has(evidence)) disclosures.push(`${label}: reviewed the earlier build ${evidence.slice(0, 12)}; final fixes were not re-reviewed`);
    else problems.push(`${label}: Evidence-SHA256 ${evidence} is stale — the review judged a different build (current ${hash})`);
  }
  if (closedAtCap) disclosures.push(`${label}: closed at the round cap; final fixes were not re-reviewed`);
  return { problems, disclosures };
}

function reportText({ title, hash, ready, gates, reasons, disclosures }) {
  const lines = [
    `# Delivery report — ${title}`,
    '',
    `- Delivered: ${new Date().toISOString()}`,
    `- Evidence-SHA256: ${hash || '(not collected)'}`,
    `- Result: **${ready ? 'READY' : 'NOT READY'}**`,
    '',
    '| Gate | Status | Summary |', '|---|---|---|',
    ...gates.map((g) => `| ${g.name} | ${g.status} | ${g.headline || ''} |`),
    '',
    '## Reasons',
    '',
    ...(reasons.length ? reasons.map((r) => `- ${r}`) : ['- none']),
    '',
  ];
  if (disclosures.length) lines.push('## Disclosures', '', ...disclosures.map((d) => `- ${d}`), '');
  lines.push("Delivery checks the evidence, not the user's judgement: warnings and disputed findings still stand after READY.", '');
  return lines.join('\n');
}

export async function deliver(dir, { verify = verifyProject } = {}) {
  const root = resolve(dir);
  const reasons = [], disclosures = new Set();
  let before = null, after = null, gates = [];

  try {
    before = await collectEvidence(root);
  } catch (e) {
    reasons.push(`evidence: ${e.message}`);
  }

  if (before) {
    try {
      const res = await verify(root, { render: true });
      gates = Array.isArray(res.gates) ? res.gates : [];
      if (!gates.length) reasons.push('verification returned no gate results — nothing was checked');
    } catch (e) {
      reasons.push(`verification could not run: ${e.message}`);
    }
    try {
      after = await collectEvidence(root);
    } catch (e) {
      reasons.push(`evidence after verification: ${e.message}`);
    }
    if (after && before.hash !== after.hash) {
      reasons.push(`evidence changed while verifying (${before.hash.slice(0, 12)}… → ${after.hash.slice(0, 12)}…): the verified build is not the delivered one`);
    }
  }

  for (const g of gates) {
    if (g.status === 'fail') reasons.push(`gate ${g.name}: failed — ${g.headline || 'see verify-report.md'}`);
    else if (g.status !== 'pass' && g.status !== 'warn') reasons.push(`gate ${g.name}: ${g.status || 'no status'} — every gate must run and pass`);
    if (g.selfReview) disclosures.add(`${g.name}: completed by the writing agent itself, not independently`);
  }

  const hash = after?.hash || before?.hash || null;
  const reviews = [];
  for (const [file, label] of REVIEWS) {
    let txt;
    try {
      txt = await readFile(join(root, file), 'utf8');
    } catch (e) {
      reasons.push(`${label}: ${file} is ${e.code === 'ENOENT' ? 'missing' : `unreadable (${e.code || e.message})`} — delivery needs a completed review`);
      continue;
    }
    const head = txt.split(/^##\s/m)[0];
    const closedAtCap = label !== 'source check' && /^STATUS:[ \t]*fail\b/im.test(head) &&
      gates.some((gate) => gate.name === label && gate.status === 'warn' && gate.closedAtCap);
    reviews.push({ head, label, closedAtCap });
  }
  const capEvidence = new Set(reviews.filter((review) => review.closedAtCap).map((review) => reviewEvidence(review.head)));
  for (const review of reviews) {
    const found = inspectReview(review, hash, capEvidence);
    reasons.push(...found.problems);
    for (const d of found.disclosures) disclosures.add(d);
  }

  const ready = reasons.length === 0;
  const title = await readFile(join(root, 'lykeion.json'), 'utf8').then((t) => JSON.parse(t).title, () => null);
  const reportPath = join(root, 'delivery-report.md');
  await writeFile(reportPath, reportText({ title: title || basename(root), hash, ready, gates, reasons, disclosures: [...disclosures] }));
  return { ready, reasons, disclosures: [...disclosures], hash, gates, reportPath };
}

function projectDir(args, command) {
  const positional = [];
  for (const a of args) {
    if (a === '--no-render') {
      if (command === 'deliver') throw new Error(`${command} always renders; --no-render is not accepted`);
      throw new Error(`unknown option "${a}"`);
    }
    if (a.startsWith('-')) throw new Error(`unknown option "${a}"`);
    positional.push(a);
  }
  if (positional.length > 1) throw new Error(`expected one project directory, got ${positional.length}`);
  return resolve(positional[0] || '.');
}

export async function runEvidence(args) {
  const dir = projectDir(args, 'evidence');
  const { hash } = await collectEvidence(dir);
  console.log(`Evidence-SHA256: ${hash}`);
}

export async function runDeliver(args) {
  const dir = projectDir(args, 'deliver');
  const r = await deliver(dir);
  console.log(r.ready ? 'READY' : 'NOT READY');
  for (const reason of r.reasons) console.log(`  ✗ ${reason}`);
  for (const d of r.disclosures) console.log(`  ⚠ ${d}`);
  console.log(`evidence → ${r.hash || '(not collected)'}`);
  console.log(`report → ${r.reportPath}`);
  if (!r.ready) process.exitCode = 1;
}

export const evidenceCommand = { help: evidenceHelp, run: runEvidence };
export const deliverCommand = { help: deliverHelp, run: runDeliver };
