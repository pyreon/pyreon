---
'@pyreon/compiler': patch
'@pyreon/core': patch
'@pyreon/runtime-dom': patch
---

Reactive props reach the signal's DIRECT tier. `<Row value={sig()} />` used to
lower to `_rp(() => sig())`, an opaque thunk, and the row's `{props.value}` to
`bindPolymorphicText(() => props.value)` — a tracked effect whose teardown is a
hashed `Set.delete`. The dispose-500 ablation ladder measured that wrapper at
roughly half the residual over Solid: with the prop holding the signal itself,
the text bind's share of the teardown drops from ~31µs to ~11µs per 500 rows.

Now a BARE signal/computed call as a component prop lowers to `_rpd(sig)`
(`@pyreon/core`): a `REACTIVE_PROP`-branded thunk that also carries the
signal's `.direct` / `._v` / `.peek`, re-targeted to the signal. A prop READ in
a template text child lowers to `_bindProp(props, "key", node, parent)`
(`@pyreon/runtime-dom`), which binds through the prop's GETTER — the thunk
`makeReactiveProps` installed — and takes `_bindText`'s direct tier when the
getter carries `.direct`, falling back to the tracked polymorphic path for any
other getter or a plain data property. Value semantics are unchanged on every
path (the getter's value, re-rendered on change; VNode values still upgrade to
a subtree mount); the signal itself is never branded. Both compiler backends,
byte-identical. Anything that is not exactly a bare call (`sig() + 1`,
`String(sig())`, a shadowed name) keeps `_rp`; a deeper read (`props.a.b`)
keeps `bindPolymorphicText`.
