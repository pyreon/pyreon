---
'@pyreon/native-compiler': patch
---

The Swift gate REJECTED valid i18n source — a stub that was stricter than the runtime.

`createI18n({ locale, messages })` — the two-argument form the docs show, and the
common case — failed the required `Validate emitted Swift + Kotlin` gate with:

    error: missing argument for parameter 'fallbackLocale' in call

The source was fine and the emit was fine. The STUB was wrong: it declared
`fallbackLocale: String` (required) while the real `PyreonI18n` declares
`fallbackLocale: String? = nil`. Two of the three legal call shapes were
rejected; only the one that happened to pass a fallback got through.

TARGET ASYMMETRY WAS THE DIAGNOSTIC. Kotlin's stub already had
`val fallbackLocale: String? = null` and accepted the identical source. When one
target rejects what the other accepts, the gate is the first suspect, not the
emit — the same reasoning that found the coolgrid `frame` stub.

Both drift directions are now locked in `stub-runtime-drift.test.ts`, which
previously covered only one of them. Every existing assertion there checks
REAL-RUNTIME ↔ EMIT ("the signature the emit depends on still exists
upstream"). Nothing checked STUB ↔ REAL, and that gap admits two opposite
failures:

    stub is a SUPERSET  → gate accepts an emit the real runtime rejects
                          (green PR, broken app — the masking direction)
    stub is a SUBSET    → gate rejects an emit the real runtime accepts
                          (valid source, failing build — this bug)

The new locks assert DEFAULTED-ness specifically, on both targets, because that
is the property that decides whether a call site is legal and it is invisible to
a "does the symbol exist" check.

Bisect-verified: reverting the stub fails the lock with
`expected … to contain 'fallbackLocale: String? = nil'`, and reproduces the real
symptom — 2 of 3 valid call shapes rejected by swiftc. Restored, 12/12 pass and
all three shapes typecheck on both targets.
