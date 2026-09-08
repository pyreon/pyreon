---
'@pyreon/native-compiler': minor
'@pyreon/flow': patch
---

PMTC: a top-level helper now infers against the file's structs, and the `Double` alias unifies with a numeric literal

`buildInferenceCtx`'s struct table is built PER COMPONENT, and both emitters
only assigned their inference context per component too. A file of pure
top-level helpers — which is exactly what a generated engine is — emitted every
expression against an EMPTY context: a member read typed as `unknown`, so every
inference-driven lowering silently skipped inside helper bodies.

Seeding a file-scope baseline was measured as NOT free on a first attempt: it
made two sites of the generated chart engine stop compiling. The cause was one
level down and is fixed here — the `Double` / `Float` alias arrives as an
unresolved `typeRef`, and any unification comparing `kind`s read it as unrelated
to `number`. The `binary` case already normalized it; the ternary and unary
cases did not, so `cond ? 1.0 : someDouble` degraded to `unknown` and took every
downstream type-gated lowering with it. The normalization is now shared, so the
three cannot disagree about whether `Double` is a number.

Net effect on the generated chart engine: **91 redundant `Double(...)` wraps
removed**, 29 rearranged, and it type-checks clean — those wraps are the ones
the emitter's own comments call out as blowing swiftc's expression budget.

`@pyreon/flow` takes one source change the improved inference surfaced: the
handle lookups bind through a non-optional local instead of `handles?.[0]`,
which Swift's safe-index lowering cannot express (it names the receiver twice)
and had been emitting as an UNGUARDED index that traps out of bounds.
