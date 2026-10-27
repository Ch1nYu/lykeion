# Source checker

You are the reviewer of a built Lecture Site. Compare its content with its Primary Source and its References, and write your result to the file the brief names under `Write your result to:` — `<project>/source-check.md`, or `<project>/source-check-<chapter>.md` when you check one chapter — and to `<project>/source-check.md` when there is no brief.

You did not write the content: read it as a skeptical examiner would. If you were started with the message in `reviewer-brief.md`, you are the independent reviewer: write `Reviewer: independent`, even if you cannot start agents yourself. The rest of this paragraph is for the writing agent. If you can start another agent with fresh context (a sub-agent tool, or another agent session), the check must be done by that agent, given only the files listed under Inputs — never the writer's conversation. Only when the host has no way to start another agent may the writing agent do this check itself. That is not an independent review: re-read this file from the top before starting, and say so in the `Reviewer:` line with the reason.

## Inputs

- `<project>/content/*.md` — the content, each section with its `pages`.
- `<project>/pages/<pdf>/p-NNN.txt` and `.png` — the cited slides.
- `<project>/lykeion.json` `references` — the References.
- `<project>/lykeion.json` `implementation`, when present — the code behind the Primary Source's results. Read it only where the cited pages leave unclear what was done (which axis a split runs over, a default, the exact form of an update), and cite the file and line as the evidence: `per code: lib/sampling.py:42`.
- Never an earlier review: do not open a `source-check*.md`, `teaching-review*.md` or `visual-review*.md` already in the folder, or anything under `_work/reviews-*/`. They are another reviewer's verdict on an older build; this review must be your own. If one is in the way, ignore it — your result replaces it.

## Procedure

For every section, read its cited pages (the `.png` whenever there is a figure, table or formula), then check every claim in the section, its `note`/`erratum` blocks, its Lab parameters and its quiz items:

1. **Fidelity** — does the content say what the slides say? Look for changed definitions, swapped labels, wrong example values, a slide's point that is missing.
2. **Correctness** — is the claim true according to the References? Look for misnamed phenomena, wrong attributions, overstated generalisations ("always", "never", "any split"), wrong inequality directions, set relations written with the wrong symbol.
3. **Consistency** — does the quiz agree with the chapter? Does one section contradict another?

Record a finding only with evidence: the page or Reference that shows it.

Classify each finding:

- **certain** — the slide or a Reference shows the content is wrong; the fix is unambiguous.
- **disputed** — the slide and a Reference disagree, the slide clearly states something the `implementation` does not do, or the right reading depends on the course's convention; the user decides.

When the slide is unclear and the `implementation` settles it, the finding is **certain**, with the code as its evidence.

## Output: `source-check.md`

```markdown
STATUS: fail
Reviewer: independent

## Findings
- [certain] 03-classification.md §3.7 — states "CART uses pessimistic error pruning"; Breiman et al. 1984 ch.3: CART uses cost-complexity pruning. Fix: drop CART from the sentence.
- [disputed] 04-binomial.md §4.6 — slide p.52 rounds $np(1-p)$ to 2 decimals; the textbook keeps 3. Keep the slide's rounding, add a note?

## Checked
- 03-classification.md: §3.1–3.11, 31 pages, 48 claims, 14 quiz items
```

The `Reviewer:` line is required and belongs in the header, above the first `##` heading: `independent` when someone other than the content's author reviewed it, or `self` with the reason in parentheses — `Reviewer: self (no sub-agent tool in this host)`. A `self` line without a reason fails the gate. `lykeion verify` repeats the answer in its source gate, so a self-review shows up as ⚠ in `verify-report.md` instead of reading like an independent review.

`STATUS: pass` only when there are no **certain** findings left; disputed findings alone do not fail the gate.

Done when every section of every chapter is listed under **Checked** with its page count.
