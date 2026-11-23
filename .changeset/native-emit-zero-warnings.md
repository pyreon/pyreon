---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
'@pyreon/charts': patch
---

Emitted Swift and Kotlin compile without warnings, and an indexed read the code tests for absence no longer traps natively.

- **Behaviour fix:** `xs[i] ?? d`, `xs[i] === undefined` and `xs[i]?.x` on an array now read bounds-checked on both targets (`xs.indices.contains(i) ? xs[i] : nil` or the new runtime helper `pyreonAt(xs, i)` on Swift, `xs.getOrNull(i)` on Kotlin), so the guard runs instead of the subscript trapping first. A NUMBER index is absent unless whole and in range (`xs[0.5]`, `xs[NaN]`, `xs[Infinity]`), as on the web. A local `const v = xs[i]` tested later becomes optional only when every use of that binding (resolved by scope) is an absence test or flow-narrowed (an early-exit guard, `if (v !== undefined)`, the matching ternary branch); `let v = xs[i]; if (v === undefined) v = d` folds to `xs[i] ?? d`; any other use keeps the plain read it compiled to before and gets a named warning.
- `Number(n)` over a number is the documented int→double conversion: `Double(n)` / `(n).toDouble()` over an integer, the identity over a Double. Before it fell into the string lowering (`(Double(n) ?? 0)` on Swift, a compile error on Kotlin).
- `NaN`, `Infinity` and `Number.NaN` / `POSITIVE_INFINITY` / `NEGATIVE_INFINITY` / `MAX_VALUE` / `MIN_VALUE` / `EPSILON` lower to the Double constants; they used to be emitted verbatim and failed to compile.
- Warnings removed from every emit: an unused loop variable is bound as `_` (Swift); a `const` is no longer emitted `var` because a same-named binding elsewhere was reassigned (mutability is now resolved through block scopes); a keyword argument label is written bare (`Mark(repeat: true)`); Kotlin no longer converts a value already known to be a Double or Long (`.toDouble()` / `.toLong()`).
- Integer arithmetic in a callback whose parameters are now typed goes through the overflow-safe helpers, as integer arithmetic elsewhere already did (`x * 2` → `pyreonMul(x, 2)` in, for example, `xs.map((x: number) => x * 2)`).
- `x ?? null` over a non-optional `x` emits `Optional(x)` on Swift and `x` on Kotlin (a declared optional type is kept: `val m: String? = n`).
- Number formatting follows the web where a value's type was a `Double` alias or narrowed in a ternary: `String(v === undefined ? 0 : v)`, templates and `+` concatenation print `2`, not `2.0` (several generated chart-engine labels included).
- Swift: `v === undefined ? v : f(v)` where `f` returns an optional no longer turns `f`'s own `undefined` into `v`.
- Kotlin: a top-level function passed as a value is a function reference (`::measure`).
- Swift: a `try` whose body cannot throw drops its unreachable `catch`.
- A warning for a tested indexed read that stays a plain subscript names the file and line, one per binding.
- Inference: calls through a function-typed parameter or an annotated local arrow, a `let x: Double` declared without an initializer, a ternary of a struct and an object literal of that struct, annotated arrow parameters, and `Math.abs` / `min` / `max` over `Double`-alias values are now typed.
- The generated chart engine is regenerated with all of the above (and its counting loops replaced by `Number(n)`); `PyreonChartCanvas.swift` uses the two-parameter `onChange(of:)`. The Swift runtime packages build and the generated Kotlin engine compiles with zero warnings, locked by `native-chart-engine-generated.test.ts` (kotlinc's CLI does not report unused or never-mutated variables, so the Kotlin side covers what kotlinc reports); the engine functions whose source changed run the same on the web, Swift and Kotlin (`native-chart-engine-execution-parity.test.ts`).
