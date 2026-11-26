---
'@pyreon/cli': patch
'@pyreon/testing': patch
'@pyreon/connector-document': patch
'@pyreon/document': patch
'@pyreon/flow': patch
'@pyreon/meta': patch
'@pyreon/mcp': patch
---

Docs drift fixes (#4307), plus a new `pyreon doctor` doc-claims check.

- cli: the doc-claims gate reports `doc-claims/unknown-document-format`: a `render(x, '<format>')` example in a docs page, README or package manifest whose format `@pyreon/document` does not register (neither an `OutputFormat` literal nor registered with `registerRenderer` in the same example).
- connector-document: the README and manifest quick start render Markdown with `'md'` (`'markdown'` rejects with "No renderer registered").
- document: the docs no longer describe the renderers as vendored into a ~14 MB `lib/`. Since 0.52 the four engines are optional peers, and the default PDF font comes from the installed `pdfmake`.
- testing: the `expectSignal` JSDoc example and the testing guide count the first computation (`toHaveRecomputedTimes(2)` after one write).
- flow / meta: the layout engine is built in. The docs no longer say elkjs lazy-loads, or that "ELK" ignores options.
