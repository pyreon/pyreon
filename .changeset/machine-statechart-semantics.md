---
'@pyreon/machine': minor
---

Complete the core statechart semantics that fit `@pyreon/machine`'s constrained-signal philosophy (the synchronous transition-logic features XState has — not the data/async features Pyreon deliberately offloads to signals/effects):

- **Eventless (`always`) transitions** — `states.X.always: target | { target, guard } | [...]` fire synchronously on entering a state (and for the initial state at creation / on `reset()`), cascading until none apply; first unguarded entry or first passing guard wins. Guards receive no payload (read external signals). Models transient/condition states (`check → pass | fail`) that are never observed by `machine()`. A self-looping `always` throws after 1000 steps.
- **Final states** — `states.X.final: true` + reactive `machine.isFinal()` + `machine.onDone(cb)` (fires with the triggering event when a final state is entered, including via an `always` cascade).
- **`onExit(state, cb)`** — exit listeners, completing the lifecycle set (`onEnter` / `onExit` / `onTransition` / `onDone`). On each transition they fire in state-chart order: `onExit(from)` (machine still reads `from`) → `onTransition` → `onEnter(to)` → `onDone` if final. Pairs with `onEnter` for per-state setup/teardown (the idiomatic delayed-transition pattern — no built-in `after`, by design).
- **`can(event, payload?)`** — now precise when given a payload (evaluates the guard, predicting `send` exactly). Without a payload a guarded event still reports `true` (backward-compatible).

Also fixes `InferEvents` to robustly union event names across heterogeneous state shapes (states with only `always`/`final` and no `on` no longer collapse the inference to `never`).

Deliberately out of scope (offloaded to Pyreon primitives, per the package's stated philosophy): extended-state/context → signals; invoked actors/services → effects+signals; hierarchical/parallel states → compose machines; delayed `after` → `onEnter`+timer+`onExit`. The package remains "a constrained signal with statechart transition semantics," not an XState clone. Backward-compatible: all pre-existing tests pass unchanged.
