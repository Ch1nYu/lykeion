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
    - { tex: '=', say: '右邊把它算出來。' }
    - { tex: '1 - \sum_{i} p_{i}^{2}', say: '一減掉每一類機率的平方和：越集中，平方和越大，Gini 越小。' }
  hint: 點每一段看它在做什麼
  ```
  ````

  Each part with a `say` becomes a button; pressing it shows that one explanation in a fixed-height area under the formula, and the first explained part is already selected. Parts without a `say` are rendered but not clickable (use them for operators and spacing). `hint` is optional prose under the card. Single-quoted YAML scalars keep TeX literal (`tex: '\frac{P(A)}{P(B)}'`); in a double-quoted scalar every backslash must be doubled (`tex: "\\frac{P(A)}{P(B)}"`), because YAML reads `\f` as an escape.

The build rejects a parts formula whose pieces, joined with whitespace removed, do not spell `tex`, one with fewer than `formulaParts.minExplained` explained parts, and any piece that is not valid TeX — so a breakdown can never drift from the formula it explains.

- Maths in a heading (`## 3.1 縮放用 $\sqrt{d_k}$`, `### 除以 $\sqrt{d_k}$`) reaches the sidebar, the top bar and the pager as rendered maths: a label copies the heading's markup, not its text, so the TeX source never appears next to the marks. The plain-text label the runtime keeps for toasts and `Lykeion.views()` flattens the formula to marks (`√(dk)`), never `dk\sqrt{d_k}`.
- A number is not a formula: `$0.5$` inherits the maths face and baseline and reads as a word from another language, so write numbers as text and keep `$…$` for expressions. The `teaching` gate enforces this (`numericMath`), and also fails maths typed as plain text (`√d_k`, `\sqrt`, `x^2`, `QKᵀ`, `x_{i}`) — `plainMath`.
- Inline maths that is much taller than its line would stretch line boxes and break the reading rhythm, so `.prose math` is set at `font-size:.92em` with `line-height:1` and the line box keeps its pitch. The render gate measures it (`inline maths` check).

## Code listings

A plain fenced block (any info string that does not name a block below) is a runnable code listing.
Name the language first, then an optional `title="…"` caption; anything else in the info string is ignored:

````markdown
```python title="二項 pmf：公平硬幣十次中兩次正面"
from math import comb

n, k, p = 10, 2, 0.5
pmf = comb(n, k) * p ** k * (1 - p) ** (n - k)
print(round(pmf, 3))  # 0.044
```
````

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
Labs break out of the reading column, so put them at the top level of a section (not inside a list).

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
| `lexicon` | `references/style-lexicon.json` | a `level: "fail"` phrase appears; `level: "warn"` is reported with ⚠ and does not fail |
| `plainMath` | five patterns: an identifier with an underscore (`[A-Za-zα-ωΑ-Ω][A-Za-z0-9]*_[{A-Za-z0-9]`), `\\[A-Za-z]+` (a backslash command), `[A-Za-z0-9}]\s*\^\s*\{?\w`, `[A-Za-z0-9)]\s*[ᵀᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ]`, and the math marks `[√∑∏∫≈≠≤≥→↦∈∉⊆⊂∪∩∞±×÷·∇∂Δ]` | an underscore, a backslash command, a `^`, a superscript or a maths mark is typed as plain text instead of `$…$` — the reader sees `√d_k` where the lecture means a formula |
| `numericMath` | `{ "ignore": "\\s|\\d|[+\\-.,%$]|[{}]" }` | a `$…$` span is only a number (`$0.5$`): it inherits the maths face, size and baseline and reads as a foreign word in the sentence. Anything left after removing digits, signs and braces is an expression and passes |

- Every failure names the file, the section and a short excerpt.
- `formulaParts` is not a gate rule but the same kind of constant: `{ "minParts": 2, "minExplained": 2 }` decides how many pieces a `formula` block needs and how many of them must carry a `say`. The build and the gate read the same file, so a project that overrides it changes both.
- `lexicon` entries are `{ pattern, why, level: "fail"|"warn", lang: "zh"|"en"|"any" }`. A project's entries are appended to the shipped ones; `lexiconOff` lists patterns to switch off. `lang` only decides whether an entry applies to a project (`lang: "zh"` applies to `zh-Hant-TW`); the rules themselves are language-neutral.
- `plainMath` and `numericMath` are `false` to switch them off, and `numericMath.ignore` is a regex source, not a pattern list: the parts of a formula that do not make it an expression.
- An unknown key under `teaching` is a gate failure, so a typo cannot silently do nothing.
- A `teaching review` gate reads `teaching-review.md` (written by the teaching reviewer) exactly like the source gate reads `source-check.md`: `STATUS: pass|fail` decides, a missing file stays pending, and a self-review is reported with ⚠.
