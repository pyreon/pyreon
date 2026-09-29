---
'@pyreon/zero-content': minor
'@pyreon/lathe': patch
---

Drop four runtime dependencies from `@pyreon/zero-content` in favour of small first-party implementations: `gray-matter` (frontmatter split + parse), `fast-glob` (the `src/mdx/` scan), `unist-util-visit` (the remark-plugin tree walker) and `mdast-util-to-string` (declared but never imported). YAML is now read by `yaml` — the parser `@pyreon/lathe` already ships — with timestamps and `<<` merge keys enabled as js-yaml had them, and the 214 pages of the docs site compile byte-identically before and after.

Behaviour changes, all at the edges: numbers follow YAML 1.2 (`010` → 10 not 8, `1:30` and `1_000` stay strings); `---js` frontmatter is refused instead of `eval`ed; frontmatter that is not a mapping (a bare scalar, a list) throws with a clear message instead of becoming the page's `data`; a control character inside a `#` comment or a DEL inside quotes now throws; the `src/mdx/` scan returns files in sorted order and does not follow a symlink back to its own ancestor. `parseFrontmatter` is exported from `@pyreon/zero-content/plugin` so page emitters can test against the reader that consumes their output; `@pyreon/lathe`'s docs tests now do.
