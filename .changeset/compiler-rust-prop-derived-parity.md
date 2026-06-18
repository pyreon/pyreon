---
'@pyreon/compiler': patch
---

Fix three JS↔Rust compiler parity gaps in the Rust native backend's
prop-derived / component-body handling (all surfaced by differential testing,
each bisect-verified + locked with cross-backend equivalence fixtures):

1. **Transitive prop-derived inlining** in arrow / function-expression
   components. `const a = props.x; const b = a + 1; return <div>{b}</div>` emitted
   `(a + 1)` on the native path (a captured, reactivity LOST) instead of
   `((props.x) + 1)`. Root cause: `find_init_expression_by_span` never descended
   into the component's arrow/function-expression body, so the recursive resolver
   fell back to raw source. Added `find_init_in_expression` descent.
   (Function-DECLARATION components masked it — their body was already descended.)

2. **Function-EXPRESSION components** (`const C = function (props) { … }`) had
   their props baked STATIC (the walk arm deliberately skipped props registration)
   — now registered reactive like arrow + function-declaration components.

3. **Default-exported arrow components** (`export default (props) => { … }`) hit
   the same transitive gap — the `ExportDefaultDeclaration` span-lookup arm only
   descended into `FunctionDeclaration`; now descends into a default-exported
   arrow/function expression too.

Output is now byte-identical to the JS backend across all component-definition
shapes (const-arrow, export-const-arrow, function-expression, function-declaration,
export-default-arrow, export-default-function). Verified by new cross-backend
fixtures + ~110 differential-sweep shapes (0 divergences) + full compiler suite
1579/1579.
