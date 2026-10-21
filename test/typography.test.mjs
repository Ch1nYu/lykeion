import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../src/build.mjs';
import { launchBrowser, routeLocal, LOCAL_ORIGIN } from '../src/browser.mjs';

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

// A10: a box that scrolls sideways has to say so. Nothing in the markup told the reader that a table
// or a formula continued past the edge, so the last column and the right-hand side of an equation
// looked like the end of the content. The runtime marks the sides that hold hidden content with
// `data-overflow`, and CSS draws the fade from that attribute — so a measurement taken right after
// `Lykeion.show` has to see the attribute already, not on the next frame.
test('a box that scrolls sideways is marked data-overflow, and cleared when it fits', async (t) => {
  const browser = await launchBrowser();
  if (!browser) return t.skip('no browser available');
  try {
    const dir = await mkdtemp(join(tmpdir(), 'lykeion-overflow-'));
    await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Overflow probe', output: 'probe.html', scope: [] }));
    await mkdir(join(dir, 'content'), { recursive: true });
    // A table far wider than 375px in one chapter, a table that fits in the other: the same runtime has
    // to mark the first and leave the second alone.
    // A cell that cannot wrap: `table-layout:auto` sizes the column to its longest word, so a long
    // unbreakable token is what pushes a table past the phone's width.
    const wide = 'SplitINFO_GainRATIO_Defaulted_0123456789_ABCDEFGHIJ';
    await writeFile(join(dir, 'content', '01-wide.md'), `---\nchapter: 1\ntitle: Wide\nshort: wide\nsource: sample.pdf\n---\n\n## 1.1 A wide table {pages=1}\n\n| SplitINFO | GainRATIO | 備註 |\n|---|---|---|\n| 0.029 | 0.41 | ${wide} |\n`);
    await writeFile(join(dir, 'content', '02-narrow.md'), `---\nchapter: 2\ntitle: Narrow\nshort: narrow\nsource: sample.pdf\n---\n\n## 2.1 A table that fits {pages=1}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n`);
    await build(dir);

    const htmlPath = join(dir, 'probe.html');
    const page = await browser.newPage({ viewport: { width: 375, height: 760 } });
    try {
      await page.route(/^https?:\/\/(?!lykeion\.local)/, (route) => route.abort());
      await routeLocal(page, (path) => (path === '/probe.html' ? htmlPath : null));
      await page.goto(`${LOCAL_ORIGIN}/probe.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.Lykeion && window.Lykeion.views().length > 0);

      // `show` is synchronous, so the attribute must be right the moment it returns — that is what a
      // gate measuring 30ms later depends on.
      const wide = await page.evaluate(() => {
        window.Lykeion.show('ch1', { noScroll: true });
        const box = document.querySelector('#ch1 .tablewrap');
        return { attr: box.getAttribute('data-overflow'), tab: box.getAttribute('tabindex') };
      });
      assert.equal(wide.attr, 'end', `the wide table is marked: content is hidden past the right edge (got ${wide.attr})`);
      assert.equal(wide.tab, '0', 'a box the reader can scroll is reachable from the keyboard');

      const narrow = await page.evaluate(() => {
        window.Lykeion.show('ch2', { noScroll: true });
        const box = document.querySelector('#ch2 .tablewrap');
        return { attr: box.getAttribute('data-overflow'), tab: box.getAttribute('tabindex') };
      });
      assert.equal(narrow.attr, null, 'a table that fits carries no cue');
      assert.equal(narrow.tab, null, 'and is not turned into a tab stop');

      // Scrolling to the end moves the cue to the other side: what is hidden is now behind you.
      const scrolled = await page.evaluate(async () => {
        window.Lykeion.show('ch1', { noScroll: true });
        const box = document.querySelector('#ch1 .tablewrap');
        box.scrollLeft = box.scrollWidth;
        await new Promise((r) => setTimeout(r, 120));
        return box.getAttribute('data-overflow');
      });
      assert.equal(scrolled, 'start', `scrolled to the end, only the start is hidden (got ${scrolled})`);

      // The CSS draws the fade from the attribute, so the rule and the stylesheet cannot drift apart.
      const base = await readFile(join(ROOT, 'runtime/base.css'), 'utf8');
      assert.match(base, /\[data-overflow[~="]?\s*"?[^\]]*\]/, 'base.css draws the cue from data-overflow');
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

// A11: `data-overflow` alone does not tell the reader anything — the fade is what they see. The cue
// rules (0,1,0) are matched by each box's own `background` shorthand, which comes later in the file
// and resets background-image to none, so `.calc` was marked and painted nothing: the gate saw a cued
// box and passed a reader who could not tell the content was cut. Every scroller must actually paint
// the gradient, and its own background-color must survive.
test('every box that scrolls sideways actually paints the fade, whatever its own background', async (t) => {
  const browser = await launchBrowser();
  if (!browser) return t.skip('no browser available');
  try {
    const dir = await mkdtemp(join(tmpdir(), 'lykeion-fade-'));
    await writeFile(join(dir, 'lykeion.json'), JSON.stringify({ title: 'Fade probe', output: 'probe.html', scope: [] }));
    await mkdir(join(dir, 'content'), { recursive: true });
    // One unbreakable token is what makes a box overflow: `table-layout:auto` and `overflow-x:auto`
    // both size to the longest word, so a long run with no spaces is the honest way to force it.
    const wide = 'SplitINFO_GainRATIO_Defaulted_0123456789_ABCDEFGHIJ';
    await writeFile(join(dir, 'content', '01-wide.md'), [
      '---', 'chapter: 1', 'title: Wide', 'short: wide', 'source: sample.pdf', '---', '',
      '## 1.1 A wide table {pages=1}', '',
      '| SplitINFO | GainRATIO | 備註 |', '|---|---|---|', `| 0.029 | 0.41 | ${wide} |`, '',
      '## 1.2 A wide formula {pages=1}', '',
      `$$${wide}$$`, '',
      '## 1.3 A wide listing {pages=1}', '',
      '```python', `x = "${wide}"`, '```', '',
    ].join('\n'));
    await build(dir);

    const htmlPath = join(dir, 'probe.html');
    const page = await browser.newPage({ viewport: { width: 375, height: 760 } });
    try {
      await page.route(/^https?:\/\/(?!lykeion\.local)/, (route) => route.abort());
      await routeLocal(page, (path) => (path === '/probe.html' ? htmlPath : null));
      await page.goto(`${LOCAL_ORIGIN}/probe.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.Lykeion && window.Lykeion.views().length > 0);

      const boxes = await page.evaluate(async (wide) => {
        window.Lykeion.show('ch1', { noScroll: true });
        // Nothing in the builder emits a `.calc` box (the fence of that name only records checks), but
        // the stylesheet and the runtime both list it as a scroller, so it is the one box that could
        // regress unseen. It is injected here so the stylesheet is tested on the box it names.
        const sheet = document.querySelector('main .sheet');
        const calc = document.createElement('div');
        calc.className = 'calc';
        calc.textContent = wide;
        sheet.appendChild(calc);
        // The runtime marks a box on a scroll of that box (its document-level capture listener), which
        // is the path a Lab's own scrolling content takes. A box added after load is marked the same way.
        calc.dispatchEvent(new Event('scroll', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 100));
        const SEL = '.tablewrap,.formula,.calc,.vizwrap,.trail,pre';
        return [...document.querySelectorAll(SEL)].map((el) => {
          const cs = getComputedStyle(el);
          return {
            el: el.tagName.toLowerCase() + (String(el.className || '').split(/\s+/)[0] ? `.${String(el.className).split(/\s+/)[0]}` : ''),
            attr: el.getAttribute('data-overflow'),
            image: cs.backgroundImage,
            repeat: cs.backgroundRepeat,
            colour: cs.backgroundColor,
            hidden: el.scrollWidth - el.clientWidth,
          };
        }).filter((b) => b.hidden > 1);
      }, wide);
      assert.ok(boxes.length >= 4, `the probe has overflowing boxes to check (got ${boxes.length})`);
      // The probe is worthless if it silently stops covering the box that regressed.
      assert.ok(boxes.some((b) => b.el === 'div.calc'), `the .calc box is among them (got ${boxes.map((b) => b.el).join(', ')})`);

      const unpainted = boxes.filter((b) => !b.attr || !b.image.includes('gradient')).map((b) => `${b.el} attr=${b.attr} image=${b.image}`);
      assert.deepEqual(unpainted, [], `every overflowing box paints the fade:\n  ${unpainted.join('\n  ')}`);

      // The fade is a background LAYER: a box that paints a card must still paint it under the cue, or
      // the fade would have repainted the card. Only the boxes that own a background are checked —
      // `.tablewrap` and `.vizwrap` are transparent wrappers on purpose, and stay transparent.
      // `pre` inside `.code` is deliberately transparent: the card is painted by `.code` around it, so
      // the cue layer lands on the box that actually holds the colour.
      const CARDED = new Set(['div.formula', 'div.calc']);
      const lost = boxes.filter((b) => CARDED.has(b.el) && b.colour === 'rgba(0, 0, 0, 0)').map((b) => b.el);
      assert.deepEqual(lost, [], `a carded box keeps its own background-color under the fade:\n  ${lost.join(', ')}`);
      const painted = boxes.filter((b) => !CARDED.has(b.el) && b.colour !== 'rgba(0, 0, 0, 0)').map((b) => b.el);
      assert.deepEqual(painted, [], `and the cue gives a transparent wrapper no colour:\n  ${painted.join(', ')}`);

      // `background-repeat` is folded into the cue rules; `repeat` would tile a 38px fade across the box.
      const tiled = boxes.filter((b) => b.repeat !== 'no-repeat').map((b) => `${b.el} repeat=${b.repeat}`);
      assert.deepEqual(tiled, [], `the fade is one 38px layer, not a tile:\n  ${tiled.join('\n  ')}`);
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

// A12: the runtime marks the boxes and the gate reads the marks, so the two have to agree on WHICH
// boxes those are. They drifted: the runtime also listed `.lab .scroll` and `.lab table`, and no
// `.scroll` class exists anywhere in the repo while a <table> is not a scroll container — so the
// runtime could paint a fade and add a tab stop to a box that cannot scroll, and the gate would never
// see it because it looks at its own list. One list per side is not reachable across the inlining
// boundary (the runtime is string-inlined into the built page), so the lists are asserted equal.
test('the runtime and the visual gate watch the same set of scroll boxes', async () => {
  const read = async (f) => readFile(join(ROOT, f), 'utf8');
  const runtime = await read('runtime/runtime.js');
  const visual = await read('src/visual.mjs');
  const list = (src, name) => {
    const m = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*'([^']+)'`).exec(src);
    assert.ok(m, `${name} is declared`);
    return m[1].split(',').map((s) => s.trim()).sort();
  };
  // Several probes declare a `SEL`; the scroll-box one is the selector that names the watched boxes,
  // so it is found by its content rather than by being the first match in the file.
  const scrollers = list(runtime, 'SCROLLERS');
  const sel = [...visual.matchAll(/(?:const|let|var)\s+SEL\s*=\s*'([^']+)'/g)]
    .map((m) => m[1].split(',').map((s) => s.trim()).sort())
    .find((s) => s.includes('.tablewrap') && s.includes('.formula'));
  assert.ok(sel, 'the scroll-box selector is declared in src/visual.mjs');
  assert.deepEqual(scrollers, sel, 'the runtime and the gate name the same selectors');

  // And every selector on that list has to be a box something actually emits, or the list is a lie.
  const base = await read('runtime/base.css');
  const missing = scrollers.filter((s) => !base.includes(s));
  assert.deepEqual(missing, [], `every watched selector is styled by base.css:\n  ${missing.join(', ')}`);
  assert.ok(!scrollers.includes('.lab table'), 'a <table> is not a scroll container');
});
