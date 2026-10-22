---
'@pyreon/native-compiler': patch
---

Native (Swift): a callback passed to a component's `on…` prop keeps its parameters. `<Pick onPick={(x) => v.set(x)} />` emitted `Pick(onPick: { v = x })` — the parameter was dropped, so `swiftc` failed with "cannot find 'x' in scope", with no warning. The emit routed every `on…` prop through the closure builder for SwiftUI action slots, which take no arguments. It now binds the arrow's parameters (`{ x in v = x }`, `{ dx, dy in … }`); a zero-parameter callback is unchanged, and Kotlin was already correct.
