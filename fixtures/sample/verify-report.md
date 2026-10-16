# Verify report — lykeion 範例講堂

- Built: 2026-10-16T15:52:48.312Z
- Verified: 2026-10-16T15:52:51.792Z
- Result: **PASS (with gates not yet run — see below)**

| Gate | Status | Summary |
|---|---|---|
| numeric | ✓ pass | 7/7 numbers match |
| coverage | ✓ pass | every scope page is cited |
| render | ✓ pass | 20 checks passed |
| source | … pending | awaiting agent review (references/source-checker.md) |

## numeric

- ✓ 01-impurity.md §1.1: `gini(2,4)` = 0.444444, stated 0.444 — table row (2,4)
- ✓ 01-impurity.md §1.1: `entropy(2,4)` = 0.918296, stated 0.918
- ✓ 01-impurity.md §1.1: `error(2,4)` = 0.333333, stated 0.333
- ✓ 01-impurity.md §1.1 quiz #1: `gini(2,4)` = 0.444444, stated 0.444
- ✓ 02-association.md §2.1: `C(6,1) + C(6,2) + C(6,3)` = 41, stated 41 — candidates with Apriori pruning, d = 6
- ✓ 02-association.md §2.2: `(15/20)/(90/100)` = 0.833333, stated 0.833
- ✓ 02-association.md §2.2 quiz #1: `(15/20)/(90/100)` = 0.833333, stated 0.833

## coverage

- ✓ sample.pdf p.1-4: 4/4 pages cited

## render

- ✓ 9 formulas rendered as MathML; 0 TeX errors
- ✓ no unrendered TeX in body text
- ✓ all in-page links resolve
- ✓ sidebar lists 6 links for 5 sections
- ✓ 5 Labs mounted
- ✓ Lab lab-1 (slider-calc): slider → output changed
- ✓ Lab lab-2 (stepper): button → output changed
- ✓ Lab lab-3 (itemsets): slider → output changed
- ✓ Lab lab-4 (table): number input → output changed
- ✓ Lab lab-5 (curve): slider → output changed
- ✓ Lab lab-3 (itemsets): 5 legend swatches are painted exactly like the lattice node states they name
- ✓ Lab lab-3 (itemsets): displayed counts match LykeionMath.itemsets at 3 minsup values (minsup 1 → frequent 15/closed 9/maximal 1, minsup 4 → frequent 3/closed 3/maximal 3)
- ✓ Quiz Level 1 “不純度”: 3 questions answered with the key → all accepted
- ✓ Quiz Level 2 “關聯分析”: 2 questions answered with the key → all accepted
- ✓ theme button cycles light → dark → system
- ✓ no console or page errors (desktop)
- ✓ no horizontal overflow at 375px
- ✓ mobile drawer opens and closes with Esc
- ✓ dark theme applies (body background rgb(28, 26, 22))
- ✓ no console or page errors (mobile, dark)

## source

- – source-check.md not found: the agent must review claims against the cited pages
