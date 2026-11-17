---
'@pyreon/primitives': patch
'@pyreon/native-compiler': patch
'@pyreon/native-cli': patch
---

`<Transition easing="spring" bounce={…}>`: a physical spring on every target, using the SwiftUI definition. `duration` is the spring's response and `bounce` (0 to 1, default 0) is how far it overshoots.

- iOS emits `.spring(duration:bounce:)`.
- Android emits `spring(dampingRatio = 1 - bounce, stiffness = (2π / response)²)`, which is the same spring.
- The web runs a CSS `linear()` curve sampled from that spring, for as long as the spring takes to settle.

A dynamic `bounce` is named with a warning and falls back to no overshoot.

Also fixed: a `<Transition name="scale">` or any slide preset never imported its Compose `scaleIn` / `slideIn…` function, so the Android build failed with "Unresolved reference". The CLI now derives the import from the emit.
