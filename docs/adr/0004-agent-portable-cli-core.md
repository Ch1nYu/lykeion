# Deterministic work lives in a Node CLI; agent-specific files are thin entry points

v1 targets Claude Code, but support for other agents (Codex, Cursor, …) is an explicit future goal. Every deterministic step is therefore a `lykeion` CLI command (`extract`, `build`, `verify`, `palette`), and the agent only writes content and makes judgements. PDF extraction uses `pdfjs-dist` (per-page text plus a PNG of each page rendered through the bundled browser) instead of relying on Claude's ability to read PDFs, so an agent that can only read text and images still works. The workflow is described once in `docs/workflow.md`; `SKILL.md` and a future `AGENTS.md` only point to it. Parallel chapter writing with sub-agents is an optimisation: the workflow must also run sequentially and produce the same kind of result.

## Consequences

- One extra dependency (`pdfjs-dist`), and page images reuse the Playwright browser rather than a native canvas module.
- Anything an agent must do that a script could do is a bug in the CLI, not a line in `SKILL.md`.
