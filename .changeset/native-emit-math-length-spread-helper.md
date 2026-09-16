---
'@pyreon/native-compiler': patch
---

Close four silent-wrong-emit classes in the PMTC emitters: `Math.*` members outside each target's hand-maintained set, `.length` over a component-local helper call, object spread beyond the single override shape, and a JSX-returning helper called as a function.

Each was a set the emitter recognised, a test exercising exactly that set, and nothing at all for everything else — no warning, and on Swift frequently code that compiles and answers wrongly.

- **`Math.*`** — every ECMAScript member now lowers on both targets or is warned by name. Previously Swift emitted `Math.sign / expm1 / log1p / asinh / acosh / atanh / fround / clz32 / imul / random` and every constant but `PI` verbatim (`cannot find 'Math' in scope`); Kotlin left `asinh / acosh / atanh / fround / clz32 / imul` unresolved, mismatched Int arguments on `expm1 / log1p / floor / ceil / round`, and neither target handled the variadic `Math.max(a, b, c)` / `Math.min(…)` / `Math.hypot(a, b, c)` forms.
- **`.length`** — a `function` declared inside a component body had no inferred return type, so the receiver typed `unknown` and Swift emitted `.count` (grapheme clusters) where the web and Kotlin count UTF-16 units: `"a👍b"` answered 3 on iOS and 4 elsewhere. `<For>` row parameters are now typed from `each` for the same reason.
- **Object spread** — `{ ...p }` emitted an empty statement, `{ ...p, z: 5 }` assigned a member that does not exist, `{ ...p, ...q }` emitted Swift's empty tuple `()` (Void, and it compiled), and `{ a: 9, ...p }` was byte-identical to `{ ...p, a: 9 }` although JS answers 1 and 9. Source order is now carried in the IR and the unlowerable shapes are named.
- **JSX helper call** — `{row("a")}` interpolated a View into a string on Swift (compiling, rendering a debug description) and produced an uncompilable call on Kotlin. Now named by target with the element-form remedy.
