---
'@pyreon/compiler': patch
---

Native (Rust) backend brought to 1:1 with the JS backend for the two
prop-derived/element-child fixes #686 landed on the JS side only. Without
this, the production-preferred native backend silently diverged.

- R7 — prop-derived inlining inside callback-nested JSX. `collect_prop_derived_idents`
  (native/src/lib.rs) had empty `Arrow|FunctionExpression => {}` arms and no
  JSX arm, so it never descended into a `.map(i => <li class={cls}/>)`
  callback body: `const cls = props.t; items.map(i => <li class={cls}/>)` kept
  `class={cls}` (const frozen at first render → reactivity SILENTLY LOST in
  real builds) while the JS backend inlined `class={(props.t)}`. Fixed: the
  arrow/function arms recurse into the body (concise + block) and JSX, with a
  `pd_minus` scope filter that removes names a scope binds (params / nested
  const-let / catch / loop) — byte-equivalent to the JS pass's scope-aware
  enter/leave set, so recursing does NOT reintroduce the shadowing-param
  clobber.

- R9 — element-valued binding as a bare JSX child. The JS backend (via #686)
  mounts `const h=<h1/>; <div>{h}</div>` through `_mountSlot`; the native
  backend still text-coerced it to `createTextNode(h)` ("[object Object]").
  Fixed: the native backend tracks element-valued `const`/`let` bindings and
  routes a bare `{h}` child through `_mountSlot`, mirroring the JS path.

No public API change; new cross-backend parity test only. native-equivalence
suite 244/244 (unchanged), full compiler suite green, all three mechanisms
bisect-verified (revert -> fail with the right error -> restore -> pass).

Known orthogonal limitation (pre-existing, NOT introduced here, NOT a
correctness bug): `{localArrowConst()}` whose body shadows via catch /
nested-const emits different but both semantically-correct representations
(JS inlines the arrow body; Rust binds the function reference). Outside the
native-equivalence contract and out of scope; disclosed for honesty.
