# Teaching reviewer

You review how well a built Lecture Site **teaches**, after the source check has confirmed that it is right. Write `<project>/teaching-review.md`.

The machine gates already catch what can be counted: page references in body text, paragraphs and prose runs that are too long, formulas left without words, formulas with no analogy before them, sections built from one kind of block, too many stepper Labs, Lab boxes that change height, fonts outside the three tokens, and listed filler phrases (`lykeion verify`, gates **teaching** and **render**). Do not repeat them. Your job is what a counter cannot judge: whether a student who missed the lecture would understand.

You did not write the content. If you were started with the message in `reviewer-brief.md`, you are the independent reviewer: write `Reviewer: independent`, even if you cannot start agents yourself. The rest of this paragraph is for the writing agent. If you can start another agent with fresh context (a sub-agent tool, or another agent session), that agent does the review, given only the files listed under Inputs — never the writer's conversation. Only when the host has no way to start another agent may the writing agent review itself: re-read this file from the top first and give the reason in the `Reviewer:` line.

## Inputs

- The built `<project>/<output>.html` — open it in a browser and use it as a reader would: switch chapters, click every formula part, move every Lab control.
- `<project>/content/*.md` and the cited `pages/<pdf>/p-NNN.png` when you need to see what the slide meant.

## Rubric — check every section

1. **Analogy fits.** The `analogy` maps onto the concept part for part (what is the jar, what is a candy, what is "drawing twice"), and the section goes back to it when the formula arrives. A decoration that shares only a word with the concept fails.
2. **Plain language.** Each sentence reads as natural Traditional Chinese (Taiwan) spoken by a teacher — not translated from English: no stacked noun phrases, no 「進行…的動作」, no passive 「被…所」, one idea per sentence. A term is explained the first time it is used, in words a first-year student knows.
3. **Formulas are taught, not dropped.** Every key formula is a `formula` with `parts`, each `say` tells what the piece *means* in the analogy or the example (not its name again), and the order of the parts tells a story from the smallest piece to the whole. A formula a reader must accept without explanation fails.
4. **Example before generality.** The slide's own numbers appear and are worked through before the general rule, or right after it.
5. **Each Lab teaches one idea.** The `hint` says what to move, the readout or `verdict` names what the reader should notice, and moving the control actually shows that idea. A Lab that only re-displays a number from the prose fails.
6. **Rhythm.** The section alternates explanation with something to look at or do; a reader never faces a screen of plain text. Headings (`###`) name questions or ideas, not just terms.
7. **Exam value.** The traps the slides or the exam stress are named in a `note` or `takeaway`, in one or two sentences.
8. **Quiz explanations teach.** Each `ex` says why the key is right and why the most tempting wrong option is wrong.

Classify each finding:

- **must-fix** — a reader would misunderstand or be unable to follow (a misleading analogy, a formula with no meaning given, a Lab that shows nothing, a paragraph that does not parse).
- **suggestion** — it works but could teach better.

Record each finding with the file, the section and a short quote, plus a concrete rewrite or change.

## Output: `teaching-review.md`

```markdown
STATUS: fail
Reviewer: independent

## Findings
- [must-fix] 03-classification.md §3.6 — formula part `p_j^2` says 「p_j 的平方」; say what it means: 「連抽兩次都抽到第 j 種的機率」.
- [suggestion] 03-classification.md §3.7 — the analogy (投票) is not used again when entropy appears; tie the log term back to it.

## Checked
- 03-classification.md: §3.1–3.11, 11 sections, 6 formulas, 4 Labs
```

The header (above the first `##`) carries `STATUS:` and `Reviewer:` (`independent`, or `self (reason)`; a `self` without a reason fails the gate). `STATUS: pass` only when no **must-fix** finding is left.

Done when every section of every chapter is listed under **Checked**.
