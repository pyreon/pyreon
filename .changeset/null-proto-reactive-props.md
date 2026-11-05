---
'@pyreon/core': patch
---

Mount: components that receive a reactive prop are cheaper to set up. `makeReactiveProps` now builds the converted props object with a null prototype. On a plain `{}`, each per-instance getter forced V8 to mint a new hidden class per component; a null-prototype object skips that. The 2,047-component deep-tree mount went from 3.70–3.72 ms to 3.57–3.59 ms (two runs, interleaved arms, disjoint CIs).

Visible change: on such a component, `props.hasOwnProperty` and `props.toString` are undefined. Use `Object.hasOwn(props, key)`, `key in props`, or `String(props.x)`. Spread, `Object.keys`, `in` and JSON are unchanged.
