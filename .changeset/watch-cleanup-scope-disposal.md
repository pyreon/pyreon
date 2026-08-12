---
"@pyreon/reactivity": patch
---

fix(reactivity): `watch` now runs its per-run cleanup on OWNING-SCOPE disposal, not only on stop/re-run

`watch(source, cb)` stored the cleanup returned by its callback in a closure the internal effect never owned, so the effect's `runCleanup` (which fires on re-run AND on `dispose()`) never saw it — the cleanup ran only at the next re-run or when the caller invoked the returned `stop()`. A consumer that discards `stop()` and relies on its owning component scope disposing the effect (the dominant shape) therefore orphaned the cleanup whenever the scope died between re-runs.

Real-world impact: `@pyreon/kinetic`'s `useAnimationEnd` (Transition/Collapse/TransitionItem) added `transitionend`/`animationend` listeners plus a `setTimeout(done, timeout)` (default 5000ms) in the callback and discarded the disposer, so unmounting a component mid-enter-animation left the 5s timer and both listeners pinning the detached subtree and the disposed component's signals until the timer self-fired. Every `watch` consumer that returns a cleanup shared the same latent orphan.

Fix: register the per-run cleanup on the effect via `onCleanup` instead of a closure, so the effect owns it and scope disposal runs it. Behaviour is otherwise preserved — cleanup still runs before each re-run and on `stop()`. Verified across the full reactivity suite (749/749) and every `watch` consumer (kinetic, form, hooks, validate, ui-primitives).
