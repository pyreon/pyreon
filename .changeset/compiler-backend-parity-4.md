---
'@pyreon/compiler': patch
---

Fix four places where the two compiler backends disagreed, and where the output lost reactivity or didn't parse.

- A value derived from a prop, through another local, is now reactive inside object-literal methods, higher-order component wrappers, class fields, array elements, ternary branches and `export default` objects. Previously the native backend left the inner local un-inlined and the value stopped updating.
- A component with a defaulted props parameter (`(props = {}) => …`) now binds its props reactively. The JavaScript backend had been baking them in as static values.
- An object key or class member named like a signal (`{ source: 1 }`) is no longer treated as a read of that signal, so static literals are no longer wrapped in a reactive getter.
- A signal written inside an event handler (`i = 2`, `i++`, `a[i] = 1`, `s.value++`, destructuring targets) is no longer called as if it were read. Both backends used to produce output that was a syntax error or wrote to the wrong place.

An expression that starts with an object literal and is then accessed (`{ a: s() }.a`) is now parenthesized, so it no longer parses as a block.
