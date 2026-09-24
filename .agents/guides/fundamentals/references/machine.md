# @pyreon/machine

- `createMachine({ initial, states })`: `machine()` reads the state; `machine.send(event, payload?)` returns the settled state. Also `matches`, `can`, `nextEvents`, `isFinal`.
- Guards: `{ target, guard }`. A throwing guard denies. `can()` predicts `send()` exactly.
- Eventless `always` transitions fire synchronously and cascade; a self-loop throws after 1000 steps.
- Final states with `onDone`; lifecycle hooks `onEnter`, `onExit`, `onTransition`.
- Type helpers `StateOf`/`EventOf` work on an instance or a config (`InferStates`/`InferEvents` are config-only and yield `never` on an instance).
- Out of scope compared with XState (use signals/effects instead): context, invoked actors, hierarchical/parallel states, delayed `after`.
