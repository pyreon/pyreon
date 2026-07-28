---
'@pyreon/native-compiler': patch
---

`const { store } = useApp()` failed both native targets with zero warnings.

`defineStore` returns `() => StoreApi<T>` and `store` is a real property on that
api, so destructuring it is ordinary, valid web code. On native it lowered to
nothing: the destructured name emitted unbound and both builds failed with
`cannot find 'store' in scope`. The identifier-alias lowering
(`const app = useApp()` → alias `app` → `useApp`) only fires for an Identifier
binding; an ObjectPattern falls straight through.

Warned rather than lowered. The alias map is identifier → hook name, and a
destructured `store` aliases `useApp().store` — a member PATH, not a call — so
supporting it means threading a second alias kind through `parseExpr`. The three
other shapes all work (`useApp().store.x`, `const api = useApp(); api.store.x`,
and the same with an action call), so naming them costs the author one line.

Worth recording how this was found, because it is the counter-example to the
session's usual pattern: the FIRST THREE probes of this surface were my own
errors, not defects. `const s = useApp(); s.n()` and `useApp().n()` both fail on
web too — they skip `.store` — and an earlier probe used a non-shorthand
`return { n, inc: () => … }`, which the compiler correctly warns about. Only
after reading `defineStore`'s actual return type did a real gap appear. A probe
that fails is a hypothesis, not a finding.
