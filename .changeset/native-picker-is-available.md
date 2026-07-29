---
'@pyreon/native-compiler': patch
---

`isAvailable()` was documented on the shared picker surface and implemented on one of three targets.

`UseImagePickerResult` and `UseFilePickerResult` both declare
`isAvailable: () => boolean`, and their own JSDoc already specifies the native
behaviour — "Native: always `true` — the runtime's `pick` collapses an
unavailable picker to `null`." Neither native runtime had the method.

So `if (picker.isAvailable()) { … }` — an ordinary defensive guard, and valid
TypeScript on web — failed BOTH native targets with ZERO warnings:

    Swift    value of type 'PyreonImagePicker' has no member 'isAvailable'
    Kotlin   unresolved reference 'isAvailable'

Documented-but-unimplemented, which is the `audit-types` class: the field IS
referenced by the type surface, so nothing flagged it, and the failure appears
only if someone writes the guard AND builds for native.

IMPLEMENTED rather than warned, because the documentation already specified the
answer and it is a true one — these pickers really are always available
natively. Warning people off a documented method would have been the wrong
shape.

On Kotlin, returning `launcher != null` was considered and REJECTED. It is
arguably truer there (the launcher is null until composition wires it), but it
would make the same call return different answers on iOS and Android for the
same source — a new cross-target divergence, which is the class of bug this
method exists to close. The unwired case is already handled: `pick()` resolves
null.

Found by sweeping the async platform-API tier. Worth recording that the tier is
otherwise HEALTHY — the matrix calls the `await hook.method()` lowering "the
keystone for the whole async-platform-API tier", and awaiting a picker,
awaiting biometrics, branching on the result, two SEQUENTIAL awaits, and an
await nested inside an `if` all compile on both targets. This one member was the
only gap.

VERIFICATION, with its limit stated: the REAL Swift runtime BUILDS (`swift
build` compiles both pickers), which is stronger than the stub gate. The Kotlin
half is stub-verified only — `verify-kotlin` covers `PyreonStorage`, and the
pickers import `androidx`, so they are excluded from the local runner by
design. The change adds no new imports, so it cannot trip the
conditional-import class; the real Android build remains the true gate there.

Bisect-verified: removing ONE of the two stub occurrences (the "only one picker
updated" shape, which is exactly how this bug shipped) fails the parity spec
with `expected 1 to be 2`.
