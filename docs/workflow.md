# lykeion workflow

The agent-neutral procedure for turning lecture slides into a verified Lecture Site. Vocabulary: `GLOSSARY.md`. Every deterministic step is a `lykeion` command (`node <repo>/bin/lykeion.mjs`); the agent writes content and makes judgements.

Two modes:

- **New** — no `lykeion.json` yet for these slides.
- **Incremental** — a project exists and the user wants a chapter added or rewritten. Run steps 2–8 for the affected chapters only; steps 6–7 always cover the whole site.

The Primary Source is the factual baseline. Content follows the slides; where a Reference disagrees, the slide's claim stays and an `erratum` beside it gives the Reference's account with its citation.

## 1. Set up

1. Check the CLI: `node <repo>/bin/lykeion.mjs --help`. If `node_modules` is missing, run `npm install` in the repo (and `npx playwright install chromium` when no system Chrome exists).
2. Settle the Scope from the user's message: which PDFs, which pages. Ask only for what the message leaves out.
3. Ask the user for the **Depth** (Survey / Standard / Deep; default from `~/.config/lykeion/config.json`, normally Standard). Depth fixes the budget:

   | | Survey | Standard | Deep |
   |---|---|---|---|
   | Labs | none required | one per key formula or algorithm | Standard + one per worked example |
   | Quiz items per Quiz Level | 4–5 | 6–8 | 8–12 |
   | Proofs and derivations | results only | key derivations | full derivations |
   | Errata | obvious slide errors | Standard + checked against References | every claim checked against References |

4. New mode: `lykeion init <pdf...> --title <title> --pages <a-b> ... --depth <depth>`. It creates `<pdf dir>/lykeion/` and suggests an unused Palette.

Done when `lykeion.json` exists with the Scope and Depth the user confirmed.

## 2. Extract

`lykeion extract --project <project>` writes `pages/<pdf>/p-NNN.txt` and `p-NNN.png` for every Scope page.

Done when every Scope page has a `.txt` and a `.png`.

## 3. Outline

Read every Scope page: the `.txt` for wording, the `.png` whenever the slide carries a figure, table, tree or formula (text extraction loses layout and maths). Then write `<project>/outline.md` following `references/outline.md`.

For a Scope larger than about 40 pages with sub-agents available, dispatch one drafter per PDF (or page block) in parallel, each writing its chapter's part of the Outline from `references/outline.md`; then merge the parts into `outline.md` yourself and check that the parts together cover every Scope page.

Done when every Scope page is assigned to a section in the Outline, each section has its planned Labs, quiz items and `calc` targets, and the Outline names one Palette from `lykeion palette list`.

Show the Outline to the user and wait for approval — the cheapest moment to change direction. Skip the wait only when the user said to proceed without review. Record the approved Palette: `lykeion palette use <title> <id>`, and set it in `lykeion.json`.

## 4. Write

Write one `content/NN-<slug>.md` per chapter following `references/chapter-writer.md` and `docs/content-format.md`.

With sub-agents available, dispatch one writer per chapter in parallel; each receives `references/chapter-writer.md`, `docs/content-format.md`, its Outline part, and its page files. Without sub-agents, write the chapters one by one. Either way the content must meet the same bar.

Done when every Outline section exists with its pages, every number stated in prose has a `calc` entry, and every number quiz item has a `calc`.

## 5. Build

`lykeion build <project>`. Fix every reported error in the content and rebuild.

Done when the build prints `built …` with no errors.

## 6. Verify

`lykeion verify <project>`, then read `verify-report.md`. Fix every ✗ at its cause (the content, a `calc`, a page range, a Lab's parameters), rebuild, re-verify.

Done when numeric, coverage and render all show ✓. A render gate marked "skipped — NOT render-verified" is reported to the user as unverified, never as passed.

The **quiz review** gate is advisory: it passes but names any Quiz Level where the right option is the longest in more than half of its choice items (four or more items), because a student can then guess by length. Rewrite those options so the key is not the longest.

## 7. Source check

Dispatch an independent reviewer with fresh context (a sub-agent; without one, do it yourself after re-reading `references/source-checker.md` from the top) to compare the built content with the cited pages and the References. It writes `<project>/source-check.md`. For a site with several chapters and sub-agents available, dispatch one reviewer per chapter in parallel, each writing `source-check-<chapter>.md` in the same format; then merge them into `source-check.md` with one STATUS line (`fail` if any part has a certain finding).

Fix every finding marked **certain**, rebuild, and re-run steps 6–7. Leave **disputed** findings unchanged for the user.

Steps 6–7 together get at most **3 fix rounds**. If gates still fail after round 3, stop and report what remains.

Done when `lykeion verify` shows source ✓ (or 3 rounds are spent).

## 8. Report

Tell the user, briefly:

- the Lecture Site path (and offer to open it);
- the gate results from `verify-report.md`, including anything skipped or still failing;
- every **disputed** finding, quoted with its page and Reference, for the user to decide;
- the Palette used.
