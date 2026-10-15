# Palettes come only from a curated library, never generated per run

A Lecture Site may only use a Palette from a Palette Library. The **bundled** library ships with the repo and holds only Palettes the maintainer approved on a Palette Specimen showing real components in light and dark themes. Users may add **personal** Palettes under their own config directory; those need no maintainer approval but must pass the same automated contrast and colour-vision checks. We rejected generating colours algorithmically (e.g. rotating hue in OKLCH) because colour harmony is part of reading quality and depends on the whole scheme (paper, ink, accent, highlight, data series) rather than any single accent, which a generator cannot judge. Per-subject distinction is kept by having the agent suggest a Palette the user has not used yet at the Outline stage.

## Consequences

- How many subjects can get distinct Palettes is bounded by the library size; growing the bundled library is a deliberate design step, not a runtime option.
- Every Palette is a full token set for both themes, so the runtime must never hard-code colours outside the tokens.
