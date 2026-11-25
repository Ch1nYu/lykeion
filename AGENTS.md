# Working on Lykeion

1. Say what should work after the change and how you will check it. For a bug, record how to reproduce it before editing.
2. Use the sample under `fixtures/sample` for testing the engine. Use `docs/workflow.md` when making a lecture site.
3. Run the smallest affected test first. For heading and section links, run `node --test test/markdown.test.mjs`. For layout or browser navigation, also run `node --test test/render-gate.test.mjs`. Run `npm test` after changing shared code.
4. When handing off, record the result, the commands you ran, and any check still pending. If the renderer skipped a test, say what was skipped.

The Codex project hook runs the Markdown tests after an `apply_patch` edit to the builder, Markdown parser, or their test. It reports problems and leaves the edit in place. The same test command works in any agent.
