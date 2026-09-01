---
'@pyreon/zero-content': patch
---

Stop dropping text from rendered markdown — three independent causes.

**1. `~~strikethrough~~` was dropped.** It parses to an mdast `delete` node,
which `emit-jsx` had no arm for, so it fell to the unhandled-node default —
which drops the subtree. Pages that write `~~the old claim~~ Here is why it no
longer holds` rendered the explanation with its subject missing.

**2. A single `~` meaning "approximately" could strike out whole paragraphs.**
GFM's default treats `~x~` as strikethrough, so two "approximately" figures in
one paragraph paired up and wrapped everything between them — across line
breaks — in a `delete` node, which cause 1 then dropped. `remark-gfm` now gets
`singleTilde: false`; `~~text~~` is unaffected.

**3. `remark-directive` claimed `:word` in ordinary prose.** An inline text
directive was also unhandled, so `display:none` lost `none` and `map 1:1 to
every target` lost a `1`. Inline (`:name`) and leaf (`::name`) directives now
render as the source text — the container (`:::name`) forms the callouts and
code groups use are untouched.

Measured across Pyreon's own docs: 11 of 207 pages were dropping text, and the
compiler had been warning about every one of them on every build.
