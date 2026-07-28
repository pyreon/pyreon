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

Auditing the rest found NINE more shipped runtime types missing from one stub
file each — Geolocation, MapState, Payments, PushNotifications and WebSocket
have no Swift stub; Haptics, Linking, Notifications and Share have no Kotlin
one. Clipboard was one of ten. That is the mechanism behind a recurring
pattern here: emit bugs reaching the DEVICE gate (minutes of CI, or a nightly)
when a per-fixture type-check (seconds) should have caught them.

A ratchet now locks it. `stub-coverage-ratchet.test.ts` enumerates every
`Pyreon*` type the emitters construct, keeps the real framework ones (a
same-named runtime source file exists — a structural discriminator, not a
hand-maintained denylist), and asserts each is stubbed on both platforms. The
nine gaps sit in `KNOWN_UNCOVERED` and may only SHRINK; a new capability
without a stub fails immediately, and an entry that has since gained a stub
must be deleted or the test fails as stale.

Not filled in bulk on purpose: a stub must mirror the real surface EXACTLY,
because a superset stub is itself a masking source. Nine surfaces is nine
careful readings of a runtime file, and doing them badly would be worse than
the gap. What must not happen meanwhile is the list growing silently.

Bisect-verified twice: removing both clipboard stubs fails the two type-gate
specs; removing the Swift one alone makes the ratchet name
`PyreonClipboard (missing: swift)`.
