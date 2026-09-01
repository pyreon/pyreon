---
"@pyreon/native-compiler": minor
---

Descending count-loops lower natively: `for (let i = n; i >= 0; i--)` (and `i -= k` with a positive literal step) now emits Swift `stride(from:through:by: -k)` and Kotlin `downTo` instead of warn-dropping the loop body — the shape the charts engine's arc-polygon inner-edge walk uses. The test and update must agree in direction (`i < n; i--` stays a warn-bail), and fractional bounds round with the descending mirror of the ascending rule (exclusive → floor, inclusive → ceil).
