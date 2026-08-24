---
'@pyreon/native-compiler': patch
---

The `kinetic()` factory shipped uncompilable native code instead of declining

A `const Box = kinetic('div').preset('fade')` fell through to the module-decl
catch-all and emitted the call verbatim:

```swift
private let Box = kinetic("div").preset("fade")   // error: cannot find 'kinetic' in scope
```

Kotlin the same. `kinetic()` animates by toggling CSS classes and driving rAF
over a real CSSOM, so having no native analogue is correct — but the decline
reached the user as a failed native build rather than a message.

The repo had already solved this shape twice: `createHttp()` metadata and
`defineTheme()` are both skipped for exactly this reason. kinetic needed one
extra step those two don't, because its binding is used as a JSX **tag**:
skipping alone leaves `<Box>` unresolved, so the tag now rewrites to the
canonical container — layout and children survive, the animation is dropped.

The warning names the binding, says what happened to the element, and points at
the animation that does cross (`<Transition show name>` from
`@pyreon/primitives`, which lowers to SwiftUI `.transition`/`.animation` and
Compose `AnimatedVisibility`).

Also corrects the native-coverage registry's rationale for `@pyreon/hotkeys`,
which still carried the "no native analogue on touch platforms" claim the
manifest stopped making.
