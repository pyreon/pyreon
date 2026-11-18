---
'@pyreon/reactivity': patch
'@pyreon/runtime-server': patch
'@pyreon/store': patch
---

Server rendering no longer leaks the effects and computeds components create. A server render never mounts, so an `effect()` or `computed()` created during SSR had no owner and was never disposed: each one reading a signal that outlives the request (module state, `systemColorMode()` under `<ColorModeProvider mode="system">`) kept a subscriber and everything its closure held, per request, forever. The request now owns them and disposes them when it ends (a bare render when it finishes, `runWithRequestContext` when its callback settles, a stream when it closes, errors or is cancelled). Stores created during a request are disposed with it too, so a store setup effect over shared state no longer accumulates.
