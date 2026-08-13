---
"@pyreon/native-compiler": minor
"@pyreon/sync": minor
---

Lower `@pyreon/sync`'s `syncedSignal` to native (iOS + Android).

`const doc = new PyreonCrdtDoc()` + `const title = syncedSignal({ doc, key, initial })`
in shared `.tsx` now compile to a native `PyreonSyncedSignal` over a shared
`PyreonCrdtDoc` — scalar `string`/`number`/`boolean`, `title()` read + `title.set(v)`
write flowing 1:1 to the facade.

- **Swift**: the doc + signals are typed `@State` seeded in a GENERATED component
  `init()` (`_title = State(initialValue: PyreonSyncedSignal(doc: doc, …))`),
  because a synced signal's `@State` initializer references the doc and one
  `@State` cannot reference another at property init. Props thread through the
  init as parameters, so a component can still take props.
- **Kotlin**: sequential `remember { }` blocks (no init needed).

`@pyreon/sync` leaves `WEB_ONLY_PACKAGES` and declares a `nativeFrontend` (the
Yjs engine + IndexedDB/WebSocket transports stay web; cross-device transport is
tracked). Verified end-to-end: the emit type-checks against the real SwiftUI SDK
+ the real facade on macOS, and against the Swift/Kotlin validate stubs.
