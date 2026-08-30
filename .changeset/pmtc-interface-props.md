---
'@pyreon/native-compiler': minor
---

Resolve an `interface` props type the way the equivalent `type` alias already
resolved.

A component whose props type was declared as an `interface` emitted a struct
with no stored properties while its body still referenced them — uncompilable
on both targets. The struct synthesizer already understood the interface and
emitted it; only the props extractor ignored interfaces, so the two halves of
the compiler disagreed about the same declaration. `interface` is the idiomatic
TypeScript spelling for props, so this was the shape most likely to be written
and least likely to work.

The out-of-subset gate is unchanged: generic, `extends` and method-bearing
interfaces are still declined, by the same predicate the synthesizer uses.
