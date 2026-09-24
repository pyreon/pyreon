---
'@pyreon/reactivity': minor
'@pyreon/core': minor
'@pyreon/sync': patch
---

`onCleanup()` called synchronously in a component body now belongs to that component: it runs exactly once, when the component unmounts. Previously it only registered while an effect run was open, so a root-mounted component's setup-time cleanups never ran (listeners, sockets and watches leaked), and a component mounted inside `<For>` / `<Show>` / a routed page handed its cleanups to that boundary's effect, whose re-runs fired them while the component was still mounted (adding a `<For>` row tore down the listeners of every existing row).

`EffectScope.runInScope(fn)` now owns `onCleanup()` calls made in `fn` the same way, running them on `stop()`. This also makes `onCleanup()` inside `onMount()` run on unmount (it was silently dropped), and keeps a store first created inside a component from handing its setup cleanups to that component.

Behaviour change: code that relied on setup-time `onCleanup` never firing will now see it fire on unmount. `onCleanup` inside `effect()` is unchanged.
