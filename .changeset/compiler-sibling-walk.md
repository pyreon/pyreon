---
"@pyreon/compiler": patch
---

perf(compiler): emit firstChild/nextSibling walks instead of children[N] for dynamic-element resolution

Compiled templates resolved each dynamic element via the live HTMLCollection /
NodeList indexed getter (`__root.children[N]` / `__root.childNodes[N]`). That
getter is measurably slower than direct pointer reads. The codegen now emits a
`firstElementChild`/`nextElementSibling` walk for `children[N]` and a
`firstChild`/`nextSibling` walk for `childNodes[N]` (the element-vs-node sibling
forms match each collection's text-node semantics exactly), matching SolidJS's
codegen for the same reason. Falls back to the indexed form past 8 hops, where
the chained reads outweigh the getter overhead.

Measured (real Chromium, drift-controlled, real `_tpl` + `_bindText` + signal
mounts): **~3.8% faster create** for rows resolving two dynamic cells, ~2% for a
single-cell row — pure compile-time, zero runtime cost, semantically identical
output. Both compiler backends (JS + Rust napi) emit byte-for-byte identical
code; all 1429 compiler tests pass including the 180 native-equivalence checks.
