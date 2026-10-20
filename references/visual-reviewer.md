# Visual reviewer

You review how a built Lecture Site **looks and reads as a page**, after the source check has confirmed that it is right and the teaching review has confirmed that it teaches. Write `<project>/visual-review.md`.

Judge the pictures, not the code. Open the PNGs and look at them the way a student scrolling on a phone would; read the built page only to confirm what you saw and to find the exact section a finding belongs to. A finding that needs a CSS rule to explain itself is a finding you have not finished: say what looks wrong, where, and what it should look like instead.

The machine gates already measure what can be counted. `lykeion verify` renders the page at 375px and 1280px in both themes and checks the DOM (broken markup, maths, Labs, links, quizzes, skip link, contrast); its visual rules measure vertical holes taller than half a viewport, emoji used as icons or bullets, text clipped to a gradient, runs of four or more identical sibling cards, more than five distinct left edges in a chapter's reading column, and a chapter that uses too few or too many type sizes. `lykeion shots` is the same page rendered as images. Do not repeat any of that — if one of those numbers is already ⚠ or ✗ in `verify-report.md`, it is known. Your job is what a counter cannot see: composition, hierarchy, and whether the pictures earn their place.

You did not write the content. If you were started with the message in `reviewer-brief.md`, you are the independent reviewer: write `Reviewer: independent`, even if you cannot start agents yourself. The rest of this paragraph is for the writing agent. If you can start another agent with fresh context (a sub-agent tool, or another agent session), that agent does the review, given only the files listed under Inputs — never the writer's conversation. Only when the host has no way to start another agent may the writing agent review itself: re-read this file from the top first and give the reason in the `Reviewer:` line.

## Inputs

- `<project>/shots/` — one full-page PNG per chapter, per theme, per viewport: `<chapter>.<light|dark>.<mobile|desktop>.png`. A chapter too tall for one capture comes in numbered parts instead — `<chapter>.<light|dark>.<mobile|desktop>.p1.png`, `.p2.png`, … — and every part has to be looked at, in order: the parts are one page cut into pieces, so a fault can straddle a cut or sit only in the last part. If the folder is missing, or its files are older than `<project>/<output>.html`, run `lykeion shots <project>` first and review the fresh images. Do not review a page you have not seen rendered.
- The built `<project>/<output>.html` — to find the section behind a finding, and to check anything the still images cannot show (a hover, a Lab mid-move).
- `<project>/content/*.md` — only to know what a chapter is trying to say, so you can judge whether the visual says it.

Look at every image. A chapter is only reviewed once you have seen it in both themes and both viewports; a layout that works at 1280px and collapses at 375px is the finding.

## Rubric — check every chapter

1. **First glance.** Each chapter head has one clear focal point, and a stranger looking for a few seconds can tell what the chapter is about. A head that is a title, a paragraph and three equally loud blocks has no focal point.
2. **Squint test.** Blur your eyes (or step back from the screen): the page should reduce to a few masses with clear size steps — a head, a figure, a Lab, a paragraph block. If it reduces to many equal grey rectangles, the hierarchy is flat and nothing tells the reader what matters.
3. **The visual is specific to this topic.** The chapter's figure, Lab or analogy drawing should only make sense for *this* material. A generic diagram, an icon row, or an illustration that would fit any chapter is decoration; say so and say what the chapter's own structure would look like drawn.
4. **Alignment and spacing.** Related things sit close together, sections are clearly separated, left margins are balanced, and no row is half empty — a lone card in a three-column row, a figure hugging one edge with a gutter of nothing on the other. Spacing should mean something: distance is the reader's signal that a new idea starts.
5. **Mobile at 375px.** The same order and the same hierarchy survive the narrow column: nothing cramped, nothing cut off, nothing that needs a sideways scroll, no font so small that the reader gives up. If the desktop page uses width to carry meaning, check that the meaning survives the collapse.
6. **Dark theme.** Contrast and highlights are still readable, and nothing only works in light: a dark-on-dark label, a shadow that disappears, a chart whose series were told apart by lightness alone. The two themes should read as the same page, not as one page and its negative.
7. **Rhythm across the chapter.** Text alternates with something to look at. A long stretch of identical-looking blocks — paragraph after paragraph, or figure after figure with no words between — loses the reader even when every block is individually fine.

Classify each finding:

- **must-fix** — a reader would be confused, misled or blocked: no focal point, a cut-off or overlapping element on mobile, unreadable dark-theme text, a figure that shows the wrong thing, a half-empty row that reads as a broken layout.
- **suggestion** — it works but the page could look and read better.

Then say where the cause lives, because the fix goes to a different place:

- **[runtime]** — the shared page template causes it, so it would recur in every Lecture Site (a table or formula box that clips at 375px with no scroll cue, a Lab layout that stacks every readout). It is fixed once in lykeion, not in this project's content.
- **[content]** — this project's chapters cause it (a figure the text refers to but never shows, a table with more columns than its content needs).

Write the tag after the class, e.g. `- [must-fix][runtime] …`. When you cannot tell, write `[content]` and say what made you unsure.

Record each finding with the chapter, the theme and viewport you saw it in, the file it comes from, and a concrete change — "give §2.3's figure the full column and move the caption under it" beats "spacing feels off".

## Output: `visual-review.md`

```markdown
STATUS: fail
Reviewer: independent

## Findings
- [must-fix][content] 02-bayes.md, dark/desktop — §2.4 the posterior bars are #2A2A2A on #1E1E1E; the 9% bar is invisible. Use the accent colour for the posterior series, or add a light outline.
- [must-fix][runtime] 03-entropy.md, mobile — §3.5 the two-column comparison keeps its 2-col grid at 375px and the right column is cut off. Stack it below 640px.
- [suggestion][content] 01-conditional.md, light/desktop — the chapter head is a title plus three equal cards, so nothing leads. Make the chapter question the focal point and drop one card.
- [suggestion][runtime] 04-rag.md, light/desktop — §4.6 ends in a row with one card in a three-column grid; the empty two-thirds reads as a bug.

## Checked
- 01-conditional.md: light+mobile, light+desktop, dark+mobile, dark+desktop
- 02-bayes.md: light+mobile, light+desktop, dark+mobile, dark+desktop
```

The header (above the first `##`) carries `STATUS:` and `Reviewer:` (`independent`, or `self (reason)`; a `self` without a reason fails the gate). `STATUS: pass` only when no **must-fix** finding is left.

Done when every chapter of the site is listed under **Checked**, in both themes and both viewports.
