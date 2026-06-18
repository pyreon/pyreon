---
'@pyreon/compiler': patch
---

Fix four JS↔Rust compiler parity gaps in the Rust native backend's
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

4. **Prop-derived const referenced inside an inline event-handler / accessor
   function body.** `const a = props.x; <button onClick={() => send(a)}>` emitted
   `send(a)` (a captured at setup — STALE) on the native path instead of
   `send((props.x))` (live read). Because the dispatcher prefers the native
   backend, production apps shipped the stale-capture form — a real reactivity bug
   contradicting the documented "const-from-props in JSX is reactive" contract.
   Root cause: `accesses_props` returned `false` for ANY arrow/function, so the
   `slice_expr` gate never ran the inliner on a handler. The inliner
   (`collect_prop_derived_idents`) already matched JS once it ran. Added a
   gate-only `fn_body_accesses_props` that descends ONE level into a
   binding-function's body (mirroring JS `accessesProps`'s child-skip: the body is
   descended, NESTED functions stay skipped). The `Arrow|Function => false` arm of
   `accesses_props` is unchanged, so a function appearing as a CHILD
   (`foo(() => send(a))`) stays raw — JS's exact asymmetry.

Output is now byte-identical to the JS backend across all component-definition
shapes (const-arrow, export-const-arrow, function-expression, function-declaration,
export-default-arrow, export-default-function) and for prop-derived reads inside
inline handler/accessor bodies (including the nested-function skip). Verified by
new cross-backend fixtures + ~110 differential-sweep shapes (0 divergences) + full
compiler suite 1588/1588.

KNOWN remaining (documented, not a regression — both pre-date this change): a
prop-derived const referenced inside a SEPARATELY-DECLARED named handler
(`const f = () => send(a); onClick={f}`) or called via a local function in a JSX
expression (`const f = () => i; {f()}`) still captures on the native path. JS
inlines these by registering the function-valued const as prop-derived and either
inlining its value at the binding (`{f}`) or rewriting its declaration (`{f()}`) —
a coupled, larger feature (function-const registration with shadow filtering + a
component-body statement-rewriting pass the native backend does not yet have).
Scoped as a follow-up; the common inline-handler form is the fix that ships here.
