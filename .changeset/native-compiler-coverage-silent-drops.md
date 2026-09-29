---
'@pyreon/native-compiler': patch
---

Fix a set of silent wrong-emit and silent-drop shapes found while restoring the package's coverage floor:

- A `number` truthiness test on an optional value (`if (count)` where `count?: number`) emitted `x?.toDouble() != 0.0 == true` on Kotlin, which reads an ABSENT value as truthy. It now coalesces to 0 first, matching JS and the Swift emit.
- A view helper passed by reference into a render slot that takes more parameters than the helper declares now pads the closure on Swift (`{ a0, _ in cell(a0) }`) instead of emitting an arity error.
- Optional narrowing through a `switch` now rewrites the DISCRIMINANT as well as the cases, so `switch (x.kind)` inside a narrowed branch reads the unwrapped binding.
- A non-literal chart `labelRich` now names the field in a warning on both targets instead of emitting an empty view with no diagnostic.
- `<OptionChart>` `parallelAxis` with a gap in `dim` numbering (`axes[2]` set, `axes[1]` never) crashed the emitter (`Array.prototype.some` skips holes); it now warns and emits nothing.
- A single-axis datum written `{ value: 3 }` is read from `value`, and single-axis `points` literals lower to the engine's typed `SingleAxisPoint` rows.
- A destructuring declarator inside a multi-declarator `const` (`const n = 1, { b } = o`) and a destructuring declaration in an un-braced `if`/`switch` body were dropped with no warning; the first now lowers like a lone destructure, the second warns by name.
- A deep qualified type name (`A.B.C`) rendered as `.C`.
- A numeric object key (`{ 1: 'a' }`), a namespaced JSX attribute (`xml:lang`, which crashed the transform), and a spread JSX child (`{...items}`) now warn by name instead of vanishing.
- `attrs()` / `rocketstyle()` configs no longer read a COMPUTED key (`{ [component]: X }`) as the literal `component`.
