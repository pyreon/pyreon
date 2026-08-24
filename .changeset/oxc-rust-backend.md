---
'@pyreon/compiler': patch
---

Update the Rust JSX backend's `oxc_*` crates 0.126 → 0.147, closing a 21-minor
skew against the JS backend's `oxc-parser`.

Two AST restructures had to be migrated rather than renamed. `ArrowFunctionExpression`
lost its `expression: bool` field and its body became an `ArrowFunctionBody` enum —
under 0.126 a concise `() => expr` carried a SYNTHETIC `ExpressionStatement`, so
every walker that iterated `body.statements` also visited the expression; under
0.147 there are no statements at all. And `export const x = …` moved out of
`ExportNamedDeclaration` (now specifier-only) into a new `Statement::ExportDeclaration`,
which a statement walker misses silently rather than failing to compile.

Emit is unchanged: the seeded differential fuzz reports 5000 seeds × 3 modes
byte-identical between the JS and Rust backends.
