---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

The early-exit null-check narrowing (`if (v === null) continue; use(v)` → Swift `guard let v else { continue }`) now applies in every statement list: loop bodies, `switch` cases, `onMount` bodies and closure bodies, not only function bodies and `if` branches. A local declared inside a nested list is now typed, and a `for … of` item carries its element type on both targets, so the guard can see that the value is optional. Kotlin binds a mutable member subject the same way inside a loop (`val tags = b.tags ?: run { continue }`).

Also, an integer literal beside a nullable or `Double`-aliased value now emits as a Double on Kotlin: `fmt(1)` for a `Double | null` parameter emits `fmt(1.0)` (was `1L`), and `x === 0` with `x: Double` emits `x == 0.0` (was `x == 0L`). Both were kotlinc type errors.

The generated native chart engine is regenerated with the new emit: Swift `rectCmd` binds its optional `grad`/`corners` with `guard let`, a band annotation's optional label is bound before use on both targets, a single-axis tick label prints a whole number without a trailing `.0` on Android, and a time-tick guard compares `target <= 0.0`.

Part of #3956.
