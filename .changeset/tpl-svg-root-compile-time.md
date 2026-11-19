---
'@pyreon/runtime-dom': minor
'@pyreon/compiler': patch
---

The compiler now decides whether a template is rooted at a bare SVG element, so client bundles no longer carry an SVG tag table.

A compiled template rooted at `<g>`, `<path>`, `<linearGradient>` or any other SVG element outside an `<svg>` has to be parsed inside an `<svg>` wrapper, or the browser builds inert HTML elements that draw nothing. The runtime used to recognise those templates by looking the root tag up in an 80-name table that every app shipped. The compiler (both the Rust and the JS backend) now does the lookup at build time and passes it to `_tpl` as flag `2` in its third argument, which is now a bit set (`1` still marks a re-mountable component child, so both together are `3`). About 380 B gzip comes off every client bundle.

Breaking only for hand-written `_tpl()` calls, which are documented as compiler-only: an SVG-rooted template string now needs the flag (`_tpl('<g>…</g>', bind, 2)`); without it the string parses as HTML. Code compiled by the matching `@pyreon/compiler` needs no change.
