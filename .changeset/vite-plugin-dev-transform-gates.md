---
'@pyreon/vite-plugin': patch
---

Faster dev transforms. The plugin's per-file passes no longer do full-source work on files that can't match:

- **Signal-name injection** (dev only) skips both its string/comment mask and its AST confirmation parse unless the module contains `signal(`, `computed(` or `effect(`. The parse is now lazy, so it runs only when a regex hit needs confirming.
- **The JSX auto-import scan** tests the raw source before masking. A file that uses none of the auto-importable primitives skips both masks.
- **The `innerHTML` sanitizer check, the signal-export registry scan and the HMR signal detection** check for their literal keyword before scanning.

Masking only blanks characters, so a substring absent from the source can't appear in the masked text, and output is unchanged by construction. Across 775 real `.tsx` files from the repo's examples, docs and UI packages, the dev `transform` hook went from about 310ms to about 165ms per pass (−47%), with byte-identical output.

The two source maskers (`_maskSource` for build-mode collapse and `_maskStringsAndComments` for signal injection) now build their output from slices: one newline-preserving blank per masked run instead of one array push per character. A 300,000-case differential fuzz against the previous implementation found zero mismatches. Build-mode `transform` went from about 135ms to about 85ms per pass over the same corpus, again with byte-identical output.

The plugin's two `oxc-parser` call sites (the signal-name confirmation parse and the AST rewrites) now use oxc's raw-transfer decoding when the runtime supports it (Node 22+ / Deno 2+, 64-bit). That replaces a JSON round-trip of the whole AST and is 3–4× faster per parse. The ASTs are deep-equal, verified over 1,271 repo files. Bun and older Node keep the default path, because the option throws there. Under Node, across all the changes in this release, the dev `transform` went from ~685ms to ~410–440ms and build from ~450–465ms to ~368ms per pass, with byte-identical output.
