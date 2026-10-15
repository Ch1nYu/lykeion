# Fixed template runtime + Markdown content, maths rendered to MathML at build time

Agents write only chapter content as extended Markdown (fenced `quiz`, `lab`, `note`, `erratum` blocks); a fixed, pre-verified CSS/JS runtime and a build script assemble the single-file Lecture Site, with KaTeX converting all TeX to MathML during the build. We chose this over letting an agent write each Lecture Site's HTML from scratch because in a four-way experiment (Data Mining midterm, 2026-10) every freeform page lost most of its marks to engineering faults that nobody checked: unbound `onclick` handlers, HTML/CSS class names that never matched, and LaTeX whose backslashes were eaten as string escapes. The only page that scored well was the one with a stable component pattern and no runtime CDN.

## Considered Options

- **Freeform HTML per run**: maximum flexibility, but repeats the same classes of faults every run and makes each page's quality depend on one generation.
- **Runtime KaTeX/MathJax from a CDN**: prettier than hand-built HTML, but needs the network and only surfaces bad TeX when someone opens the page.
- **Hand-built HTML formulas** (what the winning page did): offline, but cannot typeset binomials and similar notation properly.

## Consequences

- Bad TeX fails the build instead of reaching the reader.
- Custom Labs remain possible through a fixed `mount(container, params)` interface, but must pass the same render and numeric checks before inclusion.
- Visual or behavioural changes happen in the runtime once and reach every future Lecture Site; regressions are guarded by rebuilding the Data Mining acceptance fixture.
