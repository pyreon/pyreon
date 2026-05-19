---
'@pyreon/reactivity': minor
'@pyreon/runtime-dom': minor
---

Reactive devtools bridge — an opt-in, leak-free introspection layer over
the live signal / computed / effect graph.

`@pyreon/reactivity` gains `activateReactiveDevtools()` /
`deactivateReactiveDevtools()` / `isReactiveDevtoolsActive()` /
`getReactiveGraph()` / `getReactiveFires()` (+ `ReactiveNode` /
`ReactiveEdge` / `ReactiveGraph` / `ReactiveFire` types). It tracks the
live reactive graph (nodes + dependency edges, derived fresh from the
real subscriber Sets) and a bounded fire timeline.

`@pyreon/runtime-dom` exposes it on `window.__PYREON_DEVTOOLS__.reactive`
(`activate` / `deactivate` / `getGraph` / `getFires`), powering the
`@pyreon/devtools` Signals / Graph / Effects / Console surfaces.

Zero cost until a devtools client attaches: every instrumentation entry
point early-returns on `!active`, sits inside the existing
`process.env.NODE_ENV !== 'production'` gate (fully tree-shaken in
production — verified by a minified-bundle regression test), and never
retains a signal/computed/effect (WeakRef + FinalizationRegistry; the
fire buffer holds only ids + timestamps). No behavior change when
inactive (the default).
