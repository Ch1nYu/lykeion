# Fixtures

- `sample/` — public, original content covering every content component. Used by tests and the Palette Specimen.
- Private Acceptance Fixtures (e.g. copyrighted course slides) never live in this repo (ADR 0003).
  Point to them from `~/.config/lykeion/config.json`:

```json
{ "fixtures": { "my-course": "/path/to/private/fixture-dir" } }
```
