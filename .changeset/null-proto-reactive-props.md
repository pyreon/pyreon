---
'@pyreon/core': minor
'@pyreon/react-compat': patch
'@pyreon/preact-compat': patch
'@pyreon/vue-compat': patch
'@pyreon/mcp': patch
---

Mount: components that receive a reactive prop are cheaper to set up. `makeReactiveProps` now builds the converted props object with a null prototype. On a plain `{}`, each per-instance getter forced V8 to mint a new hidden class per component; a null-prototype object skips that. The 2,047-component deep-tree mount went from 3.70–3.72 ms to 3.57–3.59 ms (two runs, interleaved arms, disjoint CIs).

**Breaking:** a component that receives ANY reactive (compiler-wrapped) prop now gets a props object with no prototype, so `props.hasOwnProperty(…)`, `props.toString()` and `` `${props}` `` throw or misbehave there. This is inconsistent by design: a component whose props are all static still receives the plain object it was passed, so the same code can work at one call site and fail at another. Use `Object.hasOwn(props, key)` or `key in props`, and `String(props.x)`. Spread, `Object.keys`, `in`, JSON and descriptor copying (`mergeProps` / `splitProps`) are unchanged.

The react, preact and vue compat layers restore `Object.prototype` on the props object once per component instance (in place, so reactive getters stay live), so third-party code written for those frameworks is unaffected. solid- and svelte-compat already pass the component a plain copy. `nativeCompat` components keep the Pyreon semantics.
