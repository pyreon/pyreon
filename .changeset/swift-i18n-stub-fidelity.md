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

SECOND INSTANCE, found the same way and fixed here too: `<Image>`.

`ImageProps.fit` defaults to `"cover"`, which lowers to `.scaledToFill()`. The
stub had the sibling `.scaledToFit()` but NOT `.scaledToFill()`, so every plain
`<Image src alt />` — the most common usage of a canonical primitive — failed
the required Swift gate on valid SwiftUI. Only `fit="contain"` (scaledToFit) and
`fit="none"` (no modifier) got through; `cover`, `fill` and the default all
failed. Kotlin accepted the identical source, the same diagnostic as above.

Found while sweeping all fifteen canonical primitives' props against both
targets — the highest-blast-radius surface there is, since a broken primitive
affects every app. Worth recording that the sweep otherwise came back clean:
Stack gap/padding/align/justify, Inline, Text weight/size/color, Heading, Button
disabled/variant, Icon, Spacer, Scroll, Layer, Field, Toggle, Press onLongPress,
Link and `accessibilityLabel` all compile on both targets.

One correction to my own probe, recorded because it nearly became a false bug
report: `<Toggle checked>` fails on both targets, but `ToggleProps` is
`{ value, onChange, disabled? }` — there is no `checked` prop. With the real
props it compiles fine on both (`Toggle(_:isOn:)` / `Switch(checked=…)`). I had
guessed the prop name instead of reading the type. The residual — an UNKNOWN
prop emits uncompilable output with no warning — is real but low severity: the
build fails loudly and names the prop, and TypeScript rejects it on web.

THIRD INSTANCE, and the one that turned a hand-found bug into a class-level
guard: `useLoaderData`.

`router-swift/Hooks.swift` declares THREE public hooks; the stub had two. So
`const d = useLoaderData<U>()` — a shipped Phase-B6 feature — failed the
required gate with "cannot find 'useLoaderData' in scope" on a valid emit, while
Kotlin accepted it.

Three subset-stub bugs found by hand in one arc, each surfacing only when
someone happened to write the affected shape, is a pattern rather than three
coincidences. The router hooks are a CLOSED SET declared in one file, so the
drift test now enforces PARITY over the whole set instead of asserting hooks
one at a time. A fourth omission fails with `stub is missing router hook(s):
<name>` rather than a swiftc error buried in a CI log. The parity test also
guards itself — a regex that matched nothing would make it vacuously green,
which is exactly the failure mode it exists to prevent.

The `useParams` and `useLoaderData` WARNINGS were checked rather than assumed:
`useParams` advises destructuring (`const { id } = useParams()`), and that
advised form compiles on both targets. A warning that recommends a broken fix
would be worse than no warning.

