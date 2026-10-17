# Outline format

`<project>/outline.md` is the plan the user approves before any content is written. Its job is to show, at a glance, that the whole Scope is covered and how each part will be taught.

```markdown
# Outline — <title>

Depth: Standard · Palette: desk-teal · Scope: chap3.pdf p.1-60, chap4.pdf p.1-80

## Chapter 3 — 條件機率與貝氏定理 (chap3.pdf)

| § | Section | Pages | Labs | Quiz (level) | calc targets |
|---|---|---|---|---|---|
| 3.1 | 條件機率與獨立性 | 1-6 | — | 1 choice (條件機率) | — |
| 3.5 | 貝氏定理與全機率公式 | 23-31 | slider-calc: posterior P(A|B) as a function of the prior; stepper: one Bayes update step by step | 2 num + 1 choice (條件機率) | P(D|+) = 0.083; P(A∩B) = 0.12 |

Errata candidates:
- p.29 states … ; Reference … says … (to confirm while writing)

Skipped pages: p.60 (references list), p.1 (title slide)
```

Rules:

- Every Scope page appears in exactly one section's Pages, or under **Skipped pages** with a reason (title slides, agenda, bibliography, blank). Skipped pages still count as covered: list them in the nearest section's `pages` when writing.
- Sections follow the slides' order; one section per coherent topic, usually 3–12 slides.
- Section numbers follow the textbook chapter numbers (`3.1`, `3.2`, …) so they match the course.
- Quiz Levels: one per chapter, or split a long chapter into two levels by topic; name each level with a short noun phrase.
- Lab plans name the Lab type and what the reader changes and sees. Choose a Lab where moving a parameter shows the concept (conditional probability vs. prior, a Bayes update step by step, the shape of a distribution as n grows); a static table is not a Lab.
- calc targets list every number a worked example on those slides produces.
- Palette: suggest the result of `lykeion palette suggest`, with one line on why it suits the subject; the user may pick another from `lykeion palette list`.
