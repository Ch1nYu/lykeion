# Rubric

The ten metrics used in the 2026-10 review of four hand-made Data Mining pages, and the acceptance score for lykeion (M7). Each metric is scored 1–10, then weighted to a total out of 100.

| # | Metric | Weight | What earns a high score |
|---|---|---|---|
| 1 | Coverage | 10% | Every topic in Scope is taught; nothing in the slides is silently dropped. |
| 2 | Correctness | 15% | Worked numbers, definitions and quiz keys are right; claims match slides and References. |
| 3 | Explanation depth | 10% | Intuition → formula → example → pitfall; exam traps called out. |
| 4 | Labs | 12% | Each Lab teaches its concept by moving a parameter; values correct; nothing broken. |
| 5 | Quiz | 8% | Enough items per level, calculation and concept mix, explanations that address the wrong option, working progression. |
| 6 | Maths rendering | 8% | Every formula renders, offline, legibly. |
| 7 | Visual design | 10% | Coherent typography and Palette, clear hierarchy, working dark theme. |
| 8 | Responsive | 7% | Usable at 375px: drawer navigation, no horizontal overflow, readable tables and Labs. |
| 9 | Accessibility | 8% | Semantic structure, keyboard use, focus styles, labels, contrast, reduced motion. |
| 10 | Code quality | 12% | No errors, no broken wiring, no global leaks, resilient storage, no CDN dependence for content. |

Severity of findings: **high** — breaks a feature or misteaches a core concept; **medium** — wrong but local; **low** — polish.

Acceptance (M7): the regenerated Data Mining Lecture Site scores **≥ 82**, has **no high-severity findings**, and passes all four `verify` gates. Score it with a reviewer that did not write it, reading the whole file and recomputing the worked numbers.
