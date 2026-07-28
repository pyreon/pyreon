---
'@pyreon/native-compiler': patch
---

`attrs(Text)` — the form the library actually exposes — emitted uncompilable
native code.

`@pyreon/attrs` is documented as `attrs(component)` chainable: in its own docs,
in CLAUDE.md, and in the multiplatform styling table. The native parser
accepted only `attrs({ component: Base })`, a config-object shape the runtime
does not require and no document showed.

The documented form fell through to the generic emit —
`private let Label = attrs(Text).attrs(__Obj0(…))` — and there is no `attrs`
function in Swift or Kotlin, so the native build failed with "cannot find
'attrs' in scope". Nothing warned. Anyone following the documented API got
uncompilable output; only someone who had read the COMPILER's internal
doc-comment would have written the shape that worked.

Fixed by accepting both forms rather than warning that the documented API is
unsupported: when the implementation and a reasonable documented API disagree,
the implementation is what should move. Both now lower identically, and a test
asserts they produce byte-identical emits so they cannot drift apart. The
existing non-primitive-base warning still fires in the bare form.
