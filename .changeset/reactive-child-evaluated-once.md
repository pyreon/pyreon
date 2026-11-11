---
'@pyreon/reactivity': patch
'@pyreon/runtime-dom': patch
---

A reactive child whose first value is an element, `null` or an array is evaluated once at mount instead of twice. The value from the call that classifies it is now mounted directly and that call's dependencies are replayed into the binding's effect, so `{() => list().map(…)}` maps once and a compat component body (with its hooks and `useEffect`s) runs once on mount. Effects and `onCleanup`s registered by that call belong to the binding's effect, as before.
