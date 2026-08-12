---
"@pyreon/machine": patch
---

fix(machine): reject non-existent transition targets at construction; batch the `always` cascade so reactive readers never see a transient state

- **A non-existent / typo'd transition target used to silently corrupt the machine.** `resolveTransition`/`resolveAlways` returned the target without checking it exists, so `send('GO')` into a typo'd `'lodaing'` set the state there — `matches(...)` false for every real state, `nextEvents()` empty, every subsequent `send()` a no-op — permanently stuck, with no error (TS doesn't F-bound targets to `keyof states`, so it compiles clean; JS consumers have no protection at all). Every `on` / `always` / guarded target is now validated at `createMachine(...)` and throws like an invalid `initial` does.
- **The `send`/`reset`/creation `always` cascade wasn't batched**, so a reactive reader (`effect`/`computed` on `machine()`) re-ran once per intermediate `always` step and observed the transient state — contradicting the manifest's documented "a transient state is never observed by reactive readers". The mutation + cascade are now wrapped in `batch()`; a subscriber settles on the final state, while the per-step `onEnter`/`onExit`/`onTransition` imperative callbacks still fire per step.
- **Documented a `reset()` gotcha** (JSDoc): `reset()` sets the state directly and deliberately does NOT fire `onExit(current)` / `onEnter(initial)`, so a resource acquired in `onEnter` and released in `onExit` (the "timer on enter, clear on exit" pattern) is not torn down by `reset()` — clean it up explicitly first. (Behavior unchanged — an existing test locks this contract.)

Bisect-verified (target-validation throws; effect never observes the transient). Full `@pyreon/machine` suite (132) green.
