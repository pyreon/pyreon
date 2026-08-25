---
'@pyreon/toast': patch
'@pyreon/native-compiler': patch
---

Two bugs the device gates found, both invisible to every other check

**`LocalPyreonRouter.current` is nullable.** The `useUrlState` lowering passed it
into a synthesized `PyreonUrlState(router: PyreonRouter, …)`, so a real
`gradle assembleDebug` failed with
`actual type is 'PyreonRouter?', but 'PyreonRouter' was expected`. The Kotlin
stub typed the CompositionLocal non-null and hid it. The synthesized classes now
take `PyreonRouter?` and safe-call it, exactly as router-kotlin's own hooks do
(`router?.push(path)`), and the stub is nullable so the same mistake fails
locally.

**`PyreonToast.swift` used a bare `Task`.** That file is compiled INTO the app
target, so an app with its own `Task` model shadows Swift's concurrency type and
the bare name resolves to the user's struct — `argument type '_' does not
conform to expected type 'any Decoder'`. A tasks app is exactly the app that has
one. Now `_Concurrency.Task`, which is what the emitter already writes for this
reason; the shipped runtime did not, and nothing compiled it until it was put in
a gated app.
