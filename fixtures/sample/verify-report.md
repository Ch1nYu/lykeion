# Verify report — lykeion 範例講堂

- Built: 2026-11-01T11:08:49.628Z
- Verified: 2026-11-01T11:09:15.240Z
- Result: **FAIL**

| Gate | Status | Summary |
|---|---|---|
| numeric | ✓ pass | 36/36 numbers match |
| coverage | ✓ pass | every scope page is cited |
| quiz review | ✓ pass | no level has a guessable key |
| teaching | ✓ pass | 13 checks passed |
| render | ✓ pass | 39 checks passed |
| source | – skipped | not applicable (sample fixture has no Primary Source: sample.pdf is a placeholder) (from source-check.md) |
| teaching review | ✗ fail | independent (from teaching-review.md) |
| visual review | ✗ fail | independent (from visual-review.md) |

## numeric

- ✓ 01-conditional.md §1.1: `0.3*0.4` = 0.12, stated 0.12 — independent case: P(A)P(B)
- ✓ 01-conditional.md §1.1: `0.20/0.40` = 0.5, stated 0.5
- ✓ 01-conditional.md §1.1: `entropy(1, 1)` = 1, stated 1 — two equally likely outcomes carry one bit
- ✓ 01-conditional.md §1.1: `0.3/0.4` = 0.75, stated 0.75 — largest P(A|B) for fixed P(A)=0.3 and P(B)=0.4
- ✓ 01-conditional.md §1.1: `0.70` = 0.7, stated 0.7 — sum of probabilities distractor
- ✓ 01-conditional.md §1.1: `0.58` = 0.58, stated 0.58 — union probability distractor
- ✓ 01-conditional.md §1.1: `0.3` = 0.3, stated 0.3 — P(A) used in the quiz explanation
- ✓ 01-conditional.md §1.1: `0.9` = 0.9, stated 0.9 — test sensitivity P(+|D)
- ✓ 01-conditional.md §1.1: `0.01` = 0.01, stated 0.01 — disease prevalence P(D)
- ✓ 01-conditional.md §1.1: `0.108` = 0.108, stated 0.108 — total positive-test probability
- ✓ 01-conditional.md §1.1 quiz #1: `0.20/0.40` = 0.5, stated 0.5
- ✓ 01-conditional.md §1.2: `0.9*0.01` = 0.009, stated 0.009 — true positive mass
- ✓ 01-conditional.md §1.2: `0.1*0.99` = 0.099, stated 0.099 — false positive mass
- ✓ 01-conditional.md §1.2: `0.99` = 0.99, stated 0.99 — healthy fraction
- ✓ 01-conditional.md §1.2: `0.01` = 0.01, stated 0.01 — disease prevalence P(D)
- ✓ 01-conditional.md §1.2: `0.108` = 0.108, stated 0.108 — total positive-test probability
- ✓ 01-conditional.md §1.2: `0.9` = 0.9, stated 0.9 — sensitivity P(+|D)
- ✓ 01-conditional.md §1.2: `0.917` = 0.917, stated 0.917 — fraction of positive tests that are false discoveries
- ✓ 01-conditional.md §1.2: `0.083` = 0.083, stated 0.083 — posterior probability P(D|+)
- ✓ 02-binomial.md §2.1: `binomPmf(10, 2, 0.5)` = 0.0439453, stated 0.044 — fair coin, exactly two heads in ten
- ✓ 02-binomial.md §2.1: `binomPmf(10, 3, 0.3)` = 0.266828, stated 0.267
- ✓ 02-binomial.md §2.1: `10*0.3*(1-0.3)` = 2.1, stated 2.1 — variance distractor in the expectation quiz
- ✓ 02-binomial.md §2.1: `10*(1-0.3)` = 7, stated 7 — expected failures distractor in the expectation quiz
- ✓ 02-binomial.md §2.1 quiz #1: `binomPmf(10, 2, 0.5)` = 0.0439453, stated 0.044
- ✓ 02-binomial.md §2.2: `10*0.3` = 3, stated 3 — E[X] = np
- ✓ 02-binomial.md §2.2: `10*0.3*(1-0.3)` = 2.1, stated 2.1 — Var(X) = np(1-p)
- ✓ 02-binomial.md §2.2: `binomPmf(20, 10, 0.5)` = 0.176197, stated 0.176
- ✓ 02-binomial.md §2.2: `2.1` = 2.1, stated 2.1 — variance distractor in the expectation quiz
- ✓ 02-binomial.md §2.2: `sqrt(2.1)` = 1.44914, stated 1.45
- ✓ 02-binomial.md §2.2: `5/10` = 0.5, stated 0.5 — expected successes and failures when n=10, p=0.5
- ✓ 02-binomial.md §2.2: `45/1024` = 0.0439453, stated 0.044 — probability of exactly two successes in ten trials with p=0.5
- ✓ 02-binomial.md §2.2: `1*0.5 + 0*(1-0.5)` = 0.5, stated 0.5 — E[Z] for one 0/1 trial
- ✓ 02-binomial.md §2.2: `10*0.5` = 5, stated 5 — E[X] when n=10, p=0.5
- ✓ 02-binomial.md §2.2: `0.5*(1-0.5)` = 0.25, stated 0.25 — p(1-p) is largest at p=0.5
- ✓ 02-binomial.md §2.2: `10*0.5*(1-0.5)` = 2.5, stated 2.5 — Var(X) when n=10, p=0.5
- ✓ 02-binomial.md §2.2: `sqrt(2.5)` = 1.58114, stated 1.58

## coverage

- ✓ sample.pdf p.1-4: 4/4 pages cited

## quiz review

- ✓ Quiz Level “條件機率”: 2 choice items, no option gives the key away
- ✓ Quiz Level “二項分布”: 2 choice items, no option gives the key away

## teaching

- ✓ pageRefs: no page references in body text or quiz items
- ✓ maxParagraphChars: every paragraph is 160 chars or fewer
- ✓ maxProseRun: no run of prose exceeds 520 chars
- ✓ formulaExplained: every formula is followed by prose that explains it
- ✓ analogyBeforeFormula: every section that has a formula opens with an analogy
- ✓ minBlockKinds: every section over 900 chars of prose uses at least 2 non-prose kinds
- ✓ stepperShare: 1 of 7 Labs are steppers
- ✓ lexicon: no entry of style-lexicon.json matches (22 entries)
- ✓ plainMath: no maths typed as plain text
- ✓ numericMath: every number in maths is part of an expression
- ✓ codeSource: every code listing says where it comes from
- ✓ proseNumbers: every decimal and percentage matches a calc or a Lab readout at its default, or is quoted
- ✓ sayConnects: every formula piece ties to the analogy or the example

## render

- ✓ skip link “跳到內容” is the first Tab stop, visible when focused, and Enter moves focus into main
- ✓ 113 formulas rendered as MathML; 0 TeX errors
- ✓ no TeX residue in any visible text (prose, sidebar, top bar, pager, toast)
- ✓ all in-page links resolve
- ✓ 4 views (home, ch1, ch2, quizCh), exactly one shown at a time (home)
- ✓ sidebar lists only the shown view (home: 3 links, ch1: 2 links / 2 sections + 2 sub-links, ch2: 2 links / 2 sections, quizCh: 2 links)
- ✓ 7 Labs mounted
- ✓ 2 code listings, each with a focusable copy button (2 labelled with a language)
- ✓ all 323 text elements use --f-display or --f-body (--f-mono only inside pre/code/kbd)
- ✓ 32 reading paragraphs: line-height ≥ 1.7 and width ≤ 40em
- ✓ every stack shows at most one variant
- ✓ 6 formula-parts blocks keep their height across 27 pieces and show exactly one explanation each
- ✓ 18 paragraphs with inline maths keep their line spacing
- ✓ no heading carries maths
- ✓ Lab lab-1 (slider-calc): slider → output changed
- ✓ Lab lab-2 (slider-calc): slider → output changed
- ✓ Lab lab-3 (stepper): button → output changed
- ✓ Lab lab-4 (slider-calc): slider → output changed
- ✓ Lab lab-5 (slider-calc): slider → output changed
- ✓ Lab lab-6 (curve): slider → output changed
- ✓ Lab lab-7 (curve): slider → output changed
- ✓ every Lab keeps its height while its controls move at 1280px (7 Labs)
- ✓ Quiz Level 1 “條件機率”: 3 questions answered with the key → all accepted
- ✓ Quiz Level 2 “二項分布”: 3 questions answered with the key → all accepted
- ✓ 4 chapter tabs each show exactly their own view
- ✓ 11 sidebar links land their target just under the top bar (or at the page end)
- ✓ deep link #s2-2 opens ch2 with the section just under the top bar (section top y=66px, top bar bottom y=60px)
- ✓ browser Back returns to ch1 (showing ch1)
- ✓ back to top: hidden and out of the tab order at the top, shown and tabbable after one viewport, click → scrollY 0
- ✓ theme button flips light → dark → light from a light system, aria-label “切換成深色模式” → “切換成淺色模式”
- ✓ stored theme applies before first paint (a head script reads the store key; after a reload data-theme is dark, body rgb(28, 26, 22))
- ✓ challenge button opens the quiz view and pushes history (#ch1 → #quizCh, showing quizCh)
- ✓ a malformed hash (#%) still shows exactly one view (home)
- ✓ no console or page errors (desktop)
- ✓ no horizontal overflow at 375px
- ✓ every Lab keeps its height while its controls move at 375px (6 Labs; stepper exempt)
- ✓ mobile drawer opens and closes with Esc
- ✓ dark theme applies (body background rgb(28, 26, 22))
- ✓ no console or page errors (mobile, dark)

## source

- – not applicable: sample fixture has no Primary Source: sample.pdf is a placeholder — NOT source-checked

## teaching review

- ✗ see teaching-review.md

## visual review

- ✗ see visual-review.md
