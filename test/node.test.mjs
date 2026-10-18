import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tooOld, nodeFloorMessage, MIN_NODE } from '../src/node.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// pdfjs-dist needs Promise.withResolvers, which Node 20 does not have: on 20.20.2 `lykeion init`
// died with "Promise.withResolvers is not a function". The floor is its declared engine, 22.13.
test('tooOld: 22.13.0 and everything above it is supported', () => {
  for (const v of ['22.13.0', '22.13.1', '22.20.2', '23.0.0', '24.0.0', '24.18.0', '100.0.0']) {
    assert.equal(tooOld(v), null, `${v} must pass`);
  }
});

test('tooOld: anything below 22.13 is refused', () => {
  for (const v of ['20.20.2', '22.12.9', '22.9.0', '21.7.3', '18.20.4', '8.9.4']) {
    assert.equal(tooOld(v), v, `${v} must be refused`);
  }
});

// A nightly reports "24.0.0-nightly20240101..." or "22.13.0-rc.1"; the suffix must not decide.
test('tooOld: a prerelease suffix is ignored, only the numbers count', () => {
  assert.equal(tooOld('22.13.0-rc.1'), null);
  assert.equal(tooOld('22.12.0-rc.1'), '22.12.0-rc.1');
});

// The check exists to catch an old Node, not to police version strings: if it cannot be parsed,
// start anyway rather than block a working install behind a message nobody can act on.
test('tooOld: an unparseable version is not treated as old', () => {
  for (const v of ['', 'node', 'unreleased', undefined]) {
    assert.equal(tooOld(v), null, `${String(v)} must not block`);
  }
});

// The one line a user on an old Node ever sees: both versions, and something to do about it.
test('nodeFloorMessage names the floor, the running version and a way out', () => {
  const msg = nodeFloorMessage(tooOld('20.20.2'));
  assert.match(msg, /needs Node 22\.13 or newer \(this is 20\.20\.2\)/);
  assert.match(msg, /Install a current LTS/);
});

test('the CLI starts on this Node and prints its usage', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'lykeion.mjs'), '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /usage: lykeion <command>/);
});

// The floor is declared twice — package.json for npm, MIN_NODE for the startup check — and npm is
// the one users and `npm install` read. Drift would either block a supported Node or let an
// unsupported one through to "Promise.withResolvers is not a function". The lockfile entry is npm's
// copy of package.json's engines, so it is a tripwire for a stale committed lockfile.
test('package.json declares the same Node floor the startup check enforces', async () => {
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.engines.node, `>=${MIN_NODE}`);
  const lock = JSON.parse(await readFile(join(ROOT, 'package-lock.json'), 'utf8'));
  assert.equal(lock.packages[''].engines.node, `>=${MIN_NODE}`);
});
