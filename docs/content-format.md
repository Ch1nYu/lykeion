# Content format

A Lecture Site project is a directory:

```
<project>/
├── lykeion.json        # project settings
├── content/*.md        # one file per chapter, built in file-name order
└── labs/<type>/lab.js  # optional project-local custom Lab types (+ lab.css)
```

`lykeion build <project>` turns it into one HTML file plus `checks.json` (input for `lykeion verify`).
Any error below fails the build; nothing broken is silently rendered.

## lykeion.json

```json
{
  "title": "資料探勘期中講堂",
  "description": "One sentence for the page meta description.",
  "eyebrow": "Data Mining · Midterm",
  "lang": "zh-Hant-TW",
  "palette": "desk-teal",
  "depth": "standard",
  "output": "資料探勘期中講堂.html",
  "hero": { "title": "從資料裡挖出<em>沒人告訴你的規律</em>", "intro": "One paragraph." },
  "levels": { "決策樹": "不純度與最佳分割" },
  "scope": [{ "file": "chap3_basic_classification_m.pdf", "pages": "1-60" }],
  "references": ["Tan, Steinbach, Karpatne & Kumar, Introduction to Data Mining, 2nd ed."]
}
```

- `palette` must be in the Palette Library (`lykeion palette list`).
- `hero.title` may contain `<em>` for the highlighter sweep.
- `levels` gives each Quiz Level a subtitle; keys are level titles used in quiz blocks.
- `scope` is what `verify` checks coverage against; `file` matches a chapter's `source`.

## Chapter file

```markdown
---
chapter: 3                      # number shown as "03"
title: 分類：基本概念與決策樹     # chapter heading
short: 分類與決策樹               # sidebar and table-of-contents label (default: title)
subtitle: Classification: Basic Concepts and Techniques
summary: Hunt 演算法、Gini／Entropy、過擬合與剪枝   # table-of-contents blurb
source: chap3_basic_classification_m.pdf           # Primary Source file of this chapter
---

Optional chapter introduction (before the first section).

## 3.1 分類的定義與流程 {pages=3-5}

Section body in Markdown.
```

- A section starts with `## <number> <title> {pages=a-b}`. `pages` is required for coverage; use `pages=7` for one page, `pages=3-5,9` for several ranges.
- Section ids are `s<number>` with dots as dashes (`s3-1`); override with `{id=my-id}`.
- Use `###`/`####` freely inside a section; only `##` starts a section.
- Raw HTML is allowed for things Markdown lacks: `<mark>` (highlight), `<span class="en">` (English gloss), `<div class="grid2">`.

## Maths

- Inline `$…$`, display `$$…$$` (may span lines). TeX is rendered to MathML at build time by KaTeX.
- A closing `$` followed by a digit is not a delimiter, so prices like `$5` are safe; write `\$` for a literal dollar inside maths.
- Write TeX exactly as in a `.tex` file — never escape backslashes (`\frac`, not `\\frac`).
- A display formula with a corner label:

  ````markdown
  ```formula GINI
  \mathrm{Gini}(t) = 1 - \sum_j p_j^2
  ```
  ````

## Blocks

All blocks are fenced code blocks whose info string names the block. YAML blocks must be valid YAML; quote strings that contain `:` or start with special characters.

### `note` — handwritten margin note (exam tips, intuition)

````markdown
```note
考前提醒：**關聯規則與分群屬於描述型任務**。
```
````

### `callout [label]` — boxed aside

### `erratum` — where a Reference disagrees with the Primary Source (required `ref`)

````markdown
```erratum
text: 投影片稱 CART 使用悲觀誤差剪枝；CART 實際使用 cost-complexity pruning。
ref: Breiman et al., *Classification and Regression Trees*, 1984, ch. 3
```
````

### `calc` — machine-checked numbers (not rendered)

Every number a worked example states must have a `calc` entry, so `verify` can recompute it.

````markdown
```calc
- { expr: "gini(7,5) - (6/12*gini(5,1) + 6/12*gini(2,4))", expect: 0.125, note: "Gini gain of the split" }
- { expr: "C(6,2)", expect: 15, tol: 0 }
```
````

`tol` defaults to 0.0015 (enough for 3-decimal rounding). Expressions are JavaScript using the maths library below.

### `quiz [level]` — questions for the end-of-site quiz (not rendered inline)

````markdown
```quiz 決策樹
- type: num
  q: 節點內 C1 = 2、C2 = 4，Gini 是多少？（小數 3 位）
  a: 0.444
  tol: 0.002
  calc: "gini(2,4)"
  ex: $1 - (2/6)^2 - (4/6)^2 = 0.444$。
- q: Customer ID 的資訊增益最高，C4.5 怎麼修正？
  o: [改用 Misclassification error, 用 Gain Ratio 懲罰切成很多小份的分割, 只允許多路分割, 改用 Gini index]
  a: 1
  ex: SplitINFO 隨分割數變大，Gain Ratio 被壓低。
  pages: 48
```
````

- Questions join the Quiz Level named after `quiz` (default: the chapter's `short` title). Levels appear in order of first use; a chapter gets a "challenge" button for each level it contributes to.
- Choice items: `o` (2–8 options) and `a` = index of the right option. Options are shuffled for the reader, so never write "以上皆是" / "all of the above".
- Number items: `type: num`, numeric `a`, `tol`, and a `calc` expression (required in practice: `verify` flags number items without one).
- `ex` explains why; `pages` overrides the section's pages; each item links back to its section.
- `q`, `o`, `ex` accept inline Markdown and `$…$`.

### `lab <type>` — an interactive Lab (YAML parameters)

Common keys: `tag` (badge, e.g. `LAB A`), `title`, `hint`. Any `text` or `note` value is rendered as inline Markdown with maths.
Labs break out of the reading column, so put them at the top level of a section (not inside a list).

**`slider-calc`** — sliders in, computed readouts out.

```yaml
inputs:
  - { id: c1, label: C1, min: 0, max: 6, step: 1, value: 2, unit: "" }                          # slider
  - { id: emp, label: Employed, value: 1, options: [{ value: 1, label: "Yes" }, { value: 0, label: "No" }] }  # categorical buttons
outputs:
  - { label: Gini, expr: "gini(c1, 6 - c1)", digits: 3, best: min }   # best: highlight min/max among outputs sharing it
  - { label: 預測, expr: "emp ? 1 : 0", labels: { "1": "Yes", "0": "No" } }   # labels: show text for exact values
bars:    [{ label: Gini, expr: "gini(c1, 6 - c1)", max: 1 }]
verdict: [{ when: "c1 == 3", text: "三個指標同時最大。" }]                  # first true wins
```

**`stepper`** — walk through an algorithm one state at a time.

```yaml
steps:
  - label: "(a)"
    text: 所有紀錄在根節點，計數 $(7,3)$。
    table: { head: [Tid, Home, Class], rows: [[1, Yes, No], [2, No, No]], highlight: [0] }
    chips: [{ text: "{A,B}", state: freq, note: "σ=3" }, { text: "{C,E}", state: infreq }]   # freq | infreq | pruned
```

**`table`** — editable contingency table or matrix with live outputs.

```yaml
names:  [[f11, f10], [f01, f00]]        # variable name of each cell
rows:   [Tea, ¬Tea]
cols:   [Coffee, ¬Coffee]
values: [[15, 5], [75, 5]]
margins: true                            # show row/column sums
outputs: [{ label: Lift, expr: "(f11/(f11+f10)) / ((f11+f01)/(f11+f10+f01+f00))", digits: 3 }]
actions: [{ label: "+ 10000 筆 f00", set: { f00: "f00 + 10000" } }, { label: 重設, reset: true }]
verdict: [{ when: "...", text: "..." }]
```

**`curve`** — functions of x, optionally controlled by sliders.

```yaml
x: { label: p, min: 0, max: 1 }
inputs: [{ id: k, label: k, min: 1, max: 5, step: 1, value: 2 }]   # optional parameters
curves: [{ label: Gini, expr: "2*x*(1-x)" }, { label: Entropy, expr: "x<=0||x>=1 ? 0 : -x*log2(x)-(1-x)*log2(1-x)" }]
y: { label: impurity, min: 0, max: 1 }    # optional; default fits the curves
marker: { label: p, value: 0.3 }   # optional x marker (slider) with live readouts per curve
```

**`itemsets`** — transactions + `minsup` → which itemsets are frequent, closed and maximal, drawn as an itemset lattice (level = itemset size, edge = subset → superset). The reader moves the `minsup` slider and sees the verdicts change; the counts come from `LykeionMath.itemsets`, which `lykeion verify` recomputes from the same parameters.

```yaml
transactions:                       # 1–20 baskets, 1–6 distinct items overall
  - { tid: t1, items: [A, B, C, D] }
  - { tid: t2, items: [A, B, C] }
  - { tid: t3, items: [A, B] }
  - { tid: t4, items: [A, C, D] }
  - { tid: t5, items: [B, C] }
minsup: { value: 2 }                # absolute support count; min defaults to 1, max to the basket count
show: [frequent, closed, maximal]   # optional: which readouts and legend states to show (default: all three)
verdict: [{ when: "nMaximal == 2", text: "minsup = 2：{A,B,C} 與 {A,C,D} 都是最大項目集。" }]
```

Node states: infrequent (dashed, struck through), frequent, closed, maximal (a maximal itemset is also closed, so it is drawn filled with a heavier ring). Emphasis grows frequent < closed < maximal. The empty set ∅ sits above level 1, is styled neutrally and is not part of the taxonomy, so it is not counted in the readouts. The legend swatches are the node markup at legend size, so they always show the same paint as the lattice. The lattice never renders narrower than its viewBox, so on a narrow screen it keeps its text size and `.vizwrap` scrolls horizontally instead of the page overflowing. `verdict.when` is an expression over `minsup`, `nFrequent`, `nClosed`, `nMaximal`.

**Custom Labs** — `<project>/labs/<type>/lab.js` calling `Lykeion.registerLab('<type>', (root, params, api) => { … })`. `api` provides `H`, `S` (DOM/SVG builders), `esc`, `fmt`, `setVal`, `setSeg`, `onSeg`, `fillRange`, `toast`, `reduceMotion`; `LykeionMath.compile(expr, names)` evaluates expressions. A custom Lab must pass `lykeion verify` like any other.

## Maths library (Lab expressions and `calc`)

`sum, log2, ln, log10, exp, sqrt, abs, pow, min, max, floor, ceil, round, gini(...counts), entropy(...counts), error(...counts), C(n,k), fact(n), itemsets(transactions, minsup), PI, E`, plus normal JavaScript operators (`**`, `?:`, `&&`).

`LykeionMath.itemsets(transactions, minsup)` returns `{ minsup, n, universe, sets, frequent, closed, maximal, counts }`: every non-empty itemset of the item universe with its absolute support `sigma`, plus `frequent` / `closed` / `maximal` flags. It is available to Lab code and to `calc` expressions.
