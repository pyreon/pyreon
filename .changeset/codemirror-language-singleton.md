---
'@pyreon/code': patch
---

Pin `@codemirror/language` to a single version. It hosts both the `Language` facet and `syntaxHighlighting`, so two resolved copies mean the highlighter never recognises the parser's tree — the editor mounts, the text renders, and nothing is coloured, with no error anywhere. The lockfile carried 6.12.3 alongside 6.12.4, which only bit on a clean install (a warm local tree that happened to dedupe never showed it). Its siblings `@codemirror/state` and `@codemirror/view` were already pinned in the root `overrides` for exactly this reason; `@codemirror/language` simply was not. A browser spec now asserts the single-instance invariant directly, so a future dependency-graph regression fails by name instead of as unexplained missing highlighting.
