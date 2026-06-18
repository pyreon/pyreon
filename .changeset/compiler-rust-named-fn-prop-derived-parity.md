---
'@pyreon/compiler': patch
---

Close the two remaining JS↔Rust compiler parity gaps for prop-derived consts
read inside SEPARATELY-DECLARED functions on the Rust native backend (the
inline-handler form was fixed separately). The native backend captured (stale)
where the JS backend inlined to the live prop source — and since the dispatcher
prefers native, production apps shipped the stale form, a reactivity bug against
the documented "const-from-props in JSX is reactive" contract.

1. **Named handler / accessor reference** — `const f = () => send(a); onClick={f}`
   emitted `__ev_click = f` (closing over the stale captured `a`) instead of
   inlining `(() => send((props.x)))`. Root cause: `references_prop_derived` /
   `reads_from_props` had `_ => false` arms for arrow/function inits, so a
   function-valued const whose body read a prop-derived var (or props directly)
   never registered as prop-derived. Fix: a generic membership-only body walk
   (`fn_body_any_expr` + `stmt_any_expr`) in both registration helpers — matching
   JS, which descends into function bodies via `forEachChildFast` with NO shadow
   filter and NO nested-function skip (the precise shadow-aware substitution is
   the inliner's job).

2. **Local function called in a JSX expression** — `const f = () => i; {f()}`
   emitted `_bindText(f, node)` (binding the stale `f`) instead of
   `_bindText((() => (props.start)), node)`. The `{f()}` nullary-call fast path
   (`try_direct_signal_ref`) raw-sliced the callee to avoid auto-calling signals;
   for a prop-derived `f` it now resolves the callee via `slice_expr` (inlines the
   value, no auto-call since `f` is not a signal).

Edges verified byte-identical: a function reading props directly
(`const f = () => props.x`) registers + inlines; a function locally shadowing a
prop-derived name is over-registered exactly like JS (the inliner then leaves the
shadowed name alone); a function reading neither stays a raw `f` reference.

Verification: bisect-verified (neutralizing the registration + nullary-call
changes fails exactly the 7 "should inline" fixtures while the "stays raw" fixture
keeps passing; restored → all pass). Full compiler suite 1596/1596; a 370-check
differential audit across ~18 syntactic categories × CSR + SSR + reactivity-lens
span parity, plus 108 differential-sweep shapes — 0 divergences of any kind.
typecheck clean, no cargo warnings. With this, there are NO known remaining
JS↔Rust prop-derived parity gaps.
