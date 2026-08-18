---
'@pyreon/native-compiler': patch
---

PMTC: stop telling authors `withField` has no native lowering — it does

Importing `withField` from `@pyreon/validate` printed:

> `withField` (from `@pyreon/validate`) has NO native lowering — it is
> reproduced verbatim in the emitted Swift/Kotlin, where no such symbol
> exists, so the native build fails with "cannot find 'withField' in scope".

directly above the `PyreonFieldMeta_*` struct the same compile had just
emitted. A top-level `const X = withField(schema, { label: '…' })` has lowered
since the Tier-2 validate emit landed, and `tier2-validate-emit.test.ts` locks
that struct on both targets — but `withField` was never added to the
suppression list its siblings (`s`, the `@pyreon/validation` adapters,
`PermissionsProvider`) are all on.

So the diagnostic told authors a working API was unusable and pointed them at a
`<Web>` escape hatch they did not need. That is the same stale-blanket-warning
class as the `@pyreon/toast` entry, and the direction
`native-audit-warnings.test.ts` already calls out as the more damaging one.

The suppression is conditional, not a blanket exemption. When nothing lowers —
a non-literal meta object, a meta object with no string-valued entries, or an
import with no top-level declaration at all — the warning is accurate and still
fires. And when one declaration lowers while a sibling does not, the blanket
line is suppressed but the precise per-declaration diagnostic (naming the
binding and the reason) still fires, so nothing is silently dropped.

`warnUnloweredPyreonModules` runs before the top-level recognizer, so the
decision comes from a syntactic pre-pass. To keep the two from drifting apart,
the recognizer's structural match and its meta extraction are now shared
helpers that both callers use, rather than a hand-copied predicate.
