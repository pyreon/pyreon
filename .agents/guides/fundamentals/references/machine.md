# @pyreon/machine

- **@pyreon/machine**: `createMachine({ initial, states })` — `machine()` reads, `machine.send(event, payload?)` returns settled state, `matches`/`can`/`nextEvents`/`isFinal`. Guards `{ target, guard }` (throw-safe → denied); `can()` predicts `send()` exactly. Eventless `always` transitions (fire synchronously, cascade, self-loop throws after 1000). Final states + `onDone`; lifecycle `onEnter`/`onExit`/`onTransition`. Out of scope vs XState (offloaded to signals/effects): context, invoked actors, hierarchical/parallel states, delayed `after`.
