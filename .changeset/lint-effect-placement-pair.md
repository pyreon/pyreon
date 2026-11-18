---
'@pyreon/lint': patch
---

`no-effect-in-mount` no longer reports an `effect()` inside `onMount` whose body does imperative work (DOM, browser globals, IO, timers): that is where `no-imperative-effect-on-create` sends such an effect, and the two rules used to reject each other's fix. Both rules now use one detector, so every effect is accepted in exactly one placement. `no-imperative-effect-on-create`'s message now separates one-shot work (plain `onMount`), re-running work (`onMount(() => { effect(...) })`) and `document.title` (`useHead`).
