---
'@pyreon/compiler': patch
---

Fix a JS↔Rust compiler parity gap: a prop-derived const read inside an inline
event-handler / accessor function body was captured (stale) on the Rust native
backend instead of inlined to the live prop source.

`const a = props.x; <button onClick={() => send(a)}>` emitted `send(a)` on the
native path (a captured at component setup — STALE) instead of `send((props.x))`
(re-reads the live prop on each invocation). Because the dispatcher prefers the
native backend, production apps shipped the stale-capture form — a real
reactivity bug against the documented "const-from-props in JSX is reactive"
contract. The JS backend already inlined correctly.

Root cause: `accesses_props` returned `false` for ANY arrow/function, so the
`slice_expr` gate never ran the inliner on a handler binding. The inliner
(`collect_prop_derived_idents`) already matched JS once it ran. Added a
gate-only `fn_body_accesses_props` that descends ONE level into a
binding-function's body, mirroring JS `accessesProps`'s child-skip asymmetry:
the body is descended, but NESTED functions stay skipped — so a function
appearing as a CHILD (`foo(() => send(a))`) stays raw, exactly as JS. The
`Arrow|Function => false` arm of `accesses_props` is unchanged.

Bisect-verified (neutralizing the gate addition fails exactly the 4 "should
inline" fixtures while the 5 "stays raw" fixtures keep passing; restored → all
pass). Full compiler suite 1588/1588, 3 differential sweeps (108 shapes)
0 divergences, typecheck clean, no cargo warnings.

KNOWN remaining (documented, not a regression — both pre-date this change): a
prop-derived const referenced inside a SEPARATELY-DECLARED named handler
(`const f = () => send(a); onClick={f}`) or called via a local function in a JSX
expression (`const f = () => i; {f()}`) still captures on the native path. JS
inlines these by registering the function-valued const as prop-derived and
either inlining its value at the binding (`{f}`) or rewriting its declaration
(`{f()}`) — a coupled, larger feature (function-const registration with shadow
filtering + a component-body statement-rewriting pass the native backend does
not yet have). Scoped as a follow-up; the common inline-handler form ships here.
