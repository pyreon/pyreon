---
'@pyreon/native-compiler': patch
---

coolgrid compiled on Kotlin and failed on Swift — the gate was wrong, not the emit.

The capability matrix's HEAVIEST row (Styling & design system, weight 6,
fraction 0.2) noted that `styled()` / `Element` / `coolgrid` / `attrs` "have no
native example at all". Nobody had measured whether they LOWER. Three of the
four do.

`coolgrid`'s Col emits `.frame(maxWidth: .infinity)` — valid SwiftUI that real
device builds accept. But the Swift stub defined ONLY `frame(width:height:)`,
with no flexible-frame overload, so the type gate rejected it with "extra
argument 'maxWidth' in call". A working capability was being reported as broken.

A stub NARROWER than reality manufactures failures — the third instance of that
class in this arc, after the over-strict `PyreonPermissions` init and the
entirely-absent `@AppStorage`. The tell here was the target asymmetry: Kotlin
passed and Swift did not, for source that is correct on both.

The stub now mirrors SwiftUI's real pair of `frame` overloads (fixed and
flexible) rather than approximating one of them.

Also measured, and asserted so the results do not have to be rediscovered:
`Element` and `attrs()` lower cleanly on both targets; `styled()` on a RAW TAG
does not lower and WARNS by name that only a canonical primitive may be wrapped
— disclosed rather than silent, so it is asserted as a warning rather than
treated as a defect.

Bisect-verified: reverting the stub reproduces the exact
`extra argument 'maxWidth' in call`. Full compiler suite 247 files / 2539 tests.
