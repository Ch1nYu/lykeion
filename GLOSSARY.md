# Lykeion

Turns a subject's lecture materials into a systematic, interactive, single-file teaching site whose content is verified against its sources.

## Sources

**Primary Source**:
The course's own lecture slides; the sole factual baseline a Lecture Site follows.
_Avoid_: Material, input, 講義 (ambiguous with the output)

**Reference**:
An authoritative academic work (textbook, original paper, recognised university course page) used only to supplement or correct the Primary Source.
_Avoid_: Citation, external source

**Implementation**:
The code behind the Primary Source's results, when the Lecture Site teaches a paper or thesis that ran experiments (listed in `lykeion.json` `implementation`). Read only where the Primary Source leaves unclear what was done; it never replaces the Primary Source.
_Avoid_: Source code, repo

**Scope**:
The files and page ranges of the Primary Source a Lecture Site must cover, optionally narrowed or weighted by a topic list.
_Avoid_: Range, coverage

**Erratum**:
A margin annotation beside Primary-Source content stating where a Reference disagrees, with the Reference cited.
_Avoid_: Correction, fix

## Output

**Lecture Site**:
The single HTML teaching page produced for one Scope.
_Avoid_: 網頁, page, handout

**Depth**:
How thoroughly a Lecture Site treats its Scope: Survey, Standard or Deep.
_Avoid_: Level, detail

**Outline**:
The proposed chapter and section list, with page mappings and planned Labs and Quiz items, approved by the user before writing begins.
_Avoid_: Plan, TOC

**Lab**:
An interactive panel where the reader changes inputs and sees a concept's computed result.
_Avoid_: Sandbox, demo, widget

**Quiz Level**:
One stage of the end-of-site quiz, unlocked by passing the previous stage.
_Avoid_: Stage, round, 關卡 (use only as the UI label)

**Palette**:
A complete colour scheme for a Lecture Site in both light and dark themes, covering paper, ink, accent, highlight, data-series and good/bad colours.
_Avoid_: Theme, colour, accent

**Palette Library**:
The only Palettes a Lecture Site may use: the bundled Palettes the maintainer approved, plus the user's own Palettes that pass the automated checks.
_Avoid_: Presets, colour options

## Teaching

**Analogy**:
An intuition card placed before the formalism, mapping a familiar situation part for part onto the concept, and returned to once the formula arrives.
_Avoid_: Example, metaphor, story

**Takeaway**:
The one sentence a reader should leave a section with, set as a short block with an accent rule.
_Avoid_: Summary, conclusion

**Formula Parts**:
A formula broken into ordered pieces, each explained in words, so the reader can take the formula apart one piece at a time instead of receiving it whole.
_Avoid_: Breakdown, annotation

**Teaching Gate**:
The check that a Lecture Site explains rather than transcribes: no page references, no wall of prose, every formula followed by words, an analogy before the formalism, a mix of block kinds.
_Avoid_: Style check, lint

**Shots**:
Full-page PNGs of a built Lecture Site, one per chapter, theme and viewport, written by `lykeion shots`; what the Visual Review looks at.
_Avoid_: Screenshots folder, previews

**Visual Review**:
An agent's judgement of the Shots — focal point, hierarchy, whether each figure belongs to its topic, mobile and dark-theme reading — recorded in `visual-review.md`; the counted visual rules belong to the render gate, not to this review.
_Avoid_: Design review, UI check

**Acceptance Fixture**:
A fixed Scope whose regenerated Lecture Site must reach a known score; the regression test for every runtime change.
_Avoid_: Test data, sample, benchmark

**Palette Specimen**:
A page that shows candidate Palettes applied to real Lecture Site components, light and dark side by side, for the user to approve or reject.
_Avoid_: Preview, swatch page
