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

// A2: one type scale. Small text used to be set with ad-hoc values (.7/.72/.74/.76/.78/.8/.82/.85/.86
// /.88/.9/.92/.95/.98rem and 1.02/1.05/1.08/1.1/1.12rem), so a chapter showed seven sizes and three
// of them (15.7/16.3/17.3px) differed by under 2px — drift that reads as a mistake, not as a scale.
// Every font-size is now a --fs token. The exceptions are sizes that are relative on purpose (em for
// code, maths and Latin words, which must follow the text around them) and the two labels inside an
// SVG chart, which are sized in px because they sit in the chart's own coordinate space.
test('every font-size in base.css is a --fs token, apart from relative code/maths sizes and SVG chart labels', async () => {
  // Sizes that are relative on purpose: they must follow the text around them, so they carry no step
  // of their own. Keyed by selector because the maths reset is written as one rule for three areas.
  const relative = new Map([
    ['.en', ['.9em']],
    ['code', ['.86em']],
    ['math:not([display="block"])', ['.94em']],
    ['.code pre code', ['1em']],
    ['.nav math', ['1em']],
    ['.topbar math', ['1em']],
    ['.pager math', ['1em']],
    ['svg .tick', ['11px']],
    ['.ring text', ['15px']],
  ]);
  const offenders = [];
  const css = (await readFile(join(ROOT, 'runtime/base.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = rule[1].trim().replace(/\s+/g, ' ').split(',').map((s) => s.trim());
    const line = css.slice(0, rule.index).split('\n').length;
    for (const m of rule[2].matchAll(/font-size\s*:\s*([^;}]+)/g)) {
      const value = m[1].trim();
      if (/^var\(--fs-[a-z0-9-]+\)$/.test(value)) continue;
      // `inherit` takes the size of the text around it; it introduces no new step.
      if (value === 'inherit') continue;
      if (selectors.every((s) => relative.get(s)?.includes(value))) continue;
      offenders.push(`${line} ${selectors.join(',')} font-size:${value}`);
    }
  }
  assert.deepEqual(offenders, [], `font-size must come from a --fs token:\n  ${offenders.join('\n  ')}`);
});

// The scale itself: three small steps below body text, body, the three heading sizes that were already
// tokens, and the four display sizes the page actually uses (chapter title, chapter number, quiz title
// and the result stars). A fourth small step reappearing is the drift the test above catches; a token
// with no rule using it is the same drift from the other side.
test('the type scale is three small steps, body, the headings and the display sizes — and each is used', async () => {
  const base = await readFile(join(ROOT, 'runtime/base.css'), 'utf8');
  const declared = [...new Set([...base.matchAll(/(--fs-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))].sort();
  assert.deepEqual(declared, [
    '--fs-body',
    '--fs-ch',
    '--fs-h1',
    '--fs-h2',
    '--fs-h3',
    '--fs-lg',
    '--fs-md',
    '--fs-sm',
    '--fs-stars',
    '--fs-title',
    '--fs-xs',
  ]);
  const unused = declared.filter((t) => !base.includes(`var(${t})`));
  assert.deepEqual(unused, [], `every size token is used by a rule: ${unused.join(', ')}`);
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
