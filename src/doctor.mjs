// `lykeion doctor`: can this install run build and verify, right now? The install broke silently
// twice — playwright-core missing `lib/coreBundle.js` (the build died with an unrelated-looking
// error) and the Chromium headless shell never downloaded (the render gate could not run) — and each
// time the diagnosis cost more turns than the fix. One command, one line per check, and for each
// failure the exact command that repairs it. It reports; it never repairs.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tooOld, nodeFloorMessage, MIN_NODE } from './node.mjs';
import { launchBrowser } from './browser.mjs';

// The skill folder: the fixes have to run where package.json and node_modules are, and doctor is
// invoked from whatever project directory the user happens to be in.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const inRoot = (command) => `cd "${ROOT}" && ${command}`;
const INSTALL_DEPS = inRoot('npm ci');
// A plain headless launch uses Playwright's headless shell; `chromium` is the full build, needed only
// by a launch that names a channel.
const INSTALL_BROWSER = inRoot('npx playwright install chromium-headless-shell');

export const help = `lykeion doctor

Checks that this install can run build and verify:
  node          the version floor (${MIN_NODE})
  dependencies  every package.json dependency's entry imports
  browser       a headless browser launches

Prints "✓ <check>", or "✗ <check>: <problem> → fix: <command>". Exits 1 if any check fails.
Reports only: doctor never installs or repairs anything.`;

// ---------- checks ----------

// The same floor the CLI enforces before it loads a command, with the same sentence: a user who
// reaches doctor on an old Node should not read two different accounts of the problem.
export function checkNode(version = process.versions.node) {
  const old = tooOld(version);
  if (!old) return { ok: true, name: 'node' };
  return { ok: false, name: 'node', problem: nodeFloorMessage(old), fix: 'mise use node@22' };
}

// Importing each entry is the point: a half-installed package resolves fine and only fails when its
// entry pulls in a file that is not there (playwright → playwright-core/lib/coreBundle.js). Checking
// `node_modules/<name>` exists would have passed that install.
//
// `importer` and `manifest` exist so the check can be tested without a broken install.
export async function checkDependencies({ root = ROOT, importer = (id) => import(id), manifest = null } = {}) {
  const fail = (problem) => ({ ok: false, name: 'dependencies', problem, fix: INSTALL_DEPS });
  let pkg = manifest;
  if (!pkg) {
    try {
      pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    } catch (err) {
      return fail(`cannot read ${join(root, 'package.json')} (${firstLine(err)})`);
    }
  }
  const names = Object.keys(pkg.dependencies ?? {}).sort();
  for (const name of names) {
    try {
      await quietly(() => importer(name));
    } catch (err) {
      return fail(`${name} does not import (${firstLine(err)})`);
    }
  }
  return { ok: true, name: 'dependencies' };
}

// The render gate and shots both need a browser and both skip (loudly) without one, so a missing
// download only surfaces as a gate that did not run. Launch it, close it, say whether it worked.
// `launch` exists so the check can be tested without a browser.
export async function checkBrowser({ launch = launchBrowser } = {}) {
  let browser = null;
  try {
    browser = await launch();
  } catch {
    browser = null;
  }
  if (!browser) {
    return {
      ok: false,
      name: 'browser',
      problem: 'neither system Chrome nor Playwright Chromium could be launched',
      fix: INSTALL_BROWSER,
    };
  }
  try {
    await browser.close();
  } catch {
    // A browser that launched has done its job; a close that throws does not un-prove it.
  }
  return { ok: true, name: 'browser' };
}

// ---------- output ----------

export function formatResult(result) {
  return result.ok ? `✓ ${result.name}` : `✗ ${result.name}: ${result.problem} → fix: ${result.fix}`;
}

export function exitCode(results) {
  return results.every((r) => r.ok) ? 0 : 1;
}

// ---------- run ----------

const CHECKS = [checkNode, checkDependencies, checkBrowser];

// `checks` and `log` exist so the whole command can be tested without a real install.
export async function run(args = [], { checks = CHECKS, log = console.log } = {}) {
  if (args.length) throw new Error(`doctor takes no options (got ${args.join(' ')})`);
  const results = [];
  for (const check of checks) results.push(await check());
  for (const result of results) log(formatResult(result));
  process.exitCode = exitCode(results);
  return results;
}

// ---------- helpers ----------

const firstLine = (err) => String(err?.message ?? err).split('\n')[0].trim();

// pdfjs-dist's entry warns "Please use the `legacy` build in Node.js environments" on every import,
// but the repo already made that choice (extract.mjs loads the legacy build). Doctor's output is one
// line per check, so keep a dependency's advice out of it; anything a check needs to say, it says.
async function quietly(fn) {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = warn;
  }
}
