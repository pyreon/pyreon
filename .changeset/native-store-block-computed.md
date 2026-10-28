---
'@pyreon/store': minor
---

A block-body `computed` inside a `defineStore` setup now lowers to native code instead of bailing the whole store. `computed(() => { const xs = tasks(); if (filter() === 'done') return xs.filter(…); return xs })` emits a multi-statement getter on the store singleton (Swift `var visible: [Task] { … }`, Kotlin `val visible: List<Task> get() { … }`), parsed and emitted through the same statement IR and statement emitter a component computed and a store method already use. A single-return block keeps the compact getter. An explicit `computed<T>(…)` types the getter when the return cannot be inferred; when it can't and there is no annotation, the emit warns by name and asks for one. Shapes that still cannot lower warn by name: a computed whose argument is a reference rather than an inline arrow, a parameterised computed, and a block body that never returns a value.
