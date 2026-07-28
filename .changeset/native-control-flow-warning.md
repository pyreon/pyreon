---
'@pyreon/native-compiler': patch
---

Half the documented control-flow vocabulary silently emitted uncompilable
native code.

`docs/multiplatform.md` listed eight as supported. Measured against the Swift
stub type-check:

    lowers    <Show> · <For> · <Suspense> · <ErrorBoundary>
    does NOT  <Switch>/<Match> · <Dynamic> · <Portal>

The four that do not fall through to the generic component emit, which
reproduces the tag verbatim — `Switch { Match(when: …) { … } }`, `Portal { … }`
— and SwiftUI has no such view, so the native build fails with "cannot find
'Switch' in scope". Nothing warned, so the first sign was a device build
failing.

`<Index>` is worse than uncompilable: the render callback is stringified INTO a
Text, `Text(verbatim: "\({ x in … })")`. Nonsense rather than an error, which
is the harder failure to notice.

Each now warns at compile time, on both targets, with a CONCRETE alternative —
nested `<Show>` for `<Switch>`, `<Modal>` for `<Portal>`, `<For each by>` for
`<Index>` — and lists the four that do lower, so the author can pick rather
than guess.

Warnings rather than four lowerings: `<Dynamic>` needs AnyView-style erasure,
and `<Portal>` is a category error on native (sheets and dialogs are a
different model — which the styling table already recorded as web-only, while
the control-flow list disagreed with it). The doc row is corrected to say which
four work and which four warn.
