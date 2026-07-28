---
'@pyreon/native-compiler': patch
---

The 28 hooks the compiler claims lower natively were never verified. Three defects.

`NATIVE_LOWERED_HOOKS` is the allowlist that suppresses the "no native lowering"
warning, so every name in it is an implicit promise that the hook emits
compilable code on both targets. The warning arc verified the 38 hooks that do
NOT lower; nothing verified the 28 that supposedly do. Probing all 28 against
both type-checkers found three defects, each of a different kind:

**`useFetch` without a response type — emit bug, iOS only.** No generic lowers
to `decode(Any.self, …)`, and `Any` cannot conform to `Decodable`. Kotlin
compiles either way. Now warns, naming the typed form. Not rewritten to infer a
type: there is no sensible default for a response shape, and the typed form is
already the documented one.

**`useStorage` scalars — gate hole.** Scalars lower to SwiftUI's own
`@AppStorage`; a struct value routes to the runtime's Codable
`@PyreonAppStorage`. Only the latter was stubbed, so the COMMON path was outside
the type gate entirely while the uncommon one was covered. The stub now mirrors
SwiftUI's real constrained overloads rather than a loose generic — a permissive
`<Value>` would mask an emit that ever sent an unsupported type to `@AppStorage`.

**`usePermissions` — stub bug, in the INVERSE direction of the usual one.** The
real init defaults its parameter on both targets; both stubs required one, the
Swift stub took an Array where the real type takes a Set, and the Kotlin stub
renamed the parameter and typed the property as a plain Set where the real one
is Compose `MutableState`. Three divergences, all strict. **The emit was
correct and the gate was wrong.** The documented trap is a superset stub masking
breakage; this is the mirror image, and it fails in a way that looks like an
emit bug. Latent only because no fixture used the hook.

The through-line, again: each hook is exercised by an example along ONE shape,
and the other shapes were never compiled. `useFetch` is device-proven — with a
generic. `useStorage` is device-proven — through the struct path. Device
evidence covers the path the example takes, not the API surface.

Locked by a permanent test over the whole allowlist, with the three exclusions
(`useNativeModule`'s user-supplied FFI class, `useLoaderData`, `useSecureStorage`)
named with rationales rather than quietly omitted, and a count assertion so a
new hook cannot be added to the allowlist silently.
