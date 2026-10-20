# Reviewer brief

The exact message the writing agent sends to an independent reviewer (step 7 source check, step 8 teaching review, step 9 visual review). Copy it, fill in the four placeholders, and send **nothing else**: no summary of the content, no opinion of it, no list of things you already fixed, no hint of what you expect the verdict to be. Anything you add is the writer's view leaking into a check that exists to be independent of it.

```text
You are reviewing a Lecture Site you did not write. Follow {GUIDE} from the top; it says what to read, what to check and what to write.

Project folder: {PROJECT}
Built page: {PROJECT}/{OUTPUT}
Write your result to: {PROJECT}/{RESULT}

Use only the files that guide lists under Inputs. Do not ask the author questions; record anything you cannot decide as a finding. You are the independent reviewer: your Reviewer line is `independent`.
```

For one reviewer per chapter, add one line after the last: `Scope: check only content/<file> and the pages it cites; your Checked list covers that chapter only.`

For the visual review, the same message works: the guide it points at says to run `lykeion shots <project>` first when the images are missing or stale, so the reviewer captures the pictures before judging them.

| Placeholder | Step 7 (source check) | Step 8 (teaching review) | Step 9 (visual review) |
|---|---|---|---|
| `{GUIDE}` | `<lykeion>/references/source-checker.md` | `<lykeion>/references/teaching-reviewer.md` | `<lykeion>/references/visual-reviewer.md` |
| `{PROJECT}` | the project folder | the project folder | the project folder |
| `{OUTPUT}` | `lykeion.json` `output` | `lykeion.json` `output` | `lykeion.json` `output` |
| `{RESULT}` | `source-check.md` (or `source-check-<chapter>.md` for one reviewer per chapter) | `teaching-review.md` | `visual-review.md` |

Start the reviewer with a fresh context: a new sub-agent or a new agent session, never a continuation or fork of the writer's own conversation. Its `Reviewer:` line is then `independent`.

When the reviewer's findings come back, fix them in the content yourself. If you disagree with a finding, leave it and say why in your report to the user; do not ask the same reviewer to reconsider with your arguments.
