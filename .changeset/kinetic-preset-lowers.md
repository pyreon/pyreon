---
'@pyreon/kinetic': patch
'@pyreon/native-compiler': patch
---

A `kinetic().preset()` chain now animates on iOS and Android

The preset is what makes this possible: it NAMES an animation both targets
already know, so the box lowers through the same `<Transition>` path the
primitive uses — presets, durations and both emitters, all already verified.
None of the animation is re-implemented.

What it needs that a primitive does not is a TRIGGER. Rewriting to
`<Transition show={true}>` is the obvious move and is wrong: it compiles and
never animates, because `.animation(_:value:)` watches a constant and
`AnimatedVisibility(visible = true)` starts visible. So the enter is driven by a
synthesized flag that flips on mount, reusing the on-mount harness — which also
carries the SwiftUI stable-identity host an `.onAppear` needs.

```swift
@State private var __kineticIn: Bool = false
… .transition(.opacity).animation(.default, value: __kineticIn)
  .onAppear { __kineticIn = true }
```
```kotlin
var __kineticIn by remember { mutableStateOf(false) }
LaunchedEffect(Unit) { __kineticIn = true }
AnimatedVisibility(visible = __kineticIn, enter = fadeIn(…))
```

A chain with NO `.preset()` has no animation vocabulary to carry across, so it
still degrades to a plain container and warns by name. `<Transition name>` from
`@pyreon/primitives` remains the portable spelling.

Native app-runtime coverage: 35/37 → 36/37.
