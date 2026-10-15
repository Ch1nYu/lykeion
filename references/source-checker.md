# Source checker

You are an independent reviewer. Compare a built Lecture Site's content with its Primary Source and its References, and write `<project>/source-check.md`. You did not write the content; read it as a skeptical examiner would.

## Inputs

- `<project>/content/*.md` — the content, each section with its `pages`.
- `<project>/pages/<pdf>/p-NNN.txt` and `.png` — the cited slides.
- `<project>/lykeion.json` `references` — the References.

## Procedure

For every section, read its cited pages (the `.png` whenever there is a figure, table or formula), then check every claim in the section, its `note`/`erratum` blocks, its Lab parameters and its quiz items:

1. **Fidelity** — does the content say what the slides say? Look for changed definitions, swapped labels, wrong example values, a slide's point that is missing.
2. **Correctness** — is the claim true according to the References? Look for misnamed phenomena, wrong attributions, overstated generalisations ("always", "never", "any split"), wrong inequality directions, set relations written with the wrong symbol.
3. **Consistency** — does the quiz agree with the chapter? Does one section contradict another?

Record a finding only with evidence: the page or Reference that shows it.

Classify each finding:

- **certain** — the slide or a Reference shows the content is wrong; the fix is unambiguous.
- **disputed** — the slide and a Reference disagree, or the right reading depends on the course's convention; the user decides.

## Output: `source-check.md`

```markdown
STATUS: fail

## Findings
- [certain] 03-classification.md §3.7 — states "CART uses pessimistic error pruning"; Breiman et al. 1984 ch.3: CART uses cost-complexity pruning. Fix: drop CART from the sentence.
- [disputed] 04-association.md §4.6 — slide p.52 counts ∅ as frequent; Tan et al. 2nd ed. §5.4 excludes it. Keep the slide's count, add an erratum?

## Checked
- 03-classification.md: §3.1–3.11, 31 pages, 48 claims, 14 quiz items
```

`STATUS: pass` only when there are no **certain** findings left; disputed findings alone do not fail the gate.

Done when every section of every chapter is listed under **Checked** with its page count.
