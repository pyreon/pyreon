---
'@pyreon/native-compiler': patch
---

`useClipboard()` had no type-gate coverage on either target.

The emit was fine, but neither `swift-stubs.ts` nor `kotlin-stubs.ts` declared
`PyreonClipboard` — so the per-fixture type gate could not compile a clipboard
app at all. Every attempt died on `cannot find 'PyreonClipboard' in scope`
before it could say anything about the emit, which is indistinguishable from
"the gate has no opinion", and was.

That is the same blind spot that hid `useDatabase`'s missing Swift argument
labels (#2514): a capability whose emit is never type-checked is a capability
whose emit is unverified, however clean the string looks. The gate's coverage
is only as wide as its stub table, and nothing tracked which hooks sat outside
it.

Both stubs mirror the REAL surface rather than being convenient: `copy` takes
no argument label on Swift, `copied` is read-only on both, and the Kotlin
constructor takes `(Context, CoroutineScope)` — the shape the emit hoists and
injects. Two tests assert the stubs REJECT a write to the read-only `copied`,
so they are load-bearing rather than decorative.

Bisect-verified: removing both stubs fails the two type-gate specs.
