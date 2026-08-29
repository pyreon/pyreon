---
'@pyreon/native-compiler': patch
---

A top-level function is classified as a component or a helper by what it
RETURNS, not by the shape of its first parameter.

The classifier used "this function has no parsed props" as its not-a-component
signal, but props are parsed from any object-typed first parameter — and a
helper taking a struct has one. So the same kind of function was classified
differently depending on parameter order:

```ts
layoutBars(values: Double[], plot: Rect)  // → func
hitBar(plot: Rect, x: Double, y: Double)  // → COMPONENT
```

Silently, with no warning. Swift emitted `struct hitBar: View`; Kotlin emitted a
`@Composable` whose parameters were taken from the struct's fields rather than
its own signature, leaving the body referencing names that do not exist. Any
library of functions over structs — geometry, layout, math — was unwritable
depending on how its arguments happened to be ordered.

A component renders (JSX, or `null` for "render nothing"); a helper produces a
value. Nullish returns stay components, so a `return null` render path still
emits `EmptyView()`.
