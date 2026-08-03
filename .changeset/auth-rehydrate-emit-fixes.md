---
'@pyreon/native-compiler': patch
---

Fix three emit bugs that made the natural session-rehydration and form-submit shapes uncompilable on both native targets.

- **Service method returns are now typed.** `SERVICE_OPTIONAL_FIELDS` typed member reads on the service containers but nothing typed their METHOD returns, so `const token = secrets.read('k')` inferred as unknown and the optional-condition lowering never fired: `if (token)` emitted a bare optional as the condition, which swiftc rejects ("optional type 'String?' cannot be used as a boolean") and kotlinc rejects ("condition type mismatch"). A new `SERVICE_METHOD_RETURNS` table types `secureStorage.read` as `string | null`.
- **Swift lowers a bare-identifier optional condition to the `if let` BINDING**, not just a nil-test. `if token != nil` leaves the then-body reading `String?` where `String` is expected, so the rehydrate shape `if (token) { auth.signInSucceeded({ name: token }) }` still failed on the argument. The then-body now emits with the local narrowed to its unwrapped type. Kotlin needs no twin — it smart-casts a val local by language rule — but its emitter narrows the same way so type-dependent emits agree.
- **`onSubmit: (values) => values.username` now lowers to the dictionary lookup.** `PyreonForm` hands the callback a string-keyed map, and the identical rewrite already existed for `form.values().username`; the submit parameter was missing it, so the member access passed through verbatim and compiled on neither target. Hidden because every gated app named the parameter `_values` and never read a field off it.

Also brings the Swift `PyreonForm` validation stub up to the real runtime's surface (`values`, `touched`, `setFieldValue`, `validateField`, `validateAll`, `isValid`, `reset` were missing), which was failing form shapes the real toolchain accepts — the subset-stub-manufactures-failures half of the stub-fidelity rule.
