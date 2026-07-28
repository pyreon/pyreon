---
'@pyreon/native-compiler': patch
---

Optional service fields rendered `Optional(37.3349)` on iOS instead of `37.3349`.

Not a missing feature — the opposite, which is why it survived. BOTH emitters
already render an optional interpolation web-equivalently (Swift
`\((x).map { "\($0)" } ?? "")`, Kotlin `${x ?: ""}`), but the guard is
`typeIsOptional(inferType(...))` and inference had no field model for the
service containers. So every optional service field fell through as
non-optional and emitted a RAW interpolation.

Measured before the fix: `geo.latitude`, `geo.longitude`, `f.error`,
`w.lastMessage`, `p.purchasing` and `m.selectedMarkerId` ALL emitted raw — i.e.
every optional field of every service container, which is the most common way
to display service state. Swift renders those as `Optional(…)` where web
renders the value, and `nil` where web renders nothing; Kotlin renders `null`.

swiftc warns about exactly this interpolation, but the stub gate does not
surface warnings — the same blind spot that let the `LocalizedStringKey`
locale-formatting bug ship (`Text("\(balance)")` rendering "2 700" for 2700).
Both are "compiles fine, renders wrong, invisible in the counter example
because `Count: 0` exercises neither".

Fixed with a field table in the SHARED inference, so one change serves both
backends with zero emit churn. The test also asserts the guard stays narrow — a
plain signal read and a non-optional field of the same container must not be
wrapped.

One existing test needed correcting, not silencing: it asserted
`toContain('\(loc.latitude)')`, the raw form. Its invariant is in its name —
"reactive fields read BARE (@Observable — no .value rewrite)" — and that still
holds, since the field is read bare and only the interpolation around it
changed. Assertion corrected to the bare-read invariant plus a guard that the
raw form cannot return.
