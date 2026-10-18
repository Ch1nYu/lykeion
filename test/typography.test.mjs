import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cssFiles = async () => {
  const labs = (await readdir(join(ROOT, 'labs'), { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => `labs/${d.name}/lab.css`);
  const present = [];
  for (const f of labs) { try { await readFile(join(ROOT, f), 'utf8'); present.push(f); } catch { /* a Lab without CSS is fine */ } }
  return ['runtime/base.css', ...present];
};

// A1: three text tokens plus one maths token. A fourth text family sneaking in (a hand-written face,
// a mono used for numbers) is exactly the drift this guards. `--f-math` is allowed, but only in a rule
// whose selector is `math` itself, so it cannot leak into UI text.
test('every font-family in base.css and labs/*/lab.css is one of the three font tokens (or --f-math on math)', async () => {
  const allowed = new Set(['var(--f-display)', 'var(--f-body)', 'var(--f-mono)']);
  const offenders = [];
  for (const file of await cssFiles()) {
    const css = (await readFile(join(ROOT, file), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim().replace(/\s+/g, ' ');
      const line = css.slice(0, rule.index).split('\n').length;
      for (const m of rule[2].matchAll(/font-family\s*:\s*([^;}]+)/g)) {
        const value = m[1].trim();
        // `inherit` keeps a nested element on its parent's face; it introduces no new family.
        if (value === 'inherit') continue;
        if (value === 'var(--f-math)') {
          if (selector !== 'math') offenders.push(`${file}:${line} --f-math outside a math rule (selector: ${selector})`);
          continue;
        }
        if (!allowed.has(value)) offenders.push(`${file}:${line} font-family:${value}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `font-family must be one of --f-display, --f-body, --f-mono (--f-math only on math):\n  ${offenders.join('\n  ')}`);
});

test('the font tokens are --f-display, --f-body, --f-mono and --f-math, and no hand-written face survives', async () => {
  const base = await readFile(join(ROOT, 'runtime/base.css'), 'utf8');
  const tokens = [...base.matchAll(/(--f-[a-z-]+)\s*:/g)].map((m) => m[1]);
  assert.deepEqual(tokens.sort(), ['--f-body', '--f-display', '--f-math', '--f-mono']);
  assert.doesNotMatch(base, /LXGW|WenKai|--f-hand/);
});

test('the maths face is applied to math elements, so stretched delimiters stay stretched', async () => {
  const base = await readFile(join(ROOT, 'runtime/base.css'), 'utf8').then((s) => s.replace(/\/\*[\s\S]*?\*\//g, ''));
  const rules = [...base.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /font-family\s*:\s*var\(--f-math\)/.test(m[2]));
  assert.equal(rules.length, 1, 'exactly one rule sets --f-math');
  assert.equal(rules[0][1].trim(), 'math');
});

test('--f-mono is used only for code: pre, code, kbd and the code listing bar', async () => {
  const base = await readFile(join(ROOT, 'runtime/base.css'), 'utf8').then((s) => s.replace(/\/\*[\s\S]*?\*\//g, ''));
  // Every rule that sets --f-mono, with its selector.
  const rules = [...base.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /font-family\s*:\s*var\(--f-mono\)/.test(m[2]));
  const selectors = rules.flatMap((m) => m[1].split(',').map((s) => s.trim()));
  const codeOnly = /^(code|pre|kbd|\.code-lang|\.code pre|\.code pre code|\.code-bar)$/;
  const stray = selectors.filter((s) => !codeOnly.test(s));
  assert.deepEqual(stray, [], `--f-mono outside code: ${stray.join(', ')}`);
});

test('the Google Fonts link asks for the three families the tokens name, and nothing else', async () => {
  const shell = await readFile(join(ROOT, 'runtime/shell.html'), 'utf8');
  const href = /<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/.exec(shell)?.[0] || '';
  const families = [...decodeURIComponent(href).matchAll(/family=([^&:"']+)/g)].map((m) => m[1].replace(/\+/g, ' ')).sort();
  assert.deepEqual(families, ['JetBrains Mono', 'Noto Sans TC', 'Noto Serif TC']);
});

// A1 rhythm: the measure and the two spacing tokens are what makes prose readable at any width.
test('prose uses the measure and the spacing tokens', async () => {
  const base = await readFile(join(ROOT, 'runtime/base.css'), 'utf8');
  assert.match(base, /--measure:\s*34em/);
  assert.match(base, /--gap-sec:\s*(\d+)px/);
  assert.match(base, /--gap-block:\s*40px/);
  // Every declaration, not just the first: a mobile override used to drop this to 72px.
  const gapSecs = [...base.matchAll(/--gap-sec:\s*(\d+)px/g)].map((m) => Number(m[1]));
  for (const gapSec of gapSecs) assert.ok(gapSec >= 96 && gapSec <= 112, `--gap-sec is ${gapSec}px, expected 96–112px`);
  // The measure is applied to prose paragraphs (the prose column itself stays a little wider so
  // tables, Lab cards and listings are not clipped to 34em).
  assert.match(base, /^p\{[^}]*max-width:\s*var\(--measure\)/m);
  assert.match(base, /body\{[^}]*line-height:\s*1\.9/);
});

// A8: the stacked-variant grid, so changing text never changes the box height.
test('.stack keeps every variant in one grid cell with only one visible', async () => {
  const base = await readFile(join(ROOT, 'runtime/base.css'), 'utf8');
  assert.match(base, /\.stack\{display:grid\}/);
  assert.match(base, /\.stack > \*\{grid-area:1\/1; visibility:hidden\}/);
  assert.match(base, /\.stack > \.on\{visibility:visible\}/);
});

// A9: the focus ring belongs to the keyboard, not to the mouse.
test('focus rings are limited to :focus-visible', async () => {
  const base = await readFile(join(ROOT, 'runtime/base.css'), 'utf8');
  assert.match(base, /:focus\{outline:none\}/);
  assert.match(base, /:focus-visible\{outline:3px solid var\(--accent\)/);
  assert.doesNotMatch(base, /(?<!-visible):focus\{outline:(?!none)/);
});
