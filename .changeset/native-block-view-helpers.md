---
'@pyreon/native-compiler': patch
---

Native: a view helper with a BLOCK body now lowers. `const Row = (x: number) => { const label = …; return <Text>{label}</Text> }`, called as `{Row(1)}`, emitted a closure (`private let Row = { x in … }`) that neither `swiftc` nor `kotlinc` accepts — Kotlin dropped the body outright — while every call site rendered nothing. Only the expression-bodied form became a view function. The block body is now planned with the same planner block-bodied render callbacks use, so `const` locals, early-return `if`s, a final view and `return null` lower into `@ViewBuilder func Row(_ x: Int)` / `@Composable fun Row(x: Long)`, at file or component scope. A body with no view-builder shape (a loop, an assignment) keeps its named warning.
