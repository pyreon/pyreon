---
'@pyreon/compiler': patch
---

fix(compiler): the compiled SSR path emitted a `javascript:` URL that every other path blocked

`@pyreon/core`'s `URL_ATTRS` gained `xlink:href` to close a named vector — SVG's
URL attribute, whose qualified name is not `href`, so `<a xlink:href="javascript:…">`
inside inline SVG is clickable in every browser. The compiler mirrors that set
twice (`jsx.ts` for the JS backend, `native/src/lib.rs` for the Rust one) and
neither copy was updated, though both carried a "kept in sync" comment.

An attribute missing from the mirror is classified GENERIC and routed to
`_ssrAttrGen` — the lean SSR helper whose own docblock states it skips the
url-guard regex. Measured:

```
_ssrAttrGen("xlink:href", "javascript:alert(1)")  =>  xlink:href="javascript:alert(1)"
_ssrAttr   ("xlink:href", "javascript:alert(1)")  =>  ""   (blocked)
_ssrAttr   ("href",       "javascript:alert(1)")  =>  ""   (blocked)
```

So a user-controlled value in `<a xlink:href={…}>` reached the server-rendered
HTML verbatim, where the browser parses it before any framework code runs. The
h() SSR path, the client `applyAttrProp` path and the DOMParser sanitizer all
blocked it — one path of four shipped it. `ssrTemplate` is on by default
whenever `@pyreon/runtime-server` resolves, so this was the default path.

Both mirrors now carry the entry, and `ssr-url-attrs-identity.test.ts` locks
them to core's set in BOTH directions rather than by comment. Its behavioural
half runs `transformJSX` per `URL_ATTRS` entry and asserts none reaches
`_ssrAttrGen`; because `transformJSX` prefers the native binary, that half
exercises the Rust mirror too wherever the binary is built.
