---
'@pyreon/compiler': patch
---

fix(compiler): text fusion rendered HTML entities as literal characters

JSXText is HTML source — the parser decodes `&nbsp;` / `&amp;` / `&mdash;`
before those characters ever reach a DOM text node. That is why the unfused
path is correct by construction: the text is baked into the `_tpl` HTML string
and `_tpl` parses it via `innerHTML`.

Text fusion moved the same text into a JS string literal handed to
`bindPolymorphicText`, which assigns `Text.data` — an assignment that parses
nothing:

```
<span>&nbsp;items</span>       ->  _tpl("<span>&nbsp;items</span>")   correct
<span>{n()}&nbsp;items</span>  ->  _fuse(n(), "&nbsp;items")          literal
```

So an element that interpolated anything rendered the visible characters
`&nbsp;items`, while the same element without an interpolation was fine. On the
SSR arm `_escSole` escapes the `&` again into `&amp;nbsp;`, so the two halves of
a hydrating page disagreed as well. Affects `&nbsp;`, `&amp;`, `&mdash;`,
`&times;`, `&copy;` and every numeric entity.

Fusion now bails on any `&` in JSXText, falling back to the pre-fusion path.
The bail is deliberately conservative rather than an entity-shaped regex: a bare
`&` is harmless either way, HTML decodes some entities without the trailing
semicolon, and being over-broad here costs a rare fusion, never correctness —
`ssrSerializeChild` already bails on the same character for the same reason.
A `{'…'}` JS string literal child is unaffected: its characters are already
final, JSX does not decode it, so it still fuses.
