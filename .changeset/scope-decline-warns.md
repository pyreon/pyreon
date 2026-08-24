---
'@pyreon/native-compiler': patch
---

A component-body-only lowering now declines by NAME at module scope

`createMachine` / `createI18n` / `syncedSignal` lower to native only inside a
component body — they become a `remember {}` / an `@State`, which has no meaning
at file scope, so their recognizers are unreachable from the module-scope walk.

A module-scope declaration therefore fell through to the module-decl catch-all,
which printed the call VERBATIM into Swift/Kotlin with zero diagnostics. The
native build then failed naming a function the user never wrote in that
language, with nothing pointing at the real problem — which was only ever the
placement.

The warning now says exactly that: the shape is right, the scope is not, move it
into the component. A generic "unsupported" would send someone hunting for a
missing feature that is in fact implemented one scope down.
