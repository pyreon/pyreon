---
"@pyreon/native-compiler": patch
---

A file-scope numeric const is now fractional evidence for every Int/Double widening pass. `const RATE = 0.5` above a component used to be invisible to `widenFloatSignals`, the struct and inline-object field refinements, the `reduce` seed refinement, the explicit-generic refinement and helper-return inference, so `x.set(x() + RATE)`, `signal<number>(RATE)`, `{ price: P }`, `items.reduce((s, m) => s + m.qty * RATE, 0)`, `function scale(x: number) { return x * RATE }` and `const HALF: number = RATE / 2` all emitted an Int receiving a Double on iOS and/or Android — while the same source with the const inside the component compiled. Also fixed along the way: an integer literal written to a Double signal (`x.set(2)` beside `signal(0.5)`) now emits `2.0` (Kotlin rejected the Int), and Swift now types a `for…of` item and a `reduce` callback's accumulator/element for its Int×Double coercion.
