---
'@pyreon/compiler': patch
'@pyreon/core': patch
---

Text fusion: a static-text run around an interpolation — `<p>Hello {name}!</p>`,
`<td>{a}{b}</td>`, `<li>{n} items</li>` — now compiles to ONE accessor child,
`() => _fuse("Hello ", name(), "!")`, on every emit path (the `_tpl` client
template, the `_ssr` fast path, and the h() path). The element is then the
sole-accessor-child shape the framework already renders and hydrates without
`<!--$-->…<!--/$-->` range markers: SSR emits one text node, hydration adopts
it in place, and every later update writes `.data` on that same node. Before
this the same element carried one marker range PER interpolation, and the
`$`-marker normalization those ranges force was the single largest item in
the hydration walk (~20% of it on the 1,000-row bench) — the cost Vue never
pays because `{{a}}{{b}}` is one text child there.

`_fuse` (new in `@pyreon/core`, compiler-emitted) keeps Pyreon's polymorphic
text semantics: null/undefined/false contribute nothing and numbers/`true`
stringify exactly as a lone `{x}` does, and the moment ANY part is a VNode,
array or function it returns the PARTS ARRAY, which `bindPolymorphicText` mounts
as a subtree (and swaps back to text later) and `renderNode` renders — nothing
is ever coerced to "[object Object]". The fusion boundary is exact and identical
in both compiler backends: DOM elements only, children that are only text and
text-position expressions, at least two parts and at least one reactive one. A
lone `{sig()}` keeps its single-signal direct-tier binding, a static-only mix
keeps its baked shape, and anything the template routes to a mount slot
(`props.children`, an in-file JSX helper call, inline JSX, an element-valued
const) or a component parent is untouched.

A project whose `@pyreon/core` is older than its `@pyreon/compiler` fails its
build with `"_fuse" is not exported by @pyreon/core` — the packages release as a
fixed group; `pyreon upgrade` aligns them (a diagnose-catalog entry teaches it).
