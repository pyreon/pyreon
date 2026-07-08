---
"@pyreon/runtime-dom": minor
"@pyreon/compiler": minor
---

Universal VNode[] child mounting — a `VNode[]` (or single VNode) interpolated as a bare `{value}` child now mounts as real elements regardless of its source (prop, param, const-from-call, function return, literal, map), instead of stringifying to `[object Object]`.

Previously only an inline array-literal or a `.map()` const mounted; every other source hit the raw `textContent`/`_bind(.data =)` text path and stringified. The compiler now lowers general text children through three runtime helpers that detect a VNode/VNode[] value and mount it (falling back to text for primitives):

- static sole child → `_setChild(el, value)`
- static mixed/placeholder child → `_setChildAt(parent, placeholder, value)`
- general reactive child → `bindPolymorphicText(() => value, textNode, parent)`

Single-signal fast paths (`_bindText`/`_bindDirect` for `{sig()}`) are unchanged, so the common reactive-text case pays no new cost — verified perf-neutral against the krausest-style benchmark. Both compiler backends (JS + Rust native) emit byte-identical output.
