---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
'@pyreon/charts': patch
---

Emitted Swift and Kotlin compile without warnings, and an indexed read the code tests for absence no longer traps natively.

- **Behaviour fix:** `const s = xs[i]; if (s === undefined) return …`, `xs[i] ?? d`, `xs[i] === undefined` and `xs[i]?.x` on an array now read bounds-checked on both targets (`xs.indices.contains(i) ? xs[i] : nil` or the new runtime helper `pyreonAt(xs, i)` on Swift, `xs.getOrNull(i)` on Kotlin). Before, the native subscript trapped out of range before the guard ran, where the web took the guarded path; the dead guard showed up as "comparing non-optional value to 'nil' always returns false". A compound guard `if (v === undefined || !ok(v)) continue` narrows `v` for the rest of the block.
- `Number(n)` over a number is the documented int→double conversion: `Double(n)` / `(n).toDouble()` over an integer, the identity over a Double. Before it fell into the string lowering (`(Double(n) ?? 0)` on Swift, a compile error on Kotlin).
- `NaN`, `Infinity` and `Number.NaN` / `POSITIVE_INFINITY` / `NEGATIVE_INFINITY` / `MAX_VALUE` / `MIN_VALUE` / `EPSILON` lower to the Double constants; they used to be emitted verbatim and failed to compile.
- Warnings removed from every emit: an unused loop variable is bound as `_` (Swift); a `const` is no longer emitted `var` because a same-named binding elsewhere was reassigned (mutability is now resolved through block scopes); a keyword argument label is written bare (`Mark(repeat: true)`); Kotlin no longer converts a value already known to be a Double or Long (`.toDouble()` / `.toLong()`), and `x ?? null` emits `x`.
- Inference: calls through a function-typed parameter or an annotated local arrow, a `let x: Double` declared without an initializer, a ternary of a struct and an object literal of that struct, annotated arrow parameters, and `Math.abs` / `min` / `max` over `Double`-alias values are now typed.
- The generated chart engine is regenerated with all of the above (and its counting loops replaced by `Number(n)`); `PyreonChartCanvas.swift` uses the two-parameter `onChange(of:)`. The Swift runtime packages build and the generated Kotlin engine compiles with zero warnings, locked by `native-chart-engine-generated.test.ts`.
