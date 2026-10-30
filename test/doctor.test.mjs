import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  help, checkNode, checkDependencies, checkBrowser, formatResult, exitCode, run,
} from '../src/doctor.mjs';
import { MIN_NODE } from '../src/node.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The failure this check exists for: `node_modules/playwright-core` had no `lib/coreBundle.js`, so
// the package resolved and its entry threw. A check that only looked for the directory would pass.
test('dependency check: a dependency whose entry throws fails with the npm ci fix', async () => {
  const importer = async (id) => {
    if (id === 'playwright') throw new Error("Cannot find module 'playwright-core/lib/coreBundle.js'");
  };
  const r = await checkDependencies({ manifest: { dependencies: { playwright: '^1.64.1' } }, importer });
  assert.equal(r.ok, false);
  assert.equal(r.name, 'dependencies');
  assert.match(r.problem, /playwright does not import/);
  assert.match(r.problem, /coreBundle\.js/);
  assert.match(r.fix, /npm ci/);
  // The fix has to run where package.json is, so the folder is named and it is the absolute one.
  assert.ok(r.fix.includes(ROOT), `fix must name ${ROOT}: ${r.fix}`);
  assert.match(r.fix, /^cd ".*" && /);
});

test('dependency check: every declared dependency is imported, and a healthy install passes', async () => {
  const seen = [];
  const importer = async (id) => { seen.push(id); };
  const r = await checkDependencies({ manifest: { dependencies: { zeta: '1', alpha: '1' } }, importer });
  assert.deepEqual(r, { ok: true, name: 'dependencies' });
  assert.deepEqual(seen, ['alpha', 'zeta']);
});

test('dependency check: a package.json that cannot be read is a failure, not a crash', async () => {
  const r = await checkDependencies({ root: join(ROOT, 'no-such-folder') });
  assert.equal(r.ok, false);
  assert.match(r.problem, /cannot read/);
  assert.match(r.fix, /npm ci/);
});

test('dependency check: the real install passes', async () => {
  const r = await checkDependencies();
  assert.deepEqual(r, { ok: true, name: 'dependencies' });
});

test('node check: below the floor fails and names the floor and a way out', () => {
  const r = checkNode('20.20.2');
  assert.equal(r.ok, false);
  assert.equal(r.name, 'node');
  assert.match(r.problem, new RegExp(MIN_NODE.replace(/\./g, '\\.')));
  assert.match(r.problem, /20\.20\.2/);
  assert.match(r.fix, /node@/);
  assert.deepEqual(checkNode('22.13.0'), { ok: true, name: 'node' });
});

test('browser check: no browser fails with the playwright install fix; a launch is closed', async () => {
  const missing = await checkBrowser({ launch: async () => null });
  assert.equal(missing.ok, false);
  assert.equal(missing.name, 'browser');
  assert.match(missing.fix, /npx playwright install chromium-headless-shell/);
  assert.ok(missing.fix.includes(ROOT), `fix must name ${ROOT}: ${missing.fix}`);

  let closed = 0;
  const ok = await checkBrowser({ launch: async () => ({ close: async () => { closed++; } }) });
  assert.deepEqual(ok, { ok: true, name: 'browser' });
  assert.equal(closed, 1, 'the launched browser must be closed');

  // A launch that throws is a failure too, not an unhandled rejection.
  const threw = await checkBrowser({ launch: async () => { throw new Error('spawn ENOENT'); } });
  assert.equal(threw.ok, false);
});

test('formatter: one ✓ line, or one ✗ line carrying the problem and the fix', () => {
  assert.equal(formatResult({ ok: true, name: 'node' }), '✓ node');
  assert.equal(
    formatResult({ ok: false, name: 'browser', problem: 'no headless browser could be launched', fix: 'npx playwright install chromium-headless-shell' }),
    '✗ browser: no headless browser could be launched → fix: npx playwright install chromium-headless-shell',
  );
});

test('exit code: 0 only when every check passes', () => {
  assert.equal(exitCode([{ ok: true }, { ok: true }]), 0);
  assert.equal(exitCode([{ ok: true }, { ok: false }]), 1);
  assert.equal(exitCode([{ ok: false }, { ok: false }]), 1);
  assert.equal(exitCode([]), 0);
});

test('run: one line per check, in order, and exit 1 when one fails', async () => {
  const lines = [];
  const before = process.exitCode;
  try {
    const results = await run([], {
      checks: [
        async () => ({ ok: true, name: 'node' }),
        async () => ({ ok: false, name: 'browser', problem: 'no browser', fix: 'npx playwright install chromium' }),
      ],
      log: (line) => lines.push(line),
    });
    assert.equal(results.length, 2);
    assert.deepEqual(lines, ['✓ node', '✗ browser: no browser → fix: npx playwright install chromium']);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = before;
  }

  const allPass = [];
  await run([], { checks: [async () => ({ ok: true, name: 'node' })], log: (line) => allPass.push(line) });
  assert.deepEqual(allPass, ['✓ node']);
  assert.equal(process.exitCode, 0);
  process.exitCode = before;
});

test('run: an unknown argument is refused rather than ignored', async () => {
  await assert.rejects(() => run(['--fix']), /takes no options/);
});

// The command has to be reachable from the CLI, and its own help has to be its help.
test('CLI: --help lists doctor and doctor --help prints it', () => {
  const bin = join(ROOT, 'bin', 'lykeion.mjs');
  const top = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' });
  assert.equal(top.status, 0, top.stderr);
  assert.match(top.stdout, /^ {2}doctor\s+\S/m);

  const own = spawnSync(process.execPath, [bin, 'doctor', '--help'], { encoding: 'utf8' });
  assert.equal(own.status, 0, own.stderr);
  assert.equal(own.stdout.trim(), help.trim());
});
