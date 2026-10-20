---
'@pyreon/vite-plugin': patch
---

Faster dev transforms. The plugin's per-file passes no longer do full-source work on files that can't match:

- **Signal-name injection** (dev only) skips both its string/comment mask and its AST confirmation parse unless the module contains `signal(`, `computed(` or `effect(`. The parse is now lazy, so it runs only when a regex hit needs confirming.
- **The JSX auto-import scan** tests the raw source before masking. A file that uses none of the auto-importable primitives skips both masks.
- **The `innerHTML` sanitizer check, the signal-export registry scan and the HMR signal detection** check for their literal keyword before scanning.

Masking only blanks characters, so a substring absent from the source can't appear in the masked text, and output is unchanged by construction. Across 775 real `.tsx` files from the repo's examples, docs and UI packages, the dev `transform` hook went from about 310ms to about 165ms per pass (−47%), with byte-identical output.

The two source maskers (`_maskSource` for build-mode collapse and `_maskStringsAndComments` for signal injection) now build their output from slices: one newline-preserving blank per masked run instead of one array push per character. A 300,000-case differential fuzz against the previous implementation found zero mismatches. Build-mode `transform` went from about 135ms to about 85ms per pass over the same corpus, again with byte-identical output.
