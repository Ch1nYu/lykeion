# lykeion implementation plan

Vocabulary follows `GLOSSARY.md`. Architecture decisions: `docs/adr/0001`–`0004`.
v1 is built for the maintainer's own use on Claude Code; the repo is kept publishable from day one (ADR 0003) and agent-portable (ADR 0004).

The runtime is extracted from the best-scoring hand-made Lecture Site of the 2026-10 review (82/100). That file and the Acceptance Fixture's slides are private; their paths live in the user config, never in the repo.

## Layout

```
lykeion/                       # public repo
├── SKILL.md                   # thin Claude Code entry → docs/workflow.md (M6)
├── bin/lykeion.mjs            # CLI: extract | build | verify | palette
├── package.json               # katex, markdown-it, js-yaml, pdfjs-dist, playwright
├── docs/{adr/, PLAN.md, workflow.md, content-format.md, rubric.md}
├── runtime/                   # fixed template (M1): shell.html, base.css, runtime.js
├── labs/                      # generic Lab types (M4)
├── palettes/bundled/*.json    # (M2)
├── src/                       # CLI command implementations
├── references/                # agent prompts: outline, chapter writer, source checker
└── fixtures/README.md         # how to point at a private Acceptance Fixture

~/.config/lykeion/             # personal, never in the repo
├── config.json                # defaults (depth, language), fixture paths
├── palettes/*.json            # personal Palettes
└── registry.json              # subject → Palette in use

<primary source dir>/lykeion/  # per-run output
├── lykeion.json               # scope, depth, palette, chapters, page map
├── pages/                     # extract output: p-001.txt, p-001.png …
├── content/*.md               # chapter content
├── <subject>.html             # the Lecture Site
└── verify-report.md
```

## Milestones

### M0 — Skeleton and CLI
- `package.json` with `engines.node >= 22.13` (the floor `pdfjs-dist` imposes) and a startup check that names the version, `npm install`, Playwright browser: prefer system Chrome (`channel: 'chrome'`), otherwise download Chromium; if neither is available, the render gate is skipped and the report says "not render-verified".
- `bin/lykeion.mjs` with subcommand dispatch; config loader for `~/.config/lykeion/` (honours `LYKEION_CONFIG_DIR`).
- `lykeion extract <pdf...> [--pages a-b]`: per-page text via `pdfjs-dist`, per-page PNG rendered through the browser.
- Done when: `extract` works on one of the fixture PDFs and `build --help` runs.

### M1 — Template runtime
- Extract CSS/JS from the baseline into `runtime/`; replace every literal colour with Palette tokens.
- Keep: paper grain, sidebar + progress ring, drawer < 900px, reading bar, heading highlight sweep, IIFE + `'use strict'`, no inline handlers, guarded localStorage.
- Add: floating bottom-right buttons — back-to-top (after the first screen) and theme cycle (system → light → dark); remove the sidebar theme button.
- Fix audit findings: drawer Esc + focus + `inert` when closed; `aria-live` on Lab outputs; validate localStorage shape; rAF-throttled scroll; quiz option shuffle, wrong-answer review, a Quiz Level entry at every chapter end, a `pages` field on every item linking back to its section; read-marking needs dwell time.
- Done when: a hand-written two-section sample builds and passes the M5 render gate.

### M2 — Palette Library
- Palette JSON schema: full token set × {light, dark}.
- `lykeion palette check`: body text ≥ 7:1, small text and `muted` ≥ 4.5:1, s1–s3 distinguishable under protan/deutan/tritan simulation.
- 6 candidates: baseline teal (fixed `muted`), 3 warm paper, 1 cool paper, 1 classical (rice paper + cinnabar + ink).
- `lykeion palette specimen`: every candidate on real components, light/dark side by side.
- **Maintainer gate**: approved candidates move to `palettes/bundled/`.
- Status (2026-10-15): approved `desk-teal`, `cool-slate`, `classic-cinnabar`; warm-brick / warm-indigo / warm-olive rejected for now.

### M3 — Content format and build
- `docs/content-format.md`: per-chapter Markdown with YAML front matter (`chapter`, `title`, `pages`); sections declare `pages:`; fenced blocks `quiz`, `lab`, `note`, `erratum` (requires `ref:`), `formula`.
- `lykeion build`: parse, TeX → MathML with KaTeX (`throwOnError: true`), inline runtime + Palette, emit one HTML; rebuild after a single chapter changes.

### M4 — Lab types
- slider-calc, stepper, table, curve; custom Labs export `mount(container, params)`.
- Each Lab declares its compute functions so `verify` can re-evaluate them headlessly.

### M5 — Verification (`lykeion verify` → `verify-report.md`)
1. Render: no console/page errors; every formula is MathML; every Lab mounts and responds; quiz completes; no horizontal overflow at 375px; light and dark both render.
2. Numeric: every quiz answer and worked example carrying a `calc` is recomputed within tolerance.
3. Coverage: every page in Scope is cited by at least one section.
4. Source check (agent, `references/source-checker.md`): claims vs. cited pages and References → certain / disputed.
- Gates added later — quiz review, teaching, teaching review, visual review — are listed in `README.md`; `verify` runs all of them in the order of that table.
- Fix loop: objective failures and certain findings auto-fixed, ≤ 3 rounds; disputed findings go to the user.

### M6 — Workflow
- `docs/workflow.md` (agent-neutral): ask Depth → `extract` → Outline (+ suggested unused Palette) → user approval (skipped when the user says to proceed without review) → write chapters (parallel if sub-agents exist, otherwise sequential) → build → verify → fix loop → report. Incremental mode: add/rewrite one chapter, rebuild, re-verify all, keep reader-progress keys stable.
- `SKILL.md`: thin Claude Code entry. Write both with the `writing-for-agents` skill.

### M7 — Acceptance (maintainer machine only)
- Regenerate the Data Mining Lecture Site from the fixture paths in `~/.config/lykeion/config.json` at Standard depth.
- Score with `docs/rubric.md` (10 metrics). Pass: ≥ 82/100, zero high-severity findings, all gates green.

Order: M0 → M1 → (M2 ∥ M3) → M4 → M5 → M6 → M7.

## M7 result (2026-10-15)

Independent reviewer scored the generated Data Mining site and the hand-made baseline side by side with `docs/rubric.md`:
**generated 81.7 vs baseline 74.5** (the same baseline scored 82 under a different reviewer in the original review, so only the side-by-side comparison is calibrated).
All four gates green, no high-severity findings; the 82-point absolute bar was missed by 0.3, mainly on Labs (6/10: half the Labs were steppers replaying slides, no tree / lattice / FP-tree visuals).

## Next (v1.1, from the M7 review)
1. Built-in Lab types stay subject-neutral. Subject-specific Labs (e.g. a decision-tree or FP-tree Lab for a data-mining course) belong in the Lecture Site's own `labs/` as custom Labs, not in the skill. The `itemsets` and `tree` Labs built for the Data Mining review were removed from the skill on 2026-10-17 (kept on the local branch `archive/dm-labs`). Brief for every Lab: at least one parameter that changes the result; steppers at most a third of a chapter's Labs.
2. Neutral stepper chip states (current / visited / contains) with an automatic legend; subject-specific states (e.g. freq / infreq / pruned) only when the content declares them.
3. `calc` datasets and helpers (`datasets: { name: [...] }`, generic helpers over a named dataset) instead of copy-pasted IIFEs; one rounding policy so tables and derivations agree; full precision in verify-report.
4. Disputed source-check items must be resolved on the page (rewrite, erratum or callout) or the source gate warns.
5. Page-length budget per Depth; quiz answer-position balance check.
6. `SKILL.md` never says how to resolve its own directory: every command is written `node <repo>/bin/lykeion.mjs`, so a host has to work out where the skill was installed before it can run anything. Name that resolution once — the folder the host loaded the skill from — so `<repo>` has one meaning, and leave the per-host entry notes (`AGENTS.md` for Codex / Cursor) to the TODO below.

## TODO (not v1)
- Public demo + CI on openly licensed material (e.g. OpenStax, CC BY).
- `AGENTS.md` and workflow notes for Codex / Cursor.
- Claude Code plugin packaging.
- Non-computational subjects and Labs (classify, order, match).
- Eye-comfort / long-reading Palettes.
- English-language Lecture Sites.
