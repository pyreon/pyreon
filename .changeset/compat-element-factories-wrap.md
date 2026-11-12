---
'@pyreon/vue-compat': minor
'@pyreon/react-compat': patch
'@pyreon/preact-compat': patch
---

Components built through a compat layer's element factory now get the same compat wrapper as JSX-written ones. vue-compat: a stateful root mounted with `createApp(Root).mount(el)` re-renders on state change, and `h(Comp)` builds the wrapped component (so its lifecycle callbacks run on the compat schedule, a microtask after render, as through JSX). react-compat `createElement` / `h` and preact-compat `h` / `createElement` no longer throw "Hook called outside of a component render" for a hook-using component. vue-compat's `Teleport`, `KeepAlive`, `Transition` and `TransitionGroup` are marked `nativeCompat`, so `<KeepAlive>` and `<TransitionGroup>` render their children.
