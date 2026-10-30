# Content format

A Lecture Site project is a directory:

```
<project>/
├── lykeion.json        # project settings
├── math.js             # optional project-local maths helpers (LykeionMath.extend)
├── content/*.md        # one file per chapter, built in file-name order
└── labs/<type>/lab.js  # optional project-local custom Lab types (+ lab.css)
```

`lykeion build <project>` turns it into one HTML file plus `checks.json` (input for `lykeion verify`).
Any error below fails the build; nothing broken is silently rendered.

## lykeion.json

```json
{
  "title": "機率與統計講堂",
  "description": "One sentence for the page meta description.",
  "eyebrow": "Probability · Statistics",
  "lang": "zh-Hant-TW",
  "palette": "desk-teal",
  "depth": "standard",
  "output": "機率與統計講堂.html",
  "hero": { "title": "把公式<em>算給你看</em>的一頁講堂", "intro": "One paragraph." },
  "levels": { "條件機率": "條件機率、獨立性與貝氏定理" },
  "scope": [{ "file": "sample.pdf", "pages": "1-4" }],
  "references": ["Ross, *A First Course in Probability*, 10th ed."]
}
```

- `palette` must be in the Palette Library (`lykeion palette list`).
- `hero.title` may contain `<em>` for the highlighter sweep.
- `levels` gives each Quiz Level a subtitle; keys are level titles used in quiz blocks.
- `scope` is what `verify` checks coverage against; `file` matches a chapter's `source`.
- `scope[].exclude` lists the pages the scope leaves out on purpose, each with its reason: `"exclude": [{ "pages": "1-3", "reason": "AI 發展史，不屬核心邏輯" }]`. Excluded pages are not required for coverage; `verify` lists them as "excluded on purpose" with the reason. A section that cites an excluded page fails, an exclusion without a reason fails, and an excluded page must lie inside the scope's `pages`. `init` does not write it; the Outline proposes it (see `references/outline.md`).
- `teaching` overrides the teaching rules (`references/teaching-rules.json`) and extends the style lexicon (`references/style-lexicon.json`) for this project; see [Teaching rules](#teaching-rules).

## Chapter file

```markdown
---
chapter: 3                      # number shown as "03"
title: 條件機率與貝氏定理      # chapter heading
short: 條件機率                 # sidebar and table-of-contents label (default: title)
subtitle: Conditional Probability and Bayes' Theorem
summary: 條件機率、獨立性與貝氏定理的三種寫法   # table-of-contents blurb
source: sample.pdf                                 # Primary Source file of this chapter
---

Optional chapter introduction (before the first section).

## 3.1 條件機率與獨立性 {pages=1-2}

Section body in Markdown.
```

- A section starts with `## <number> <title> {pages=a-b}`. `pages` is required for coverage; use `pages=7` for one page, `pages=3-5,9` for several ranges.
- Section ids are `s<number>` with dots as dashes (`s3-1`); override with `{id=my-id}`.
- Use `###`/`####` freely inside a section; only `##` starts a section. A heading without an id gets `<section-id>-<n>` (`s3-1-1`, `s3-1-2`, …) and the sidebar lists it under the section, so the reader can jump straight to a question or an idea. A heading that already carries an id (raw `<h3 id="…">`) keeps it.
- Raw HTML is allowed for things Markdown lacks: `<mark>` (highlight), `<span class="en">` (English gloss), `<div class="grid2">`.
- `**bold**` and `*italic*` close correctly against Chinese punctuation and letters (`**向量嵌入（Vector Embeddings）**是…`), which standard Markdown would leave literal. A `**` or `__` that still survives rendering is a build error, so a typo cannot ship as visible asterisks.

## Maths

- Inline `$…$`, display `$$…$$` (may span lines). TeX is rendered to MathML at build time by KaTeX.
- A closing `$` followed by a digit is not a delimiter, so prices like `$5` are safe; write `\$` for a literal dollar inside maths.
- Write TeX exactly as in a `.tex` file — never escape backslashes (`\frac`, not `\\frac`).
- A display formula with a corner label:

  ````markdown
  ```formula BAYES
  P(A \mid B) = \frac{P(A \cap B)}{P(B)}
  ```
  ````

- A formula the reader should be able to take apart, one piece at a time — the form for any key formula:

  ````markdown
  ```formula GINI
  tex: '\mathrm{Gini} = 1 - \sum_{i} p_{i}^{2}'
  parts:
    - { tex: '\mathrm{Gini}', say: '左邊是我們要的純度指標。' }
    - { tex: '=' }
    - { tex: '1 - \sum_{i}', say: '一減掉每一類機率的平方和：越集中，平方和越大，Gini 越小。' }
    - { tex: 'p_{i}^{2}', say: '求和的每一項是某一類的機率平方，把它們全部加起來。' }
  hint: 點每一段看它在做什麼
  ```
  ````

  Each part with a `say` becomes a button; pressing it shows that one explanation in a fixed-height area under the formula, and the first explained part is already selected. Parts without a `say` are rendered but not clickable (use them for operators and spacing). `hint` is optional prose under the card. Single-quoted YAML scalars keep TeX literal (`tex: '\frac{P(A)}{P(B)}'`); in a double-quoted scalar every backslash must be doubled (`tex: "\\frac{P(A)}{P(B)}"`), because YAML reads `\f` as an escape.

A fraction is a part too. Its numerator and denominator are lists of parts of their own, laid out as a real stacked fraction, so a `\frac` can be taken apart without splitting it into a slash:

````markdown
```formula BAYES
tex: 'P(A \mid B) = \frac{P(A \cap B)}{P(B)}'
parts:
  - { tex: 'P(A \mid B) =' }
  - frac:
      num: [ { tex: 'P(A \cap B)', say: '分子：A 和 B 同時發生的機率。' } ]
      den: [ { tex: 'P(B)', say: '分母：已知 B 發生，只在 B 的世界裡算比例。' } ]
    say: '整個分數：在 B 發生的情況下，A 也發生的比例。'   # optional
```
````

- `num` and `den` take the same items as top-level `parts` (a string or `{tex, say}`), and may contain a `frac` themselves.
- The fraction's own `say` is optional. It is the target on the fraction bar, and it becomes one more explanation in the same area. Each numerator, denominator and bar is a button when it has a `say`.
- The spelling rule counts a fraction as `\frac{` + numerator + `}{` + denominator + `}`, whitespace removed. `\dfrac` and `\tfrac` in `tex` are accepted as the same fraction. A mismatch is reported in the same words as any other: what the parts spell against what `tex` is.
- `formulaParts.maxPartShare` applies to clickable leaf pieces only. When a fraction has a `say` inside its numerator or denominator, the fraction itself is not measured: its pieces are, one by one, and its own `say` does not make it oversized. When neither `num` nor `den` contains a `say`, the whole fraction is measured as one piece, with or without its own `say`, so wrapping a whole formula in one unexplained fraction still fails the share rule.
- `formulaParts.minExplained` counts every `say`, the fraction's own included.

The build rejects a parts formula whose pieces, joined with whitespace removed, do not spell `tex`, one with fewer than `formulaParts.minExplained` explained parts, a clickable piece longer than `formulaParts.maxPartShare` of the whole `tex` (whitespace removed; default 0.5, so no single explained piece may be more than half the formula), and any piece that is not valid TeX — so a breakdown can never drift from the formula it explains.

- Maths in a heading (`## 3.1 縮放用 $\sqrt{d_k}$`, `### 除以 $\sqrt{d_k}$`) reaches the sidebar, the top bar and the pager as rendered maths: a label copies the heading's markup, not its text, so the TeX source never appears next to the marks. The plain-text label the runtime keeps for toasts and `Lykeion.views()` flattens the formula to marks (`√(dk)`), never `dk\sqrt{d_k}`.
- A number is not a formula: `$0.5$` inherits the maths face and baseline and reads as a word from another language, so write numbers as text and keep `$…$` for expressions. The `teaching` gate enforces this (`numericMath`), and also fails maths typed as plain text (`√d_k`, `\sqrt`, `x^2`, `QKᵀ`, `x_{i}`) — `plainMath`.
- Inline maths that is much taller than its line would stretch line boxes and break the reading rhythm, so `.prose math` is set at `font-size:.92em` with `line-height:1` and the line box keeps its pitch. The render gate measures it (`inline maths` check).

## Code listings

A plain fenced block (any info string that does not name a block below) is a runnable code listing.
Name the language first, then an optional `title="…"` caption; anything else in the info string is ignored:

````markdown
```python from="example" title="示範：二項 pmf，公平硬幣十次中兩次正面"
from math import comb

n, k, p = 10, 2, 0.5
pmf = comb(n, k) * p ** k * (1 - p) ** (n - k)
print(round(pmf, 3))  # 0.044
```
````

- Every listing says where its code comes from with `from="…"`, and the `teaching` gate (`codeSource`) checks the claim:
  - `from="slides"`: the code is on the cited slides. At least half of its distinctive identifiers (Latin words of three or more characters that are not language keywords) must appear in the text of the section's pages (`<project>/pages/<pdf stem>/p-NNN.txt`, found through `pages/index.json`). If the page text is not extracted, the gate reports ⚠ (not checkable), not ✗.
  - `from="<text>"`: a case-insensitive prefix of one of `lykeion.json` `references`, for code taken from a cited book or source.
  - `from="example"`: an illustration the author wrote. Its `title` must contain 「示範」, so the reader sees it is not from the course.
  - No `from` fails the gate.
  - Output blocks (`title="輸出"`) are exempt.
- The block renders `<pre><code class="language-python">` with indentation kept and HTML escaped; a `title` renders as a caption above the block. Unknown attributes (`start=`, `linenos`, …) are ignored.
- The block names below (`quiz`, `lab`, `calc`, `note`, `formula`, `erratum`, `callout`, `analogy`, `takeaway`) always win: ```` ```note title="x" ```` is a note, not a listing.
- There is no syntax highlighting (Lecture Sites work offline): listings use the mono font and Palette tokens in light and dark, scroll horizontally inside their own box on narrow screens, and each gets a keyboard-accessible copy button with a toast.
- A program's printed output goes in a second block labelled as output (```` ```text title="輸出" ````), not inside the code block. Explain the code in the prose around it; do not fold code into prose.

## Blocks

All blocks are fenced code blocks whose info string names the block. YAML blocks must be valid YAML; quote strings that contain `:` or start with special characters.

### `analogy [title]` — the intuition card, before the formalism

````markdown
```analogy 想像一罐糖果
罐子裡有紅糖與藍糖，抽一顆、放回去，再抽一顆。第二次的機率不會因為第一次而改變。
```
````

The title is the first line of the card; the body is Markdown with maths. Put one before a section's first formula and come back to it when the formula arrives.

### `takeaway` — the one sentence worth remembering

````markdown
```takeaway
抽完放回就是獨立；抽完不放回就不是。
```
````

One line, in a block with an accent rule. Use it to close an idea, not to summarise a whole section.

### `note` — handwritten margin note (exam tips, intuition)

````markdown
```note
考前提醒：**獨立與互斥是兩件事**，只有 $P(A \cap B) = P(A)P(B)$ 才叫獨立。
```
````

### `callout [label]` — boxed aside

### `erratum` — where a Reference disagrees with the Primary Source (required `ref`)

````markdown
```erratum
text: 講義寫「事前機率與事後機率永遠不會相同」；只有當 $B$ 與 $A$ 獨立時兩者才會相等。
ref: Ross, *A First Course in Probability*, 10th ed., §3.4
```
````

### `calc` — machine-checked numbers (not rendered)

Every number a worked example states must have a `calc` entry, so `verify` can recompute it.

````markdown
```calc
- { expr: "0.9*0.01 / (0.9*0.01 + 0.1*0.99)", expect: 0.083, note: "posterior P(D|+) from prevalence 0.01" }
- { expr: "C(6,2)", expect: 15, tol: 0 }
```
````

`tol` defaults to 0.0015 (enough for 3-decimal rounding). Expressions are JavaScript using the maths library below.

### `quiz [level]` — questions for the end-of-site quiz (not rendered inline)

````markdown
```quiz 條件機率
- type: num
  q: 若 $P(A \cap B) = 0.2$、$P(B) = 0.4$，$P(A \mid B)$ 是多少？（小數 3 位）
  a: 0.5
  tol: 0.002
  calc: "0.20/0.40"
  ex: $P(A \mid B) = 0.2 / 0.4 = 0.5$。
- q: 已知 $A$ 與 $B$ 獨立，$P(A) = 0.3$、$P(B) = 0.4$，$P(A \cap B)$ 為何？
  o: [0.12, 0.70, 0.58, 無法判斷]
  a: 0
  ex: 獨立時 $P(A \cap B) = P(A)P(B) = 0.12$。
  pages: 2
- q: 二項分布 $B(10, 0.5)$ 的期望值為何？
  o: [5, 2.5, 10, 0.5]
  a: 0
  ex: $E[X] = np = 10 \times 0.5 = 5$。
  sec: "2.1"
```
````

- Questions join the Quiz Level named after `quiz` (default: the chapter's `short` title). Levels appear in order of first use; a chapter gets a "challenge" button for each level it contributes to.
- Choice items: `o` (2–8 options) and `a` = index of the right option. Options are shuffled for the reader, so never write "以上皆是" / "all of the above".
- Number items: `type: num`, numeric `a`, `tol`, and a `calc` expression (required in practice: `verify` flags number items without one).
- `ex` explains why; `pages` overrides the section's pages.- Each item links back to a section. A quiz block usually sits at the end of a chapter, so the block's own section is rarely the one the item tests: write `sec: "1.2"` to name it, or let `pages` infer the section whose page range contains that page. Without either, the item links to the block's section. A `sec` that names no section of this chapter fails the build (`sec "1.2" is in another chapter` when the number exists elsewhere), which catches a copy-pasted question.
- `q`, `o`, `ex` accept inline Markdown and `$…$`.

### `lab <type>` — an interactive Lab (YAML parameters)

Common keys: `tag` (badge, e.g. `LAB A`), `title`, `hint`. Any `text` or `note` value is rendered as inline Markdown with maths.
A `label` is plain text, not maths: write 「向量維度 d」 or 「除以根號 d」, not `d_k` or `√d`. The `plainMath` rule reads every `label` and fails the ones that type maths (a lone letter with digits or subscript digits, such as `x1` or `A₁`, is allowed).
Labs fill the reading column like any other block, so put them at the top level of a section (not inside a list): the build closes the prose around a Lab.

**`slider-calc`** — sliders in, computed readouts out.

```yaml
inputs:
  - { id: pa, label: "P(A|B)", min: 0, max: 1, step: 0.05, value: 0.3, unit: "" }              # slider
  - { id: emp, label: Employed, value: 1, options: [{ value: 1, label: "Yes" }, { value: 0, label: "No" }] }  # categorical buttons
outputs:
  - { label: "P(A∩B)", expr: "pa * 0.4", digits: 3, best: max }   # best: highlight min/max among outputs sharing it
  - { label: 預測, expr: "emp ? 1 : 0", labels: { "1": "Yes", "0": "No" } }   # labels: show text for exact values
bars:
  - { label: "P(A∩B)", expr: "pa * 0.4", max: 0.4 }                      # one-sided: 0..max
  - { label: "偏離獨立", expr: "pa * 0.4 - 0.12", min: -0.12, max: 0.28 }  # signed: centre-zero bar
verdict: [{ when: "pa == 0.3", text: "P(A|B) = P(A)，此時 A 與 B 獨立。" }]   # first true wins
```

A bar with `min < 0` is drawn from a zero line: negative values grow left in the second series colour, positive values grow right, and the number beside it keeps its sign. Use it for any quantity that can be negative (a difference, a dot product, a correlation) instead of wrapping the expression in `abs()`, which makes the bar disagree with the readout.

`active` takes the same kind of expression as `expr` and marks the bar whose expression is truthy for the current inputs: its fill switches to another series colour (the second series colour, or the accent on a negative signed bar, which already fills with the second), its track takes the accent tint and border, and its label and number go accent and underlined (never bold, which could wrap a label). Use it when the bars are a fixed distribution and a slider picks one of them — otherwise every bar looks alike and the reader cannot see the choice:

```yaml
inputs: [{ id: k, label: k, min: 0, max: 10, step: 1, value: 2 }]
bars:
  - { label: "k=0", expr: "binomPmf(10, 0, 0.5)", max: 0.25, active: "k == 0" }
  - { label: "k=1", expr: "binomPmf(10, 1, 0.5)", max: 0.25, active: "k == 1" }
  - { label: "k=2", expr: "binomPmf(10, 2, 0.5)", max: 0.25, active: "k == 2" }
```

Exactly the bars whose `active` is truthy are marked, re-evaluated on every input change; a bar without `active` looks as it always did, and the mark changes no box metric, so the Lab keeps its height as it moves.

**`stepper`** — walk through an algorithm one state at a time.

```yaml
legend: { good: 想算的那一項, bad: 算錯的地方, muted: 這一步先不看, info: 只是分類 }   # optional; each entry needs a chip
steps:
  - label: "(a)"
    text: 盛行率 $P(D) = 0.01$，敏感度 $P(+ \mid D) = 0.9$。
    table: { head: [Tid, Home, Class], rows: [[1, Yes, No], [2, No, No]], highlight: [0] }
    chips: [{ text: "P(+|D)P(D) = 0.009", state: good, note: "真陽" }, { text: "P(+|¬D)P(¬D) = 0.099", state: bad }]   # good | bad | muted | info
```

A chip `state` is one of `good`, `bad`, `muted`, `info` (or omitted for a plain chip); any other value fails the build. Pick by meaning, not by colour: `good` / `bad` say right or wrong (a kept item, a mistake), `muted` says excluded or pruned (dashed and struck through), and `info` marks a neutral category — an artefact that is text or a vector, not better or worse — with a tinted highlight and no strikethrough. Using `muted` for a neutral category misreads it as removed.

`legend` is optional and only renders the entries you name — its swatches are the chip markup itself, so a swatch cannot drift from the chips it explains.

**`table`** — editable contingency table or matrix with live outputs.

```yaml
names:  [[k, nk], [x, y]]              # variable name of each cell
rows:   [成功, 失敗]
cols:   [次數, 補數]
values: [[2, 8], [0, 0]]
margins: true                            # show row/column sums
outputs: [{ label: "P(X=k)", expr: "binomPmf(k + nk, k, k/(k+nk))", digits: 3 }]
actions: [{ label: 成功次數 +1, set: { k: "k + 1", nk: "nk - 1" } }, { label: 重設, reset: true }]
verdict: [{ when: "k == nk", text: "成功與失敗各半，變異數最大。" }]
```

**`curve`** — functions of x, optionally controlled by sliders.

```yaml
x: { label: k, min: 0, max: 20 }
inputs: [{ id: n, label: n, min: 4, max: 20, step: 2, value: 10 }]   # optional parameters
curves: [{ label: "p = 0.5", expr: "x > n ? 0 : binomPmf(n, x, 0.5)" }, { label: "p = 0.3", expr: "x > n ? 0 : binomPmf(n, x, 0.3)" }]
y: { label: "P(X=k)", min: 0, max: 0.3 }    # optional; default fits the curves
marker: { label: k, value: 3 }   # optional x marker (slider) with live readouts per curve
```

**Custom Labs** — `<project>/labs/<type>/lab.js` calling `Lykeion.registerLab('<type>', (root, params, api) => { … })`. `api` provides `H`, `S` (DOM/SVG builders), `esc`, `fmt`, `setVal`, `setSeg`, `onSeg`, `fillRange`, `toast`, `reduceMotion`; `LykeionMath.compile(expr, names)` evaluates expressions. A custom Lab must pass `lykeion verify` like any other.

## Maths library (Lab expressions and `calc`)

`sum, log2, ln, log10, exp, sqrt, abs, pow, min, max, floor, ceil, round, sin, cos, tan, asin, acos, atan, atan2, entropy(...counts), C(n,k), fact(n), PI, E`, plus normal JavaScript operators (`**`, `?:`, `&&`).

Angles are radians. There is no bare `log`: some subjects mean the natural log and others the base-10 one, so write `ln` or `log10` — a `calc` that says `log(2)` fails with a message saying exactly that.

### Project maths helpers (`<project>/math.js`)

A Lecture Site can add its own functions on top of that library. Ship a `math.js` next to `lykeion.json`:

```js
// <project>/math.js — inlined into the page right after the maths library
LykeionMath.extend({
  binomPmf: function (n, k, p) {
    return LykeionMath.lib.C(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
  }
});
```

Every registered name then works in `calc` expressions, in Lab `expr` strings and in custom Lab code:

```yaml
curves: [{ label: "p = 0.5", expr: "x > n ? 0 : binomPmf(n, x, 0.5)" }]
```

`extend` rejects a name that is not a JavaScript identifier, a value that is not a function, and any name that would override a built-in — so the library stays trustworthy. A syntax error or a throw inside `math.js` is a build error naming the file, and the numeric gate evaluates `calc` with the same helpers, so a checked number cannot pass on the page and fail in `verify`.

## Teaching rules

`lykeion verify` runs a `teaching` gate over what the build collected (the block kinds, their visible
characters and their text, plus every quiz item). The rules are data, not code: the defaults live in
`references/teaching-rules.json`, the banned phrases in `references/style-lexicon.json`, and a project
overrides any of them under `teaching` in `lykeion.json`.

```json
{
  "teaching": {
    "maxParagraphChars": 140,
    "stepperShare": 0.5,
    "lexicon": [{ "pattern": "本研究", "why": "講義不是論文，說「這堂課」就好。", "level": "warn", "lang": "zh" }],
    "lexiconOff": ["總而言之"]
  }
}
```

| rule | default | fails when |
| --- | --- | --- |
| `pageRefs` | `\bpp?\.\s*\d+(?:\s*[–—-]\s*\d+)?`, `第\s*\d+\s*頁`, `講義\s*(第\s*)?\d+(?:\s*[–—-]\s*\d+)?`, `(投影片|slide)\s*#?\d+(?:\s*[–—-]\s*\d+)?` | prose or a quiz item points at a page — the page is not in the reader's hands. A pattern must capture the whole reference (`p.10`, `pp. 3-5`): the report quotes the match, so a pattern that stops at `\d` reports `p.1` and the author cannot find it |
| `maxParagraphChars` | `160` | one paragraph is longer |
| `maxProseRun` | `520` | a run of paragraphs and lists between two blocks is longer |
| `formulaExplained` | `true` | a formula or display formula is followed by another formula, a heading or the section end before any prose |
| `analogyBeforeFormula` | `true` | a section has a formula but no `analogy` before its first one |
| `minBlockKinds` | `{ "minChars": 900, "kinds": 2 }` | a long section uses fewer than that many kinds of non-prose block |
| `stepperShare` | `{ "share": 0.34, "minLabs": 3 }` | with `minLabs` or more Labs, more than `share` of them are steppers |
| `lexicon` | `references/style-lexicon.json` | a `level: "fail"` phrase appears; `level: "warn"` is reported with ⚠ and does not fail. A match that an entry's `except` exception accepts is skipped (see below) |
| `plainMath` | five patterns: an identifier with an underscore (`[A-Za-z][A-Za-z0-9]*_(?:\{|[A-Za-z0-9])`), a backslash command (`\\[A-Za-z]{2,}`), a radical followed by a letter or `(` (`√\s*[A-Za-z(]`), a `^` after a letter, digit or `)` (`[A-Za-z0-9)\]]\^\s*[\{A-Za-z0-9(]`), and a letter followed by a superscript or subscript digit or modifier letter (`ᵀ`, `²`, `ₓ`, …). Lab `label` fields are checked with the same patterns, after `labelAllow` removes a lone letter with digits or subscript digits (`x1`, `p2`, `A₁`) | maths typed as plain text instead of `$…$` — the reader sees `√d_k` where the lecture means a formula; a Lab label that types maths |
| `codeSource` | `{ "exampleLabel": "示範", "minIdentifierShare": 0.5, "outputTitles": ["輸出"], "keywords": [...] }` | a code listing has no `from`, or its `from` is none of `slides`, a `references` prefix or `example` (with 「示範」 in the title); a `from="slides"` listing shares fewer than `minIdentifierShare` of its identifiers with its section's pages. Missing page text is ⚠ (not checkable). `outputTitles` are exempt, and `keywords` are not counted as identifiers |
| `sayConnects` | `{ "minShare": 0.5, "stopTerms": ["的", "一個", "這個", "機率", "公式", "表示", "the", …] }` | fewer than `minShare` of a parts formula's explanations (`say` of its pieces and of its fractions) tie to the lesson. A `say` ties when it contains a digit (it works through the example's numbers), or shares a term with the section's `analogy` blocks (title and body), or shares a term with the digit paragraphs and lists before the formula. A term is a CJK bigram or a Latin word of three letters or more, taken after the `stopTerms` are removed, so a generic word links nothing. A section with neither an analogy nor worked numbers before its formula reports ⚠ and cannot fail |
| `numericMath` | `{ "ignore": "\\s|\\d|[+\\-\u2212.,%$]|\\\\[,;:!]|\\\\%|[{}]|~~" }` | a `$…$` span is only a number (`$0.5$`): it inherits the maths face, size and baseline and reads as a foreign word in the sentence. Anything left after removing digits, signs and braces is an expression and passes |
| `proseNumbers` | `{ "ignore": ["\\d+(?:\\.\\d+){2,}", "§\\s*\\d+(?:\\.\\d+)*"] }` | a decimal or a percentage in the reading text (paragraphs, lists, notes, callouts, analogies, takeaways, a parts formula's words, a quiz explanation) matches no `calc` expect or Lab readout of its section at the precision written, and is not inside `<q>…</q>`. Integers are not checked. `ignore` patterns are blanked before the scan; a project's `proseNumbers` replaces the whole rule, so repeat the patterns you keep |

- Every failure names the file, the section and a short excerpt.
- `formulaParts` is not a gate rule but the same kind of constant: `{ "minParts": 2, "minExplained": 2, "maxPartShare": 0.5 }` decides how many pieces a `formula` block needs, how many of them must carry a `say`, and how large an explained piece may be relative to the whole formula. The build and the gate read the same file, so a project that overrides it changes both.
- `lexicon` entries are `{ pattern, why, level: "fail"|"warn", lang: "zh"|"en"|"any", except? }`. A project's entries are appended to the shipped ones; `lexiconOff` lists patterns to switch off. `lang` only decides whether an entry applies to a project (`lang: "zh"` applies to `zh-Hant-TW`); the rules themselves are language-neutral.
- `except` names exceptions from `lexiconExceptions` (in `teaching-rules.json`). The shipped `glossed` exception accepts a match that a parenthesised Latin gloss follows at once, so `非顯而易見（non-trivial）` is a translated term and passes, while `顯而易見，` is still reported. An unknown name in `except` fails the gate.
- `plainMath` and `numericMath` are `false` to switch them off, and `numericMath.ignore` is a regex source, not a pattern list: the parts of a formula that do not make it an expression.
- An unknown key under `teaching` is a gate failure, so a typo cannot silently do nothing.
- A `teaching review` gate reads `teaching-review.md` (written by the teaching reviewer) exactly like the source gate reads `source-check.md`: `STATUS: pass|fail` decides, a missing file stays pending, and a self-review is reported with ⚠.

### Numbers in prose

A decimal (`0.083`) or a percentage (`90%`) in the reading text must come from its own section: a `calc` entry gives it, or a Lab shows it at the values the Lab opens on. The build evaluates the readouts of the built-in Labs (`slider-calc` outputs and bars, `table` outputs, `curve` markers) with the page's own maths, so a number in the prose and in the Lab cannot disagree on arrival. Write it at the precision the Lab shows: `0.444` reads `0.4444`, `44.4%` reads `0.4444`, and a truncated slide figure (`0.444` for `0.4449`) counts as well as a rounded one. A quiz explanation is checked against the section its item links to (`sec`). Lab hints, verdicts and erratum text are not checked by this rule.

A figure the slides state that this site does not compute is quoted with `<q>…</q>`. The reader sees quotation marks and a dotted underline, so the figure is visibly the slide's:

```markdown
講義寫 <q>90%</q>、<q>7%</q>、<q>3%</q>，這是為了直觀而取的數字。
```

Say in the prose what the true value is when it differs. A custom Lab's outputs are its own code and the build cannot evaluate them, so quote a number from one, or compute it with a `calc`.
