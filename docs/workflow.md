# lykeion workflow

The agent-neutral procedure for turning lecture slides into a verified Lecture Site. Vocabulary: `GLOSSARY.md`. Every deterministic step is a `lykeion` command (`node <repo>/bin/lykeion.mjs`); the agent writes content and makes judgements.

Two modes:

- **New** — no `lykeion.json` yet for these slides.
- **Incremental** — a project exists and the user wants a chapter added or rewritten. Run steps 2–8 for the affected chapters only; steps 6–7 always cover the whole site.

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

4. New mode: `lykeion init <pdf...> --title <title> --pages <a-b> ... --depth <depth>`. It creates `<pdf dir>/lykeion/` and suggests an unused Palette.

Done when `lykeion.json` exists with the Scope and Depth the user confirmed.

## 2. Extract

`lykeion extract --project <project>` writes `pages/<pdf>/p-NNN.txt` and `p-NNN.png` for every Scope page.

Some PDFs carry a broken character map: the page renders correctly but its text layer reads 「穌的的一一個」 for 「耶穌的第一個」. Extract detects this from the fonts, prints a ⚠ line naming the affected pages, and records them as `suspect` in `pages/index.json`. For those pages the `.png` is the source of truth; never quote their `.txt`.

Done when every Scope page has a `.txt` and a `.png`.

## 3. Outline

Read every Scope page: the `.txt` for wording, the `.png` whenever the slide carries a figure, table, tree or formula (text extraction loses layout and maths). Then write `<project>/outline.md` following `references/outline.md`.

For a Scope larger than about 40 pages you may use sub-agents when the host offers them: dispatch one drafter per PDF (or page block) in parallel, each writing its chapter's part of the Outline from `references/outline.md`, then merge the parts into `outline.md` yourself and check that the parts together cover every Scope page. Without sub-agents, draft the Outline yourself, one block at a time, to the same bar.

Done when every Scope page is assigned to a section in the Outline, each section has its planned Labs, quiz items and `calc` targets, and the Outline names one Palette from `lykeion palette list`.

Show the Outline to the user and wait for approval — the cheapest moment to change direction. Skip the wait only when the user said to proceed without review. Record the approved Palette: `lykeion palette use <title> <id>`, and set it in `lykeion.json`.

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

## 7. Source check

Have the built content compared with the cited pages and the References, and record the result in `<project>/source-check.md`.

Prefer a reviewer with fresh context: a sub-agent, or another agent session the host provides. For a site with several chapters you may dispatch one reviewer per chapter in parallel, each writing `source-check-<chapter>.md` in the same format, then merge them into `source-check.md` with one STATUS line (`fail` if any part has a certain finding).

When no such reviewer exists, review it yourself: re-read `references/source-checker.md` from the top first, and record that — `source-check.md` states its reviewer in the header (`Reviewer: independent`, or `Reviewer: self (no sub-agent available)`), and `lykeion verify` repeats which one in the source gate, as ⚠ for a self-review. A self-review is allowed; passing it off as an independent one is not.

Fix every finding marked **certain**, rebuild, and re-run steps 6–7. Leave **disputed** findings unchanged for the user.

Steps 6–7 together get at most **3 fix rounds**. If gates still fail after round 3, stop and report what remains.

Done when `lykeion verify` shows source ✓ (or 3 rounds are spent).

## 8. Report

Tell the user, briefly:

- the Lecture Site path (and offer to open it);
- the gate results from `verify-report.md`, including anything skipped or still failing, and whether the source check was independent or a self-review;
- every **disputed** finding, quoted with its page and Reference, for the user to decide;
- the Palette used.
