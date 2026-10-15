# Personal data and copyrighted fixtures live outside the repo

The repo is intended to be public, while its first and main user builds Lecture Sites from copyrighted course slides. So the repo holds only code, the runtime, bundled Palettes and docs. Everything personal lives in the user config directory (`~/.config/lykeion/`): the subject-to-Palette registry, personal Palettes, defaults, and the paths to private acceptance fixtures. No absolute path may appear in code. The acceptance test that defines "good enough" (the Data Mining midterm, baseline 82/100) therefore runs only on the maintainer's machine, configured by path. A public demo and CI need separately sourced material whose licence allows adaptation (e.g. OpenStax, CC BY).

## Consequences

- Contributors cannot reproduce the maintainer's acceptance run; until a public fixture exists, regressions are caught only locally.
- Generated Lecture Sites are written next to their Primary Source, never into the repo.
