---
name: lykeion
description: Lecture slides → a verified, interactive single-file teaching site (Lecture Site) with Labs, quizzes and source-checked content. Use when the user wants course slides or lecture PDFs turned into a study / teaching web page (做成講堂、教學網頁、講義網站), or wants a chapter added to or rewritten in an existing Lecture Site (a folder with lykeion.json).
disable-model-invocation: true
---

# lykeion

`<repo>` is the folder holding this `SKILL.md` — the skill's own directory; in Claude Code that is `~/.claude/skills/lykeion`, and `npx skills list -g` prints the path. Resolve it once and run every command through it: `node <repo>/bin/lykeion.mjs <command>`. The CLI needs Node 22.13 or newer; it prints that and exits if the host Node is older.

Follow `docs/workflow.md` from step 1, in order; it points to every other file you need (`references/`, `docs/content-format.md`). Use the vocabulary of `GLOSSARY.md` when talking to the user.

Claude Code specifics:

- Read PDFs' page images (`pages/<pdf>/p-NNN.png`) with the Read tool; it shows figures and formulas.
- Step 4 can use sub-agents here, since Claude Code provides them. Steps 7 and 8 always use a sub-agent here, since Claude Code can start one; `docs/workflow.md` says what a host without sub-agents does.
- Ask the Depth and the Outline approval as questions to the user, and wait for the answers.
