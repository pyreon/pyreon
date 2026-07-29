---
'@pyreon/native-compiler': patch
---

An empty object literal `{}` emitted Void — silently on Swift.

Both emitters render a fieldless object as `()`, which on Swift is the empty
TUPLE, i.e. `Void`:

    signal({})                     Swift   @State private var u: Any = ()
                                           COMPILES. The value is Void, not an
                                           object. Nothing warned.
                                   Kotlin  cannot infer T — loud failure.

    signal<{ name?: string }>({})  Swift   @State private var u: CU = ()
                                           "cannot convert value of type '()'"
                                   Kotlin  same — loud on both.

So the shape was inconsistent ACROSS targets and silent on one of them, which is
the combination that ships broken apps: the author builds for iOS, sees green,
and the semantic break surfaces later or on the other platform.

Found by probing nine everyday authoring idioms against BOTH targets. Worth
recording that the other eight are clean on both — `&&` conditional children,
`.map` over a signal array, nested components with props, a handler taking a
parameter, template literals, computeds, `.filter().length`, and a ternary
between two DIFFERENT view types. This is a narrow gap in an otherwise solid
core, not a symptom of a broad one.

WARNED, NOT LOWERED, and deliberately. Emitting an empty struct would fix the
first shape and not the second: there the literal is empty while the TYPE
ANNOTATION carries the fields, so a struct synthesized from the literal would
drop `name` and the later `u().name` would fail regardless. Synthesizing from
the annotation is a real feature; a warning that names the shape and the fix is
what is honest to ship today.

Over-warning was MEASURED, not assumed — object literals are everywhere (every
hook config, every nested message map), so a false positive here would be worse
than the bug. Non-empty literals, spread-only literals, nested i18n message
maps, machine configs and defineStore setups all stay silent, each locked by a
test on both targets.

Bisect-verified: reverting fails the four warning specs with
`expected [] to have a length of 1` — zero warnings, the silent failure — while
all ten over-warning guards stay green.
