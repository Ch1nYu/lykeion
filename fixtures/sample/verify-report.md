# Verify report — lykeion 範例講堂

- Built: 2026-10-17T10:54:53.185Z
- Verified: 2026-10-17T10:54:56.724Z
- Result: **PASS (with gates not yet run — see below)**

| Gate | Status | Summary |
|---|---|---|
| numeric | ✓ pass | 13/13 numbers match |
| coverage | ✓ pass | every scope page is cited |
| quiz review | ✓ pass | no level has a guessable key |
| render | ✓ pass | 20 checks passed |
| source | … pending | awaiting agent review (references/source-checker.md) |

## numeric

- ✓ 01-conditional.md §1.1: `0.3*0.4` = 0.12, stated 0.12 — independent case: P(A)P(B)
- ✓ 01-conditional.md §1.1: `0.20/0.40` = 0.5, stated 0.5
- ✓ 01-conditional.md §1.1: `entropy(1, 1)` = 1, stated 1 — two equally likely outcomes carry one bit
- ✓ 01-conditional.md §1.1 quiz #1: `0.20/0.40` = 0.5, stated 0.5
- ✓ 01-conditional.md §1.2: `0.9*0.01` = 0.009, stated 0.009 — true positive mass
- ✓ 01-conditional.md §1.2: `0.1*0.99` = 0.099, stated 0.099 — false positive mass
- ✓ 01-conditional.md §1.2: `0.009/(0.009+0.099)` = 0.0833333, stated 0.083
- ✓ 02-binomial.md §2.1: `binomPmf(10, 2, 0.5)` = 0.0439453, stated 0.044 — fair coin, exactly two heads in ten
- ✓ 02-binomial.md §2.1: `binomPmf(10, 3, 0.3)` = 0.266828, stated 0.267
- ✓ 02-binomial.md §2.1 quiz #1: `binomPmf(10, 2, 0.5)` = 0.0439453, stated 0.044
- ✓ 02-binomial.md §2.2: `10*0.3` = 3, stated 3 — E[X] = np
- ✓ 02-binomial.md §2.2: `10*0.3*(1-0.3)` = 2.1, stated 2.1 — Var(X) = np(1-p)
- ✓ 02-binomial.md §2.2: `binomPmf(20, 10, 0.5)` = 0.176197, stated 0.176

## coverage

- ✓ sample.pdf p.1-4: 4/4 pages cited

## quiz review

- ✓ Quiz Level “條件機率”: only 2 choice items, not judged
- ✓ Quiz Level “二項分布”: only 2 choice items, not judged

## render

- ✓ 29 formulas rendered as MathML; 0 TeX errors
- ✓ no unrendered TeX in body text
- ✓ all in-page links resolve
- ✓ sidebar lists 6 links for 5 sections
- ✓ 5 Labs mounted
- ✓ Lab lab-1 (slider-calc): slider → output changed
- ✓ Lab lab-2 (stepper): button → output changed
- ✓ Lab lab-3 (table): number input → output changed
- ✓ Lab lab-4 (curve): slider → output changed
- ✓ Lab lab-5 (stepper): button → output changed
- ✓ Lab lab-2 (stepper): stepper legend: 2 swatches match the chip states they name
- ✓ Lab lab-5 (stepper): stepper legend: 2 swatches match the chip states they name
- ✓ Quiz Level 1 “條件機率”: 3 questions answered with the key → all accepted
- ✓ Quiz Level 2 “二項分布”: 3 questions answered with the key → all accepted
- ✓ theme button cycles light → dark → system
- ✓ no console or page errors (desktop)
- ✓ no horizontal overflow at 375px
- ✓ mobile drawer opens and closes with Esc
- ✓ dark theme applies (body background rgb(28, 26, 22))
- ✓ no console or page errors (mobile, dark)

## source

- – source-check.md not found: the agent must review claims against the cited pages
