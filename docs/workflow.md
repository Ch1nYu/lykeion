# lykeion workflow

The agent-neutral procedure for turning lecture slides into a verified Lecture Site. Vocabulary: `GLOSSARY.md`. Every deterministic step is a `lykeion` command (`node <repo>/bin/lykeion.mjs`); the agent writes content and makes judgements.

Two modes:

- **New** — no `lykeion.json` yet for these slides.
- **Incremental** — a project exists and the user wants a chapter added or rewritten. Run steps 2–9 for the affected chapters only; steps 6–7 always cover the whole site.

The Primary Source is the factual baseline. Content follows the slides; where a Reference disagrees, the slide's claim stays and an `erratum` beside it gives the Reference's account with its citation.

## 1. Set up

1. Check the CLI: `node <repo>/bin/lykeion.mjs --help`. It needs Node 22.13 or newer — `pdfjs-dist` uses `Promise.withResolvers`, which Node 20 lacks — so the CLI checks `process.versions.node` first and exits with one line naming both versions when the host Node is older. If `node_modules` is missing, run `npm install` in the repo (and `npx playwright install chromium` when no system Chrome exists).
2. Settle the Scope from the user's message: which PDFs, which pages. Ask only for what the message leaves out.
3. Ask the user for the **Depth** (Survey / Standard / Deep; default from `~/.config/lykeion/config.json`, normally Standard). Depth fixes the budget:

   | | Survey | Standard | Deep |
   |---|---|---|---|
   | Labs | none required | one per key formula or algorithm | Standard + one per worked example |
   | Quiz items per Quiz Level | 4–5 | 6–8 | 8–12 |
   | Proofs and derivations | results only | key derivations | full derivations |
   | Errata | obvious slide errors | Standard + checked against References | every claim checked against References |

4. New mode: `lykeion init <pdf...> --title <title> --pages <a-b> ... --depth <depth> [--dir <project-dir>]`. It creates `<first pdf dir>/lykeion/` (or the `--dir` folder) and suggests an unused Palette. `--pages` is given once per PDF, in the same order, and defaults to every page.

Done when `lykeion.json` exists with the Scope and Depth the user confirmed.

## 2. Extract

`lykeion extract --project <project>` writes `pages/<pdf>/p-NNN.txt` and `p-NNN.png` for every Scope page.

Some PDFs carry a broken character map: the page renders correctly but its text layer reads 「穌的的一一個」 for 「耶穌的第一個」. Extract detects this from the fonts, prints a ⚠ line naming the affected pages, and records them as `suspect` in `pages/index.json`. For those pages the `.png` is the source of truth; never quote their `.txt`.

Done when every Scope page has a `.txt` and a `.png`.

## 3. Outline

Read every Scope page: the `.txt` for wording, the `.png` whenever the slide carries a figure, table, tree or formula (text extraction loses layout and maths). Then write `<project>/outline.md` following `references/outline.md`.

For a Scope larger than about 40 pages you may use sub-agents when the host offers them: dispatch one drafter per PDF (or page block) in parallel, each writing its chapter's part of the Outline from `references/outline.md`, then merge the parts into `outline.md` yourself and check that the parts together cover every Scope page. Without sub-agents, draft the Outline yourself, one block at a time, to the same bar.

Done when every Scope page is assigned to a section in the Outline or listed under **Left out on purpose** with a reason, each section has its planned Labs, quiz items and `calc` targets, and the Outline names one Palette from `lykeion palette list`.

Show the Outline to the user and wait for approval — the cheapest moment to change direction; the pages left out on purpose are shown there too, so the user can take one back. Skip the wait only when the user said to proceed without review. Once approved, add each left-out run to the scope's `exclude` in `lykeion.json` with its reason (`"exclude": [{ "pages": "1", "reason": "封面" }]`), so coverage stops requiring it and a section that cites it fails. Record the approved Palette: `lykeion palette use <title> <id>`, and set it in `lykeion.json`.

## 4. Write

Write one `content/NN-<slug>.md` per chapter following `references/chapter-writer.md` and `docs/content-format.md`.

Sub-agents are optional. When the host offers them you may dispatch one writer per chapter in parallel; each receives `references/chapter-writer.md`, `docs/content-format.md`, its Outline part, and its page files. Otherwise write the chapters yourself, one by one, to the same bar.

Done when every Outline section exists with its pages, every number stated in prose has a `calc` entry, and every number quiz item has a `calc`.

## 5. Build

`lykeion build <project>`. Fix every reported error in the content and rebuild.

Done when the build prints `built …` with no errors.

## 6. Verify

`lykeion verify <project>`, then read `verify-report.md`. Fix every ✗ at its cause (the content, a `calc`, a page range, a Lab's parameters), rebuild, re-verify.

Done when numeric, coverage and render all show ✓. A render gate marked "skipped — NOT render-verified" is reported to the user as unverified, never as passed.

The **quiz review** gate fails any choice item whose options give the key away — the key clearly longest, absolute words only in the distractors, a hedge only in the key, or the key alone echoing the stem — and any Quiz Level whose key is the longest option in more than half of its items. Rewrite the options (see `references/chapter-writer.md`, Quiz) until it passes. The gate catches mechanical tells only; still read each item and ask whether a student who has not studied could pick the key.

The **teaching** gate checks the writing rules of `references/chapter-writer.md` that a machine can count: no page numbers in body text, paragraph and prose-run length, a formula never left without words, an analogy before a section's first formula, enough kinds of block in a long section, the stepper share of Labs, and the phrases listed in `references/style-lexicon.json` (fail) — ⚠ entries are warnings to read, not failures. Its thresholds are in `references/teaching-rules.json`; a project may change one under `"teaching"` in `lykeion.json` only for a reason the user agreed to (a subject with long unavoidable definitions, say), never just to pass. Fix the content instead.

The **render** gate also checks the reading experience: only the three font tokens, the prose line height and measure, every chapter tab and sidebar link landing on its target, a deep link opening the right chapter, the floating back-to-top and theme buttons, and that no Lab or formula box changes height while its controls move.

## 7. Source check

Have the built content compared with the cited pages and the References, and record the result in `<project>/source-check.md`.

The review **must** be done by a reviewer with fresh context whenever the host can start one: a sub-agent, or another agent session the host provides. That reviewer is given only the files `references/source-checker.md` lists — never the writer's conversation — and is started with the exact message in `references/reviewer-brief.md`, with nothing added. For a site with several chapters you may dispatch one reviewer per chapter in parallel, each writing `source-check-<chapter>.md` in the same format, then merge them into `source-check.md` with one STATUS line (`fail` if any part has a certain finding).

A self-review is allowed only when the host has no way to start another agent. Then re-read `references/source-checker.md` from the top first, and state the reason in the header: `Reviewer: self (no sub-agent tool in this host)`. `source-check.md` must carry `Reviewer: independent` or `Reviewer: self (reason)`; a `self` line without a reason fails the source gate. `lykeion verify` repeats the reviewer in its source gate, and a self-review shows as ⚠ with a count under the gate table. A self-review is allowed when it says why; passing it off as an independent one is not.

Fix every finding marked **certain**, rebuild, and re-run steps 6–7. Leave **disputed** findings unchanged for the user.

Steps 6–7 together get at most **3 fix rounds**. If gates still fail after round 3, stop and report what remains.

Done when `lykeion verify` shows source ✓ (or 3 rounds are spent).

## 8. Teaching review

Once the content is right, have it judged for how well it teaches: follow `references/teaching-reviewer.md` and record the result in `<project>/teaching-review.md`. As with the source check, a reviewer with fresh context is required whenever the host can start one, started with the exact message in `references/reviewer-brief.md`, and the header states `Reviewer: independent`, or `Reviewer: self (reason)` only when the host has no way to start another agent. A `self` line without a reason fails the teaching-review gate; a self-review with a reason shows as ⚠ in `lykeion verify`.

Fix every **must-fix** finding, rebuild and re-verify (the machine gates must stay green). Apply suggestions when they are cheap. At most **2 rounds**; then report what remains.

Done when `lykeion verify` shows teaching review ✓ (or 2 rounds are spent).

## 9. Visual review

Once the content teaches, have the rendered page judged for how it looks. Run `lykeion shots <project>`: it writes one full-page PNG per chapter, theme and viewport to `<project>/shots/`. Then follow `references/visual-reviewer.md` and record the result in `<project>/visual-review.md`. The reviewer judges the images, not the code. As with the other reviews, a reviewer with fresh context is required whenever the host can start one, started with the exact message in `references/reviewer-brief.md`, and the header states `Reviewer: independent`, or `Reviewer: self (reason)` only when the host has no way to start another agent.

The render gate already measures what a counter can: holes taller than half a screen, emoji used as icons, gradient text, walls of identical cards, too many left edges, and a type scale that is too wide or too flat (thresholds in `references/visual-rules.json`; a project may change one under `"visual"` in `lykeion.json` only for a reason the user agreed to). The visual review covers what it cannot: focal point, hierarchy, whether a figure belongs to its topic, mobile and dark-theme reading.

A missing `visual-review.md` shows as ⚠ and does not fail `lykeion verify` for now; a `STATUS: fail` or a `self` line without a reason does. Fix every **must-fix** finding, rebuild, re-run `lykeion shots` and re-verify. At most **2 rounds**; then report what remains.

Done when `lykeion verify` shows visual review ✓ (or 2 rounds are spent, or the user chose to skip it — then report it as ⚠, never as passed).

## 10. Report

Tell the user, briefly:

- the Lecture Site path (and offer to open it);
- the gate results from `verify-report.md`, including anything skipped or still failing, teaching warnings (⚠) left in place, visual-rule warnings (⚠), and whether the source check, the teaching review and the visual review were independent, self-reviews or (visual review only) not done;
- every **disputed** finding, quoted with its page and Reference, for the user to decide;
- the Palette used.
