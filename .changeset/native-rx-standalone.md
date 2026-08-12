---
'@pyreon/native-compiler': minor
---

Lower `@pyreon/rx`'s standalone transforms, not just the `rx.*` namespace

`import { filter, map } from '@pyreon/rx'` emitted itself verbatim and failed
the native build with `cannot find 'map' in scope`. Only the namespace form
(`rx.map(src, fn)`) lowered — and rx's own manifest reaches for the standalone
form **43 times** against 5 for the namespace, so the documented, dominant
idiom was the broken one.

The two are structurally identical — both source-first, `map(src, fn)` vs
`rx.map(src, fn)` — so the recognizer only had to accept the second callee
shape. It resolves through the IMPORT, never the bare name: `map`, `filter`
and `first` are names a user is overwhelmingly likely to have of their own,
and claiming them would silently rewrite their code. Aliased imports
(`map as project`) resolve; a user's own `map` is untouched.

`pipe()` deliberately does NOT lower, and declines by name. The natural emit
is an immediately-applied closure per stage, which discards the parameter's
type — compiled against both real toolchains it fails on each (Swift "value of
type 'Any' has no member 'count'", Kotlin "cannot infer type for type
parameter 'T'"). Inlining each stage by substituting its parameter would fix
it and is the follow-up; shipping the closure form meanwhile would have
emitted code that does not build. The transforms `pipe` composes DO lower, so
the advice names a real alternative rather than an escape hatch.

The emitted transforms are verified against real `swiftc` and `kotlinc`.
