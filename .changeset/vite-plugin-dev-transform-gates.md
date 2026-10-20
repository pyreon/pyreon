---
'@pyreon/vite-plugin': patch
---

Faster dev transforms. The plugin's per-file passes no longer do full-source work on files that can't match:

- **Signal-name injection** (dev only) skips both its string/comment mask and its AST confirmation parse unless the module contains `signal(`, `computed(` or `effect(`. The parse is now lazy, so it runs only when a regex hit needs confirming.
- **The JSX auto-import scan** tests the raw source before masking. A file that uses none of the auto-importable primitives skips both masks.
- **The `innerHTML` sanitizer check, the signal-export registry scan and the HMR signal detection** check for their literal keyword before scanning.

Masking only blanks characters, so a substring absent from the source can't appear in the masked text, and output is unchanged by construction. Across 775 real `.tsx` files from the repo's examples, docs and UI packages, the dev `transform` hook went from about 310ms to about 165ms per pass (−47%), with byte-identical output.
